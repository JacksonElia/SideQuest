"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Compass, MapPin, Sparkles } from "lucide-react";
import { ChatInput } from "@/components/Chat/ChatInput";
import { ChatWindow } from "@/components/Chat/ChatWindow";
import { Spinner } from "@/components/ui/Spinner";
import type { Message } from "@/types/message";

interface QuestScopingProps {
  locationLabel: string;
  messages: Message[];
  answeredCount: number;
  isGenerating: boolean;
  error: string | null;
  onBack: () => void;
  onSendAnswer: (text: string) => Promise<void>;
  onGenerateQuests: () => Promise<void>;
}

export function QuestScoping({
  locationLabel,
  messages,
  answeredCount,
  isGenerating,
  error,
  onBack,
  onSendAnswer,
  onGenerateQuests,
}: QuestScopingProps) {
  const isComplete = answeredCount === 4;

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
            Plan your quest
          </p>
          <div className="flex size-10 items-center justify-center rounded-lg bg-[#e5b85f] text-[#31101b]">
            <Compass className="size-5" />
          </div>
        </header>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative mx-5 flex shrink-0 items-center gap-3 rounded-xl border border-[#f5d58a]/35 bg-[#531929]/85 px-4 py-3 shadow-[5px_6px_0_rgba(18,5,9,0.3)]"
        >
          <MapPin className="size-4 shrink-0 text-[#f5d58a]" />
          <p className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-[#fff8e8]/70">
            Starting from {locationLabel}
          </p>
        </motion.section>

        <section className="relative mt-4 flex min-h-0 flex-1 flex-col border-y border-[#fff8e8]/15 bg-[#3d1421]/60">
          <div className="shrink-0 border-b border-[#fff8e8]/15 px-5 py-3">
            <p className="text-sm font-bold">Build your day</p>
            <p className="mt-1 text-xs leading-5 text-[#fff8e8]/60">
              Answer four quick questions, then we&apos;ll search for a route.
            </p>
          </div>
          <ChatWindow messages={messages} isTyping={isGenerating} />
        </section>

        <div className="relative shrink-0 border-t border-[#fff8e8]/15 bg-[#31101b]/95 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          {isComplete ? (
            <button
              type="button"
              onClick={() => void onGenerateQuests()}
              disabled={isGenerating}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-[#f5d58a] bg-[#e5b85f] px-5 py-3.5 text-sm font-bold text-[#31101b] shadow-[4px_5px_0_rgba(18,5,9,0.35)] transition hover:bg-[#f0ca78] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-wait disabled:opacity-70"
            >
              {isGenerating ? "Searching Moss..." : "Generate my quests"}
              {isGenerating ? <Spinner className="size-4" /> : <Sparkles className="size-4" />}
            </button>
          ) : (
            <ChatInput
              disabled={isGenerating}
              placeholder="Type your answer..."
              onSend={onSendAnswer}
            />
          )}
          {error && <p className="mt-2 text-center text-xs leading-5 text-[#f3b3a5]">{error}</p>}
        </div>
      </div>
    </main>
  );
}
