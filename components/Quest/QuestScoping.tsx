"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Compass, MapPin, Sparkles } from "lucide-react";
import { ChatWindow } from "@/components/Chat/ChatWindow";
import { VoiceOrb } from "@/components/Voice/VoiceOrb";
import { Spinner } from "@/components/ui/Spinner";
import type { VoiceStatus } from "@/hooks/useVoiceSession";
import type { Message } from "@/types/message";

interface QuestScopingProps {
  locationLabel: string;
  messages: Message[];
  /** True while the guide is speaking its turn. */
  isTyping: boolean;
  voiceStatus: VoiceStatus;
  isMuted: boolean;
  isAgentSpeaking: boolean;
  voiceError: string | null;
  /** False when the room is live but no guide was dispatched into it. */
  agentDispatched: boolean;
  onBack: () => void;
  onGenerateQuests: () => void;
  onConnect: () => void;
  onToggleMute: () => void;
}

/** The agent drives the questions, so the hero line is simply its latest turn. */
function latestAgentPrompt(messages: Message[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && message.kind === "text") {
      return message.text;
    }
  }
  return null;
}

export function QuestScoping({
  locationLabel,
  messages,
  isTyping,
  voiceStatus,
  isMuted,
  isAgentSpeaking,
  voiceError,
  agentDispatched,
  onBack,
  onGenerateQuests,
  onConnect,
  onToggleMute,
}: QuestScopingProps) {
  const agentPrompt = latestAgentPrompt(messages);
  const hasAnswered = messages.some((message) => message.role === "user");
  const isGenerateReady = hasAnswered && !isTyping;
  const isConnected = voiceStatus === "connected";

  const headline = agentPrompt
    ? agentPrompt
    : isConnected
      ? "Your guide is getting ready…"
      : "Tap the orb to meet your guide.";

  return (
    <main className="h-dvh overflow-hidden bg-[#31101b] text-[#fff8e8]">
      <div className="relative mx-auto flex h-full w-full max-w-md flex-col overflow-hidden">
        <div className="pointer-events-none absolute -right-36 -top-32 size-96 rounded-full bg-[#b1454d]/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-40 size-96 rounded-full bg-[#c67c2e]/20 blur-3xl" />

        <header className="relative flex shrink-0 items-center justify-between px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={onBack}
            className="flex size-10 items-center justify-center rounded-lg border border-[#fff8e8]/20 bg-[#531929] text-[#fff8e8] transition hover:bg-[#652033] active:scale-95"
            aria-label="Change starting location"
          >
            <ArrowLeft className="size-5" />
          </button>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#e5b85f]">
            Talk to your guide
          </p>
          <div className="flex size-10 items-center justify-center rounded-lg bg-[#e5b85f] text-[#31101b]">
            <Compass className="size-5" />
          </div>
        </header>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative flex shrink-0 flex-col items-center px-6 pb-4"
        >
          <div className="flex items-center gap-1.5 rounded-full border border-[#f5d58a]/30 bg-[#531929]/85 px-3 py-1.5">
            <MapPin className="size-3.5 text-[#f5d58a]" />
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#fff8e8]/65">
              Starting from {locationLabel}
            </p>
          </div>

          <div className="mt-4 flex min-h-[4.5rem] items-center">
            <AnimatePresence mode="wait">
              <motion.h1
                key={headline}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                // Clamped because the guide's turn can be long, and this hero
                // shares its screen with the transcript below it.
                className="line-clamp-3 text-balance text-center text-lg font-semibold leading-6 tracking-[-0.04em]"
              >
                {headline}
              </motion.h1>
            </AnimatePresence>
          </div>

          <div className="mt-3">
            <VoiceOrb
              status={voiceStatus}
              isMuted={isMuted}
              isAgentSpeaking={isAgentSpeaking}
              error={voiceError}
              onConnect={onConnect}
              onToggleMute={onToggleMute}
            />
          </div>

          {isConnected && !agentDispatched && (
            <p
              role="alert"
              className="mt-4 max-w-[18rem] rounded-lg border border-[#f5d58a]/30 bg-[#531929] px-3 py-2 text-center text-[11px] leading-4 text-[#fff8e8]/80"
            >
              Your guide could not be reached, so no one is listening yet. Check that the agent
              worker is running, then tap back and try again.
            </p>
          )}
        </motion.section>

        <section className="relative flex min-h-0 flex-1 flex-col border-y border-[#fff8e8]/15 bg-[#3d1421]/60">
          <div className="shrink-0 border-b border-[#fff8e8]/15 px-5 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#fff8e8]/45">
              Transcript
            </p>
          </div>
          <ChatWindow messages={messages} isTyping={isTyping} />
        </section>

        <div className="relative shrink-0 border-t border-[#fff8e8]/15 bg-[#31101b]/95 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={onGenerateQuests}
            disabled={!isGenerateReady}
            aria-busy={isTyping}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-[#f5d58a] bg-[#e5b85f] px-5 py-3.5 text-sm font-bold text-[#31101b] shadow-[4px_5px_0_rgba(18,5,9,0.35)] transition hover:bg-[#f0ca78] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-x-0 disabled:active:translate-y-0"
          >
            {isTyping ? "Your guide is thinking" : "Generate my quests"}
            {isTyping ? <Spinner className="size-4" /> : <Sparkles className="size-4" />}
          </button>
          <p className="mt-2 text-center text-[11px] text-[#fff8e8]/50">
            {isGenerateReady
              ? "Tap the orb again to add more, or generate whenever you're ready."
              : "Tell your guide what you're after — then we'll build your quests."}
          </p>
        </div>
      </div>
    </main>
  );
}
