"use client";

import { motion } from "framer-motion";
import { Mic, MicOff, Volume2 } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import type { VoiceStatus } from "@/hooks/useVoiceSession";

interface VoiceOrbProps {
  status: VoiceStatus;
  isMuted: boolean;
  isAgentSpeaking: boolean;
  error: string | null;
  /** Joins the room and opens the microphone. */
  onConnect: () => void;
  /** Mutes or unmutes without leaving the conversation. */
  onToggleMute: () => void;
}

/**
 * The orb is a live call, not a recorder.
 *
 * The guide listens continuously and takes its own turns, so the orb's job is
 * to start the conversation and then show whose turn it is — there is nothing
 * to start and stop per utterance.
 */
export function VoiceOrb({
  status,
  isMuted,
  isAgentSpeaking,
  error,
  onConnect,
  onToggleMute,
}: VoiceOrbProps) {
  const isConnecting = status === "connecting";
  const isConnected = status === "connected";
  const isListening = isConnected && !isMuted && !isAgentSpeaking;
  const isAnimated = isConnected && !isMuted;

  const handleClick = () => {
    if (isConnecting) return;
    if (isConnected) {
      onToggleMute();
      return;
    }
    onConnect();
  };

  const hint = isConnecting
    ? "Connecting"
    : !isConnected
      ? "Tap to begin"
      : isMuted
        ? "Muted — tap to speak"
        : isAgentSpeaking
          ? "Your guide is speaking"
          : "Listening";

  const ariaLabel = isConnected
    ? isMuted
      ? "Unmute microphone"
      : "Mute microphone"
    : "Start talking with your guide";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex size-32 items-center justify-center">
        {/* Halo rings only animate while the mic is open, so idle stays calm. */}
        {isAnimated && (
          <>
            <motion.span
              className={cn(
                "absolute inset-0 rounded-full border-2",
                isAgentSpeaking ? "border-[#b1454d]" : "border-[#e5b85f]",
              )}
              animate={{ scale: [1, 1.35, 1], opacity: [0.7, 0, 0.7] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
            />
            <motion.span
              className={cn(
                "absolute inset-0 rounded-full border",
                isAgentSpeaking ? "border-[#c67c2e]" : "border-[#f5d58a]",
              )}
              animate={{ scale: [1, 1.6, 1], opacity: [0.45, 0, 0.45] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.45 }}
            />
          </>
        )}

        <motion.button
          whileTap={{ scale: 0.92 }}
          animate={isListening ? { scale: [1, 1.05, 1] } : { scale: 1 }}
          transition={isListening ? { duration: 1.4, repeat: Infinity } : { duration: 0.2 }}
          type="button"
          onClick={handleClick}
          disabled={isConnecting}
          className={cn(
            "relative flex size-24 items-center justify-center rounded-full border-2 text-[#fff8e8] shadow-[6px_7px_0_rgba(18,5,9,0.35)] transition",
            isListening
              ? "border-[#f5d58a] bg-[#c67c2e]"
              : "border-[#f5d58a]/60 bg-[#8a293c] hover:bg-[#9c3b43]",
            isConnected && isMuted && "bg-[#6b3038]",
            isConnecting && "cursor-wait opacity-70",
          )}
          aria-label={ariaLabel}
          aria-pressed={isConnected ? !isMuted : undefined}
        >
          {isConnecting ? (
            <Spinner className="size-8" label="Connecting to your guide" />
          ) : isConnected && isMuted ? (
            <MicOff className="size-8" strokeWidth={2.2} />
          ) : isAgentSpeaking ? (
            <Volume2 className="size-9" strokeWidth={2.2} />
          ) : (
            <Mic className="size-9" strokeWidth={2.2} />
          )}
        </motion.button>
      </div>

      <span
        className={cn(
          "text-[11px] font-bold uppercase tracking-[0.2em]",
          isListening ? "text-[#f5d58a]" : "text-[#fff8e8]/55",
        )}
      >
        {hint}
      </span>

      {error && (
        <span
          role="alert"
          className="max-w-[16rem] rounded-lg border border-[#fff8e8]/20 bg-[#531929] px-3 py-2 text-center text-[10px] leading-4 text-[#fff8e8]"
        >
          {error}
        </span>
      )}
    </div>
  );
}
