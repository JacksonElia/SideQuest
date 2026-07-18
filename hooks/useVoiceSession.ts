"use client";

/**
 * The browser half of the voice conversation.
 *
 * Opens a WebRTC peer connection straight to OpenAI's Realtime API using an
 * ephemeral client secret minted by POST /api/session. Audio flows over the
 * peer connection (the model plays through the remote track automatically);
 * session control and tool calls flow over an "oai-events" data channel.
 * Tool execution lives server-side at POST /api/tool because the browser
 * cannot safely call Moss.
 *
 * One session spans planning and active screens on purpose — the model
 * changes mode by itself, so tearing the connection down between screens would
 * restart the conversation and lose everything it had learned.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LocationCoordinates, Message, TravelProfile } from "@/types/message";

export type VoiceStatus = "idle" | "connecting" | "connected" | "error";

/**
 * Coarse RTCPeerConnection states, expressed as strings so we don't import
 * the livekit-client enum. Anything not "connected" reads as a problem.
 */
export type RealtimeConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "closed";

/**
 * Fine-grained signals for debugging a silent microphone. `status` collapses
 * everything into four coarse states, which makes a dead mic look identical to
 * a working one — these separate "we never published audio" from "the agent
 * never joined" from "the server hears nothing".
 */
export interface VoiceDiagnostics {
  /** Plain-string mirror of the RTCPeerConnection.connectionState. */
  connectionState: RealtimeConnectionState;
  /** True once the microphone track is added to the peer connection. */
  micPublished: boolean;
  /** getUserMedia-level failure, e.g. "NotAllowedError: Permission denied". */
  micDeviceError: string | null;
  /** Local input RMS, 0..1, sampled ~10x/s. Moving means the mic hardware works. */
  micLevel: number;
  /** True while server-side VAD counts the user as speaking — proof audio arrives. */
  userSpeaking: boolean;
  /** True once the data channel is open and session.update has been sent. */
  agentPresent: boolean;
  /**
   * The model's pipeline state: idle, thinking, or speaking. Stuck on
   * "thinking" means the LLM leg is failing; never leaving "idle" means our
   * turn never commits.
   */
  agentState: "idle" | "thinking" | "speaking" | null;
  /** True once the model's audio track is attached to a playing element. */
  agentAudioSubscribed: boolean;
  /** The published track's enabled flag, distinct from user-intent `isMuted`. */
  micTrackEnabled: boolean;
  /** True once /api/tool returned successfully for at least one call. */
  toolExecuted: boolean;
}

const INITIAL_DIAGNOSTICS: VoiceDiagnostics = {
  connectionState: "idle",
  micPublished: false,
  micDeviceError: null,
  micLevel: 0,
  userSpeaking: false,
  agentPresent: false,
  agentState: null,
  agentAudioSubscribed: false,
  micTrackEnabled: true,
  toolExecuted: false,
};

interface SessionResponse {
  clientSecret: string;
  expiresAt: number | null;
  model: string;
  voice: string;
  sessionUpdate: Record<string, unknown>;
  initialLocation: { lat: number; lng: number; accuracy: number | null; ts: number };
}

interface ToolCallRequest {
  name: string;
  call_id: string;
  arguments: Record<string, unknown>;
  lat: number;
  lng: number;
  accuracy: number | null;
}

interface ToolCallResponse {
  call_id: string;
  output: Record<string, unknown>;
}

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const DATA_CHANNEL_LABEL = "oai-events";

