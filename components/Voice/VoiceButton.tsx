"use client";

import { motion } from "framer-motion";
import { Mic, MicOff, Volume2 } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import type { VoiceStatus } from "@/hooks/useVoiceSession";

interface VoiceButtonProps {
  variant?: "default" | "conversation";
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
 * Compact sibling of VoiceOrb for the guiding screen.
 *
 * Same model: a continuous call the traveler starts once and then mutes when
 * they want to stop being heard — never a per-utterance record button.
 */
export function VoiceButton({
  variant = "default",
  status,
  isMuted,
  isAgentSpeaking,
  error,
  onConnect,
  onToggleMute,
}: VoiceButtonProps) {
  const isConversation = variant === "conversation";
  const isConnecting = status === "connecting";
  const isConnected = status === "connected";
  const isListening = isConnected && !isMuted && !isAgentSpeaking;

  const handleClick = () => {
    if (isConnecting) return;
    if (isConnected) {
      onToggleMute();
      return;
    }
    onConnect();
  };

  const label = isConnecting
    ? "Connecting"
    : !isConnected
      ? "Tap to talk"
      : isMuted
        ? "Muted"
        : isAgentSpeaking
          ? "Speaking"
          : "Listening";

  const ariaLabel = isConnected
    ? isMuted
      ? "Unmute microphone"
      : "Mute microphone"
    : "Start talking with your guide";

  return (
    <div className="relative flex flex-col items-center gap-1">
      <motion.button
        whileTap={{ scale: 0.9 }}
        type="button"
        onClick={handleClick}
        disabled={isConnecting}
        className={cn(
          "relative flex items-center justify-center text-white shadow-float transition",
          isConversation ? "size-16 rounded-[22px]" : "size-12 rounded-2xl",
          isListening ? "bg-[#c67c2e] shadow-[#c67c2e]/25" : "bg-[#31101b] hover:bg-[#6b1f32]",
          isConnected && isMuted && "bg-[#7a4c4d]",
          isConnecting && "cursor-wait opacity-70",
        )}
        aria-label={ariaLabel}
        aria-pressed={isConnected ? !isMuted : undefined}
      >
        {isListening && (
          <motion.span
            className="absolute inset-0 rounded-2xl border-2 border-[#e5b85f]"
            animate={{ scale: [1, 1.18, 1], opacity: [0.8, 0, 0.8] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
        )}
        {isConnecting ? (
          <Spinner
            className={isConversation ? "size-6" : "size-5"}
            label="Connecting to your guide"
          />
        ) : isConnected && isMuted ? (
          <MicOff className={isConversation ? "size-6" : "size-5"} />
        ) : isAgentSpeaking ? (
          <Volume2 className={isConversation ? "size-6" : "size-5"} />
        ) : (
          <Mic className={isConversation ? "size-6" : "size-5"} />
        )}
      </motion.button>
      <span
        className={cn("text-[10px] font-semibold", isListening ? "text-[#9c3b43]" : "text-[#8c6a5f]")}
      >
        {label}
      </span>
      {error && (
        <span className="absolute bottom-full left-0 mb-3 w-44 rounded-lg bg-[#31101b] px-3 py-2 text-center text-[10px] leading-4 text-[#fff8e8] shadow-xl">
          {error}
        </span>
      )}
    </div>
  );
}
