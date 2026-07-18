"use client";

import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Compass, MapPin } from "lucide-react";
import { ChatWindow } from "@/components/Chat/ChatWindow";
import { VoiceButton } from "@/components/Voice/VoiceButton";
import type { Message, RecorderStatus } from "@/types/message";

interface QuestPlanningProps {
  questName: string;
  locationLabel: string;
  messages: Message[];
  isTyping: boolean;
  recorderStatus: RecorderStatus;
  durationSeconds: number;
  recorderError: string | null;
  isGeneratingQuestPlan: boolean;
  hasGeneratedQuestPlan: boolean;
  questPlanError: string | null;
  onBack: () => void;
  onGenerateQuestPlan: () => void;
  onStartQuest: () => void;
  onStartRecording: () => Promise<void>;
  onStopRecording: () => void;
}

export function QuestPlanning({
  questName,
  locationLabel,
  messages,
  isTyping,
  recorderStatus,
  durationSeconds,
  recorderError,
  isGeneratingQuestPlan,
  hasGeneratedQuestPlan,
  questPlanError,
  onBack,
  onGenerateQuestPlan,
  onStartQuest,
  onStartRecording,
  onStopRecording,
}: QuestPlanningProps) {
  return (
    <main className="min-h-screen overflow-hidden bg-[#31101b] text-[#fff8e8]">
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col overflow-hidden">
        <div className="pointer-events-none absolute -right-36 -top-32 size-96 rounded-full bg-[#b1454d]/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-40 size-96 rounded-full bg-[#c67c2e]/20 blur-3xl" />

        <header className="relative flex items-center justify-between px-5 pb-4 pt-6">
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
          className="relative mx-5 rounded-xl border border-[#f5d58a]/35 bg-[#531929]/85 px-5 py-4 shadow-[5px_6px_0_rgba(18,5,9,0.3)]"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#8a293c] text-[#f5d58a]">
              <MapPin className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#fff8e8]/55">
                Starting from {locationLabel}
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-[-0.04em]">{questName}</h1>
            </div>
          </div>
        </motion.section>

        <section className="relative mt-5 flex min-h-0 flex-1 flex-col border-y border-[#fff8e8]/15 bg-[#3d1421]/60">
          <div className="border-b border-[#fff8e8]/15 px-5 py-4">
            <p className="text-sm font-bold">Talk it through with your guide</p>
            <p className="mt-1 text-xs leading-5 text-[#fff8e8]/60">
              Shape the pace, stops, and surprises before you head out.
            </p>
          </div>
          <ChatWindow messages={messages} isTyping={isTyping} />
        </section>

        <div className="relative border-t border-[#fff8e8]/15 bg-[#31101b]/95 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold">Want to tune the plan?</p>
              <p className="mt-1 text-[11px] text-[#fff8e8]/55">
                Tap and tell your guide what sounds good.
              </p>
            </div>
            <VoiceButton
              variant="conversation"
              status={recorderStatus}
              durationSeconds={durationSeconds}
              error={recorderError}
              onStart={onStartRecording}
              onStop={onStopRecording}
            />
          </div>
          <button
            type="button"
            onClick={onGenerateQuestPlan}
            disabled={isGeneratingQuestPlan}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-[#f5d58a]/60 bg-[#531929] px-5 py-3 text-sm font-bold text-[#f5d58a] transition hover:bg-[#652033] active:translate-x-0.5 active:translate-y-0.5 disabled:cursor-wait disabled:opacity-70"
          >
            {isGeneratingQuestPlan ? "Generating quest plan..." : "Generate quest plan"}
          </button>
          {hasGeneratedQuestPlan && (
            <p className="mt-3 text-center text-xs text-[#b9ddc8]">
              Three Moss queries are ready in the console.
            </p>
          )}
          {questPlanError && (
            <p className="mt-3 text-center text-xs leading-5 text-[#f3b3a5]">{questPlanError}</p>
          )}
          <button
            type="button"
            onClick={onStartQuest}
            disabled={isTyping || isGeneratingQuestPlan || !hasGeneratedQuestPlan}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-[#f5d58a] bg-[#e5b85f] px-5 py-3.5 text-sm font-bold text-[#31101b] shadow-[4px_5px_0_rgba(18,5,9,0.35)] transition hover:bg-[#f0ca78] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-wait disabled:opacity-70"
          >
            Start Quest
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </main>
  );
}