interface UseVoiceSessionResult {
  status: VoiceStatus;
  error: string | null;
  /** Always true in the OpenAI Realtime path; kept for the page's degraded-mode UI. */
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

export function useVoiceSession(location: LocationCoordinates | null): UseVoiceSessionResult {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [diagnostics, setDiagnostics] = useState<VoiceDiagnostics>(INITIAL_DIAGNOSTICS);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profile] = useState<TravelProfile | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localTrackRef = useRef<MediaStreamTrack | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const connectingRef = useRef(false);
  const levelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentLocationRef = useRef<ToolCallRequest | null>(null);

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
   * Tap the local mic track with a Web Audio analyser so the UI can show
   * real input energy — the one signal that distinguishes "browser is capturing
   * audio" from "track exists but is silent".
   */
  const startLevelMeter = useCallback(
    (mediaStreamTrack: MediaStreamTrack) => {
      stopLevelMeter();
      const audioContext = new AudioContext();
      void audioContext.resume().catch(() => {});
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      audioContext
        .createMediaStreamSource(new MediaStream([mediaStreamTrack]))
        .connect(analyser);
      audioContextRef.current = audioContext;

      const samples = new Uint8Array(analyser.fftSize);
      levelIntervalRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i += 1) {
          const centered = (samples[i] - 128) / 128;
          sum += centered * centered;
        }
        const level = Math.min(1, Math.sqrt(sum / samples.length) * 4);
        setDiagnostics((current) =>
          current.micLevel === level ? current : { ...current, micLevel: level },
        );
      }, 100);
    },
    [stopLevelMeter],
  );

  const locationRef = useRef(location);
  locationRef.current = location;

  const upsertMessage = useCallback((message: Message) => {
    setMessages((current) => {
      const index = current.findIndex((existing) => existing.id === message.id);
      if (index === -1) return [...current, message];
      const next = [...current];
      next[index] = message;
      return next;
    });
  }, []);

  const teardownRemoteAudio = useCallback(() => {
    const element = remoteAudioRef.current;
    if (element) {
      element.pause();
      element.srcObject = null;
      element.remove();
      remoteAudioRef.current = null;
    }
  }, []);

  const disconnect = useCallback(async () => {
    const pc = pcRef.current;
    pcRef.current = null;
    dataChannelRef.current = null;
    connectingRef.current = false;
    teardownRemoteAudio();
    stopLevelMeter();

    localTrackRef.current?.stop();
    localTrackRef.current = null;
    void localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    if (pc) {
      pc.getSenders().forEach((sender) => sender.track && pc.removeTrack(sender));
      pc.close();
    }

    setStatus("idle");
    setIsAgentSpeaking(false);
    setIsMuted(false);
    setDiagnostics(INITIAL_DIAGNOSTICS);
  }, [stopLevelMeter, teardownRemoteAudio]);

  /**
   * Dispatch a typed Realtime event onto the data channel. No-op if the
   * channel isn't open yet — race between data-channel-open and connect()
   * shouldn't double-fire session.update.
   */
  const sendOnDataChannel = useCallback((event: Record<string, unknown>) => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== "open") return;
    channel.send(JSON.stringify(event));
  }, []);

  /**
   * Execute a tool call the model emitted.
   *
   * The browser can't safely call Moss (no server-side index, no fail-soft
   * contract) so we proxy through /api/tool. The result is fed back as a
   * `function_call_output` conversation item and a fresh `response.create` is
   * sent so the model continues.
   */
  const executeToolCall = useCallback(
    async (name: string, callId: string, rawArguments: string) => {
      const fix = currentLocationRef.current;
      if (!fix) {
        sendOnDataChannel({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify({
              error: "Location not available yet; ask the traveler to enable location.",
            }),
          },
        });
        sendOnDataChannel({ type: "response.create" });
        return;
      }

      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = JSON.parse(rawArguments) as Record<string, unknown>;
      } catch {
        sendOnDataChannel({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify({ error: "Tool arguments were not valid JSON." }),
          },
        });
        sendOnDataChannel({ type: "response.create" });
        return;
      }

      try {
        const response = await fetch("/api/tool", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            call_id: callId,
            arguments: parsedArgs,
            lat: fix.lat,
            lng: fix.lng,
            accuracy: fix.accuracy,
          }),
        });
        const result = (await response.json()) as ToolCallResponse | { error: string };
        if (!response.ok || !("call_id" in result)) {
          const message = "error" in result ? result.error : `HTTP ${response.status}`;
          throw new Error(message);
        }
        patchDiagnostics({ toolExecuted: true });
        sendOnDataChannel({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: result.call_id,
            output: JSON.stringify(result.output),
          },
        });
        sendOnDataChannel({ type: "response.create" });
      } catch (err) {
        sendOnDataChannel({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify({
              error: err instanceof Error ? err.message : "Tool execution failed.",
            }),
          },
        });
        sendOnDataChannel({ type: "response.create" });
      }
    },
    [patchDiagnostics, sendOnDataChannel],
  );

  const handleRealtimeEvent = useCallback(
    (event: Record<string, unknown>) => {
      const type = event.type;
      if (typeof type !== "string") return;

      switch (type) {
        case "input_audio_buffer.speech_started":
          patchDiagnostics({ userSpeaking: true });
          break;
        case "input_audio_buffer.speech_stopped":
          patchDiagnostics({ userSpeaking: false });
          break;
        case "conversation.item.input_audio_transcription.completed": {
          const transcript = event.transcript;
          if (typeof transcript === "string" && transcript.trim()) {
            upsertMessage({
              id: `user-${String(event.item_id ?? Date.now())}`,
              role: "user",
              kind: "text",
              text: transcript.trim(),
              createdAt: new Date().toISOString(),
            });
          }
          break;
        }
        case "response.created":
          patchDiagnostics({ agentState: "thinking" });
          setIsAgentSpeaking(false);
          break;
        case "response.output_item.added":
          patchDiagnostics({ agentState: "speaking" });
          setIsAgentSpeaking(true);
          break;
        case "response.output_audio_transcript.delta": {
          const delta = event.delta;
          if (typeof delta === "string" && delta.length > 0) {
            upsertMessage({
              id: `assistant-stream-${String(event.response_id ?? "live")}`,
              role: "assistant",
              kind: "text",
              text: delta,
              createdAt: new Date().toISOString(),
            });
          }
          break;
        }
        case "response.output_audio_transcript.done": {
          const transcript = event.transcript;
          if (typeof transcript === "string" && transcript.trim()) {
            upsertMessage({
              id: `assistant-${String(event.response_id ?? Date.now())}`,
              role: "assistant",
              kind: "text",
              text: transcript.trim(),
              createdAt: new Date().toISOString(),
            });
          }
          break;
        }
        case "response.function_call_arguments.done": {
          const name = event.name;
          const callId = event.call_id;
          const args = event.arguments;
          if (typeof name === "string" && typeof callId === "string" && typeof args === "string") {
            void executeToolCall(name, callId, args);
          }
          break;
        }
        case "response.done":
          patchDiagnostics({ agentState: "idle" });
          setIsAgentSpeaking(false);
          break;
        case "error":
          console.error("[realtime error]", event);
          break;
        default:
          // Many event types stream past (rate_limits.updated, response.content_part.added, etc.) —
          // we only act on the ones we care about above.
          break;
      }
    },
    [executeToolCall, patchDiagnostics, upsertMessage],
  );

  const connect = useCallback(async () => {
    if (pcRef.current || connectingRef.current) return;

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
      const payload = (await response.json()) as SessionResponse | { error: string };
      if (!response.ok || !("clientSecret" in payload)) {
        const message = "error" in payload ? payload.error : `HTTP ${response.status}`;
        throw new Error(message);
      }
      session = payload;
    } catch (err) {
      connectingRef.current = false;
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Could not start a session. Please try again.",
      );
      return;
    }

    currentLocationRef.current = {
      name: "",
      call_id: "",
      arguments: {},
      lat: fix.latitude,
      lng: fix.longitude,
      accuracy: fix.accuracy,
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      connectingRef.current = false;
      patchDiagnostics({
        micDeviceError: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not access the microphone.");
      return;
    }

    const [track] = stream.getAudioTracks();
    if (!track) {
      connectingRef.current = false;
      stream.getTracks().forEach((t) => t.stop());
      setStatus("error");
      setError("Your microphone did not produce an audio track.");
      return;
    }

    localStreamRef.current = stream;
    localTrackRef.current = track;
    patchDiagnostics({ micPublished: true, micTrackEnabled: track.enabled });
    startLevelMeter(track);

    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    // With WebRTC, the model's audio plays automatically through the remote
    // track — we just need an element to receive it. Kept off the React tree
    // because attaching/detaching on every re-render fights autoplay.
    const remoteAudio = document.createElement("audio");
    remoteAudio.autoplay = true;
    remoteAudioRef.current = remoteAudio;

    pc.ontrack = (e) => {
      remoteAudio.srcObject = e.streams[0];
      patchDiagnostics({ agentAudioSubscribed: true });
    };

    pc.addTrack(track, stream);

    const dataChannel = pc.createDataChannel(DATA_CHANNEL_LABEL);
    dataChannelRef.current = dataChannel;
    dataChannel.addEventListener("open", () => {
      patchDiagnostics({ agentPresent: true });
      sendOnDataChannel(session.sessionUpdate);
    });
    dataChannel.addEventListener("message", (ev) => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(typeof ev.data === "string" ? ev.data : "{}") as Record<string, unknown>;
      } catch {
        return;
      }
      handleRealtimeEvent(parsed);
    });
    dataChannel.addEventListener("close", () => {
      patchDiagnostics({ agentPresent: false });
    });

    pc.addEventListener("connectionstatechange", () => {
      const state = pc.connectionState as RealtimeConnectionState;
      patchDiagnostics({ connectionState: state });
      if (state === "failed" || state === "closed" || state === "disconnected") {
        setStatus("error");
      }
    });

    let offer: RTCSessionDescriptionInit;
    try {
      offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
    } catch (err) {
      connectingRef.current = false;
      await pc.close();
      pcRef.current = null;
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not start the WebRTC offer.");
      return;
    }

    let answerSdp: string;
    try {
      const response = await fetch(REALTIME_CALLS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp ?? "",
      });
      if (!response.ok) {
        throw new Error(`OpenAI Realtime rejected the offer (HTTP ${response.status})`);
      }
      answerSdp = await response.text();
    } catch (err) {
      connectingRef.current = false;
      pc.getSenders().forEach((sender) => sender.track && pc.removeTrack(sender));
      pc.close();
      pcRef.current = null;
      stream.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      localTrackRef.current = null;
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not reach the Realtime service.");
      return;
    }

    try {
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (err) {
      connectingRef.current = false;
      pc.close();
      pcRef.current = null;
      stream.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      localTrackRef.current = null;
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not complete the Realtime handshake.");
      return;
    }

    connectingRef.current = false;
    setIsMuted(false);
    setStatus("connected");
  }, [handleRealtimeEvent, patchDiagnostics, sendOnDataChannel, startLevelMeter]);

  const toggleMute = useCallback(async () => {
    const track = localTrackRef.current;
    if (!track) return;
    track.enabled = !track.enabled;
    patchDiagnostics({ micTrackEnabled: track.enabled });
    setIsMuted(!track.enabled);
  }, [patchDiagnostics]);

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (!pcRef.current) {
        await connect();
      }
      if (!dataChannelRef.current || dataChannelRef.current.readyState !== "open") return;

      upsertMessage({
        id: `typed-${Date.now()}`,
        role: "user",
        kind: "text",
        text: trimmed,
        createdAt: new Date().toISOString(),
      });

      // Feed the typed message into the conversation as a user turn and let
      // the model produce a response — same path a spoken turn takes.
      sendOnDataChannel({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: trimmed }],
        },
      });
      sendOnDataChannel({ type: "response.create" });
    },
    [connect, sendOnDataChannel, upsertMessage],
  );

  useEffect(() => {
    const fix = locationRef.current;
    if (!fix) return;
    currentLocationRef.current = {
      name: "",
      call_id: "",
      arguments: {},
      lat: fix.latitude,
      lng: fix.longitude,
      accuracy: fix.accuracy,
    };
  }, [location]);

  useEffect(() => {
    return () => {
      void disconnect();
    };
  }, [disconnect]);

  return useMemo(
    () => ({
      status,
      error,
      agentDispatched: true,
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