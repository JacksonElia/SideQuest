"use client";

import { cn } from "@/lib/utils";
import type { VoiceDiagnostics } from "@/hooks/useVoiceSession";

interface VoiceDebugPanelProps {
  diagnostics: VoiceDiagnostics;
  /** From the hook's isAgentSpeaking, so the panel shows both sides of the call. */
  isAgentSpeaking?: boolean;
}

type DotTone = "good" | "warn" | "bad";

const DOT_CLASSES: Record<DotTone, string> = {
  good: "bg-emerald-400",
  warn: "bg-[#e5b85f]",
  bad: "bg-[#b1454d]",
};

function StatusRow({ label, tone, detail }: { label: string; tone: DotTone; detail?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("size-2 shrink-0 rounded-full", DOT_CLASSES[tone])} />
      <span className="text-[#fff8e8]/80">{label}</span>
      {detail && <span className="ml-auto text-[#fff8e8]/45">{detail}</span>}
    </div>
  );
}

/**
 * Floating diagnostics card for debugging a silent microphone. Every row is a
 * distinct failure point, ordered by the path audio takes: connection → mic
 * publish → local level → server VAD fires → model speaks → tool executed.
 */
export function VoiceDebugPanel({ diagnostics, isAgentSpeaking = false }: VoiceDebugPanelProps) {
  const {
    connectionState,
    micPublished,
    micDeviceError,
    micLevel,
    userSpeaking,
    agentPresent,
    agentState,
    agentAudioSubscribed,
    micTrackEnabled,
    toolExecuted,
  } = diagnostics;

  const connected = connectionState === "connected";
  const connecting = connectionState === "connecting";

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-4 z-50 w-56 space-y-1.5 rounded-xl border border-[#fff8e8]/20 bg-[#120509]/85 p-3 text-[10px] leading-4 backdrop-blur"
      role="status"
      aria-label="Voice session diagnostics"
    >
      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#f5d58a]/80">
        Voice debug
      </p>

      <StatusRow
        label="Connection"
        tone={connected ? "good" : connecting ? "warn" : "bad"}
        detail={connectionState}
      />
      <StatusRow label="Mic published" tone={micPublished ? "good" : connected ? "bad" : "warn"} />
      <StatusRow
        label="Mic track"
        tone={!micPublished ? "warn" : micTrackEnabled ? "good" : "bad"}
        detail={micTrackEnabled ? "live" : micPublished ? "muted" : "—"}
      />
      <StatusRow
        label="Session"
        tone={agentPresent ? "good" : connected ? "warn" : "bad"}
        detail={agentPresent ? "open" : "—"}
      />
      <StatusRow
        label="Model"
        tone={
          agentState === "thinking" || agentState === "speaking"
            ? "good"
            : agentState === "idle" || !agentPresent
              ? "warn"
              : "bad"
        }
        detail={agentState ?? "—"}
      />
      <StatusRow
        label="Model audio"
        tone={agentAudioSubscribed ? "good" : agentPresent ? "warn" : "bad"}
      />
      <StatusRow label="Tool executed" tone={toolExecuted ? "good" : "warn"} />

      {micDeviceError && (
        <p role="alert" className="rounded-lg bg-[#531929] px-2 py-1 text-[#fff8e8]">
          {micDeviceError}
        </p>
      )}

      <div className="pt-1">
        <div className="mb-1 flex items-center justify-between text-[#fff8e8]/55">
          <span>Mic level</span>
          <span>{Math.round(micLevel * 100)}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#fff8e8]/10">
          <div
            className="h-full rounded-full bg-emerald-400 transition-[width] duration-100 ease-linear"
            style={{ width: `${Math.round(micLevel * 100)}%` }}
          />
        </div>
      </div>

      <div className="flex gap-1.5 pt-1">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5",
            userSpeaking
              ? "border-[#f5d58a] bg-[#c67c2e] text-[#fff8e8]"
              : "border-[#fff8e8]/15 text-[#fff8e8]/40",
          )}
        >
          You&apos;re speaking
        </span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5",
            isAgentSpeaking
              ? "border-[#b1454d] bg-[#8a293c] text-[#fff8e8]"
              : "border-[#fff8e8]/15 text-[#fff8e8]/40",
          )}
        >
          Agent speaking
        </span>
      </div>
    </div>
  );
}
