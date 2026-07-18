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
  RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import {
  encodeLocationAttributes,
  shouldPublishFix,
  type TimedFix,
} from "@/lib/server/location";
import type { LocationCoordinates, Message, TravelProfile } from "@/types/message";

export type VoiceStatus = "idle" | "connecting" | "connected" | "error";

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [profile, setProfile] = useState<TravelProfile | null>(null);

  const roomRef = useRef<Room | null>(null);
  const localIdentityRef = useRef<string | null>(null);
  const lastPublishedRef = useRef<TimedFix | null>(null);
  const audioElementsRef = useRef<HTMLAudioElement[]>([]);
  /** Guards against a second connect racing the first (double tap, StrictMode). */
  const connectingRef = useRef(false);

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
    setStatus("idle");
    setIsAgentSpeaking(false);
    setIsMuted(false);
    await room?.disconnect();
  }, [teardownAudio]);

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
      },
    );

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      setIsAgentSpeaking(
        speakers.some((speaker) => speaker.identity !== localIdentityRef.current),
      );
    });

    room.on(RoomEvent.Disconnected, () => {
      roomRef.current = null;
      connectingRef.current = false;
      teardownAudio();
      setStatus("idle");
      setIsAgentSpeaking(false);
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
    } catch (err) {
      connectingRef.current = false;
      await room.disconnect();
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
  }, [teardownAudio, upsertMessage]);

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
    };
  }, []);

  return useMemo(
    () => ({
      status,
      error,
      agentDispatched,
      isMuted,
      isAgentSpeaking,
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
      messages,
      profile,
      connect,
      disconnect,
      toggleMute,
      sendText,
    ],
  );
}
