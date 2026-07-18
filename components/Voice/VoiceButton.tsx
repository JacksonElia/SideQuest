"use client";

import { motion } from "framer-motion";
import { Mic, Square } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import type { RecorderStatus } from "@/types/message";

interface VoiceButtonProps {
  variant?: "default" | "conversation";
  status: RecorderStatus;
  durationSeconds: number;
  error: string | null;
  onStart: () => Promise<void>;
  onStop: () => void;
}

export function VoiceButton({
  variant = "default",
  status,
  durationSeconds,
  error,
  onStart,
  onStop,
}: VoiceButtonProps) {
  const isListening = status === "listening";
  const isBusy = status === "requesting" || status === "processing";
  const isConversation = variant === "conversation";

  const handleClick = () => {
    if (isListening) {
      onStop();
    } else if (!isBusy) {
      void onStart();
    }
  };

  return (
    <div className="relative flex flex-col items-center gap-1">
      <motion.button
        whileTap={{ scale: 0.9 }}
        type="button"
        onClick={handleClick}
        disabled={isBusy}
        className={cn(
          "relative flex items-center justify-center text-white shadow-float transition",
          isConversation ? "size-16 rounded-[22px]" : "size-12 rounded-2xl",
          isListening ? "bg-rose-500 shadow-rose-500/25" : "bg-slate-950 hover:bg-blue-600",
          isBusy && "cursor-wait opacity-70",
        )}
        aria-label={isListening ? "Stop recording" : "Start voice message"}
      >
        {isListening && (
          <motion.span
            className="absolute inset-0 rounded-2xl border-2 border-rose-300"
            animate={{ scale: [1, 1.18, 1], opacity: [0.8, 0, 0.8] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
        )}
        {isListening ? (
          <Square className={isConversation ? "size-5 fill-current" : "size-4 fill-current"} />
        ) : (
          <Mic className={isConversation ? "size-6" : "size-5"} />
        )}
      </motion.button>
      <span
        className={cn(
          "text-[10px] font-semibold",
          isListening ? "text-rose-500" : "text-slate-400",
        )}
      >
        {isListening
          ? formatDuration(durationSeconds)
          : status === "processing"
            ? "Saving"
            : isConversation
              ? "Tap to speak"
              : "Voice"}
      </span>
      {error && (
        <span className="absolute bottom-full left-0 mb-3 w-44 rounded-xl bg-slate-900 px-3 py-2 text-center text-[10px] leading-4 text-white shadow-xl">
          {error}
        </span>
      )}
    </div>
  );
}
