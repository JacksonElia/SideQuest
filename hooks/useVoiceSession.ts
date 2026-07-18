"use client";

/**
 * The browser half of the voice conversation.
 *
 * Ports the flow proven in public/livekit-test.html: mint a session, join the
 * room, publish the microphone, play the agent back, and keep the agent's idea
 * of the traveler's position current as they walk.
 *
 * One room spans both the planning and active screens on purpose — the agent
 * changes mode by itself, so tearing the connection down between screens would
 * restart the conversation and lose everything it had learned.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConnectionState,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type TrackPublication,
} from "livekit-client";
import {
  encodeLocationAttributes,
  shouldPublishFix,
  type TimedFix,
} from "@/lib/server/location";
import type { LocationCoordinates, Message, TravelProfile } from "@/types/message";

export type VoiceStatus = "idle" | "connecting" | "connected" | "error";

/**
 * Fine-grained signals for debugging a silent microphone. `status` collapses
 * everything into four coarse states, which makes a dead mic look identical to
 * a working one — these separate "we never published audio" from "the agent
 * never joined" from "the server hears nothing".
 */
export interface VoiceDiagnostics {
  /** Live LiveKit connection state, more granular than `status`. */
  connectionState: ConnectionState;
  /** True once a local microphone track is actually published to the room. */
  micPublished: boolean;
  /** getUserMedia-level failure, e.g. "NotAllowedError: Permission denied". */
  micDeviceError: string | null;
  /** Local input RMS, 0..1, sampled ~10x/s. Moving means the mic hardware works. */
  micLevel: number;
  /** True while the server counts US among active speakers — proof audio arrives. */
  userSpeaking: boolean;
  /** True while any remote participant (the agent worker) is in the room. */
  agentPresent: boolean;
  /**
   * The worker's own pipeline state (lk.agent.state attribute): initializing,
   * listening, thinking, or speaking. Stuck on "thinking" means the LLM/TTS leg
   * is failing; never leaving "listening" means our turn never commits.
   */
  agentState: string | null;
  /** True once we've subscribed to a remote audio track. */
  agentAudioSubscribed: boolean;
  /** The published track's own muted flag, distinct from user-intent `isMuted`. */
  micTrackMuted: boolean;
}

const INITIAL_DIAGNOSTICS: VoiceDiagnostics = {
  connectionState: ConnectionState.Disconnected,
  micPublished: false,
  micDeviceError: null,
  micLevel: 0,
  userSpeaking: false,
  agentPresent: false,
  agentState: null,
  agentAudioSubscribed: false,
  micTrackMuted: false,
};

interface SessionResponse {
  serverUrl: string;
  roomName: string;
  identity: string;
  token: string;
  agentDispatched: boolean;
  dispatchError: string | null;
}

interface UseVoiceSessionResult {
  status: VoiceStatus;
  error: string | null;
  /** False when the room is live but no agent was dispatched into it. */
  agentDispatched: boolean;
  isMuted: boolean;
  isAgentSpeaking: boolean;
  diagnostics: VoiceDiagnostics;
  messages: Message[];
  profile: TravelProfile | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  toggleMute: () => Promise<void>;
  sendText: (text: string) => Promise<void>;
}

const TRANSCRIPTION_TOPIC = "lk.transcription";
const CHAT_TOPIC = "lk.chat";
const PROFILE_TOPIC = "sidequest.profile";

function toTimedFix(location: LocationCoordinates): TimedFix {
  return {
    lat: location.latitude,
    lng: location.longitude,
    accuracy: location.accuracy,
    ts: Date.now(),
  };
}

export function useVoiceSession(location: LocationCoordinates | null): UseVoiceSessionResult {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [agentDispatched, setAgentDispatched] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [diagnostics, setDiagnostics] = useState<VoiceDiagnostics>(INITIAL_DIAGNOSTICS);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profile, setProfile] = useState<TravelProfile | null>(null);

  const roomRef = useRef<Room | null>(null);
  const localIdentityRef = useRef<string | null>(null);
  const lastPublishedRef = useRef<TimedFix | null>(null);
  const audioElementsRef = useRef<HTMLAudioElement[]>([]);
  /** Guards against a second connect racing the first (double tap, StrictMode). */
  const connectingRef = useRef(false);
  // Level-meter plumbing: torn down together whenever the room goes away.
  const audioContextRef = useRef<AudioContext | null>(null);
  const levelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const patchDiagnostics = useCallback((patch: Partial<VoiceDiagnostics>) => {
    setDiagnostics((current) => ({ ...current, ...patch }));
  }, []);

  const stopLevelMeter = useCallback(() => {
    if (levelIntervalRef.current !== null) {
      clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }
    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  }, []);

  /**
   * Tap the published mic track with a Web Audio analyser so the UI can show
   * real input energy — the one signal that distinguishes "browser is capturing
   * audio" from "track exists but is silent".
   */
  const startLevelMeter = useCallback(
    (mediaStreamTrack: MediaStreamTrack) => {
      stopLevelMeter();
      const audioContext = new AudioContext();
      // New contexts can start "suspended"; connect began with a tap, so the
      // browser allows resuming here.
      void audioContext.resume().catch(() => {});
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      audioContext
        .createMediaStreamSource(new MediaStream([mediaStreamTrack]))
        .connect(analyser);
      audioContextRef.current = audioContext;

      const samples = new Uint8Array(analyser.fftSize);
      // An interval, not rAF, so the meter keeps running in background tabs.
      levelIntervalRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i += 1) {
          const centered = (samples[i] - 128) / 128;
          sum += centered * centered;
        }
        // Speech RMS rarely exceeds ~0.25, so boost it into a readable 0..1.
        const level = Math.min(1, Math.sqrt(sum / samples.length) * 4);
        setDiagnostics((current) =>
          current.micLevel === level ? current : { ...current, micLevel: level },
        );
      }, 100);
    },
    [stopLevelMeter],
  );

  // Read inside callbacks without making them depend on every position update.
  const locationRef = useRef(location);
  locationRef.current = location;

  /** Insert a message, or replace the existing one with the same id. */
  const upsertMessage = useCallback((message: Message) => {
    setMessages((current) => {
      const index = current.findIndex((existing) => existing.id === message.id);
      if (index === -1) return [...current, message];
      const next = [...current];
      next[index] = message;
      return next;
    });
  }, []);

  const teardownAudio = useCallback(() => {
    audioElementsRef.current.forEach((element) => {
      element.pause();
      element.remove();
    });
    audioElementsRef.current = [];
  }, []);

  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    localIdentityRef.current = null;
    lastPublishedRef.current = null;
    connectingRef.current = false;
    teardownAudio();
    stopLevelMeter();
    setStatus("idle");
    setIsAgentSpeaking(false);
    setIsMuted(false);
    setDiagnostics(INITIAL_DIAGNOSTICS);
    await room?.disconnect();
  }, [stopLevelMeter, teardownAudio]);

  const connect = useCallback(async () => {
    if (roomRef.current || connectingRef.current) return;

    const fix = locationRef.current;
    if (!fix) {
      setStatus("error");
      setError("I need your location before we can talk. Allow location access and try again.");
      return;
    }

    connectingRef.current = true;
    setStatus("connecting");
    setError(null);

    let session: SessionResponse;
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lat: fix.latitude,
          lng: fix.longitude,
          accuracy: fix.accuracy,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }
      session = payload as SessionResponse;
    } catch (err) {
      connectingRef.current = false;
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Could not start a session. Please try again.",
      );
      return;
    }

    setAgentDispatched(session.agentDispatched);

    const room = new Room({ adaptiveStream: true, dynacast: true });

    room.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, _publication: RemoteTrackPublication, _participant: RemoteParticipant) => {
        if (track.kind !== Track.Kind.Audio || !(track instanceof RemoteAudioTrack)) return;
        // Attaching to a detached element is enough for playback; it never
        // needs to enter the React tree.
        const element = track.attach();
        audioElementsRef.current.push(element as HTMLAudioElement);
        patchDiagnostics({ agentAudioSubscribed: true });
      },
    );

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      setIsAgentSpeaking(
        speakers.some((speaker) => speaker.identity !== localIdentityRef.current),
      );
      // The server only lists speakers whose audio it is actually receiving, so
      // this going true is end-to-end proof the mic pipeline works.
      patchDiagnostics({
        userSpeaking: speakers.some(
          (speaker) => speaker.identity === localIdentityRef.current,
        ),
      });
    });

    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      patchDiagnostics({ connectionState: state });
    });

    room.on(RoomEvent.MediaDevicesError, (mediaError: Error) => {
      // Keep the name: NotAllowedError (permission denied) reads very
      // differently from NotFoundError (no device at all).
      patchDiagnostics({ micDeviceError: `${mediaError.name}: ${mediaError.message}` });
    });

    room.on(RoomEvent.LocalTrackPublished, (publication: LocalTrackPublication) => {
      if (publication.source !== Track.Source.Microphone) return;
      patchDiagnostics({ micPublished: true, micTrackMuted: publication.isMuted });
      const mediaStreamTrack = publication.track?.mediaStreamTrack;
      if (mediaStreamTrack) startLevelMeter(mediaStreamTrack);
    });

    const syncAgentPresence = () => {
      patchDiagnostics({ agentPresent: room.remoteParticipants.size > 0 });
    };
    room.on(RoomEvent.ParticipantConnected, syncAgentPresence);
    room.on(RoomEvent.ParticipantDisconnected, syncAgentPresence);

    // The worker publishes its pipeline position (listening/thinking/speaking)
    // as an attribute, which is the closest thing to a heartbeat it has.
    room.on(RoomEvent.ParticipantAttributesChanged, (_changed, participant) => {
      if (participant.isLocal) return;
      const state = participant.attributes["lk.agent.state"];
      if (state) patchDiagnostics({ agentState: state });
    });

    const syncMicMuted = (muted: boolean) => (publication: TrackPublication, participant: Participant) => {
      if (!participant.isLocal || publication.source !== Track.Source.Microphone) return;
      patchDiagnostics({ micTrackMuted: muted });
    };
    room.on(RoomEvent.TrackMuted, syncMicMuted(true));
    room.on(RoomEvent.TrackUnmuted, syncMicMuted(false));

    room.on(RoomEvent.Disconnected, () => {
      roomRef.current = null;
      connectingRef.current = false;
      teardownAudio();
      stopLevelMeter();
      setStatus("idle");
      setIsAgentSpeaking(false);
      setDiagnostics(INITIAL_DIAGNOSTICS);
    });

    // Handlers are registered before connect so nothing published during the
    // agent's opening turn is missed.
    room.registerTextStreamHandler(TRANSCRIPTION_TOPIC, async (reader, participantInfo) => {
      const attributes = reader.info.attributes ?? {};
      // Keyed by segment so a re-sent segment replaces its earlier text rather
      // than appending a duplicate line.
      const segmentId = attributes["lk.segment_id"] ?? reader.info.id;

      // Deliberately NOT gated on `lk.transcription_final`: with synchronized
      // transcription the agent's own speech streams are marked "false" for
      // their whole lifetime, so waiting for a final marker drops every line the
      // guide says. readAll() resolves only when the stream closes, which is the
      // real completion signal.
      const text = await reader.readAll();
      if (!text.trim()) return;

      upsertMessage({
        id: `transcript-${segmentId}`,
        role: participantInfo.identity === localIdentityRef.current ? "user" : "assistant",
        kind: "text",
        text,
        createdAt: new Date().toISOString(),
      });
    });

    room.registerTextStreamHandler(PROFILE_TOPIC, async (reader) => {
      try {
        setProfile(JSON.parse(await reader.readAll()) as TravelProfile);
      } catch {
        // A malformed plan payload costs a card, not the conversation.
      }
    });

    try {
      await room.connect(session.serverUrl, session.token);
      await room.localParticipant.setMicrophoneEnabled(true);

      // setMicrophoneEnabled resolves even in the cases where no track ends up
      // published (a device grabbed by another tab, a permission that resolves
      // to an empty device list). Without this the UI says "Listening" over a
      // microphone the guide can never hear.
      const micTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (!micTrack?.track) {
        throw new Error(
          "Your microphone did not publish. Check that no other app or tab is using it, then try again.",
        );
      }

      // Belt-and-braces alongside LocalTrackPublished: the event can fire
      // before our listener in some paths, so sync from the publication itself.
      const remoteAgent = room.remoteParticipants.values().next().value;
      patchDiagnostics({
        connectionState: room.state,
        micPublished: true,
        micTrackMuted: micTrack.isMuted,
        agentPresent: room.remoteParticipants.size > 0,
        agentState: remoteAgent?.attributes["lk.agent.state"] ?? null,
      });
      if (!audioContextRef.current) {
        startLevelMeter(micTrack.track.mediaStreamTrack);
      }
    } catch (err) {
      connectingRef.current = false;
      await room.disconnect();
      stopLevelMeter();
      // The Disconnected reset above wipes diagnostics, but a getUserMedia
      // failure is exactly what the debug panel exists to show — keep it.
      if (err instanceof DOMException) {
        patchDiagnostics({ micDeviceError: `${err.name}: ${err.message}` });
      }
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not connect to your guide.");
      return;
    }

    roomRef.current = room;
    localIdentityRef.current = session.identity;
    // The token already carries this fix, so the agent is never location-blind
    // on its opening turn.
    lastPublishedRef.current = toTimedFix(fix);
    connectingRef.current = false;
    setIsMuted(false);
    setStatus("connected");
  }, [patchDiagnostics, startLevelMeter, stopLevelMeter, teardownAudio, upsertMessage]);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const nextEnabled = !room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(nextEnabled);
    setIsMuted(!nextEnabled);
  }, []);

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (!roomRef.current) {
        await connect();
      }
      const room = roomRef.current;
      if (!room) return;

      // Echo locally: the agent transcribes speech, but typed input comes back
      // only as the reply, so without this the traveler's own line never appears.
      upsertMessage({
        id: `typed-${Date.now()}`,
        role: "user",
        kind: "text",
        text: trimmed,
        createdAt: new Date().toISOString(),
      });

      await room.localParticipant.sendText(trimmed, { topic: CHAT_TOPIC });
    },
    [connect, upsertMessage],
  );

  /**
   * Republish position as the traveler walks.
   *
   * Gated by the same time-and-distance rule the server uses, because LiveKit
   * documents attributes as unsuitable for high-frequency updates and
   * watchPosition fires several times a second.
   */
  useEffect(() => {
    const room = roomRef.current;
    if (!room || status !== "connected" || !location) return;

    const next = toTimedFix(location);
    if (!shouldPublishFix(lastPublishedRef.current, next)) return;

    lastPublishedRef.current = next;
    void room.localParticipant.setAttributes(encodeLocationAttributes(next)).catch(() => {
      // Almost always a missing canUpdateOwnMetadata grant. The guide keeps the
      // last good fix, so this degrades rather than breaks.
    });
  }, [location, status]);

  useEffect(() => {
    return () => {
      void roomRef.current?.disconnect();
      roomRef.current = null;
      stopLevelMeter();
    };
  }, [stopLevelMeter]);

  return useMemo(
    () => ({
      status,
      error,
      agentDispatched,
      isMuted,
      isAgentSpeaking,
      diagnostics,
      messages,
      profile,
      connect,
      disconnect,
      toggleMute,
      sendText,
    }),
    [
      status,
      error,
      agentDispatched,
      isMuted,
      isAgentSpeaking,
      diagnostics,
      messages,
      profile,
      connect,
      disconnect,
      toggleMute,
      sendText,
    ],
  );
}
