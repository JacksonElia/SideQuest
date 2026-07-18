"use client";

import { motion } from "framer-motion";
import { ArrowRight, History, Map, ScrollText } from "lucide-react";

interface QuestWelcomeProps {
  onStartNewQuest: () => void;
  onContinueJourney: () => void;
}

export function QuestWelcome({ onStartNewQuest, onContinueJourney }: QuestWelcomeProps) {
  return (
    <main className="min-h-screen overflow-hidden bg-[#31101b] text-[#fff8e8]">
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-between overflow-hidden px-6 py-7">
        <div className="pointer-events-none absolute -right-36 -top-32 size-96 rounded-full bg-[#b1454d]/35 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-36 size-96 rounded-full bg-[#c67c2e]/30 blur-3xl" />
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-[#e5b85f] text-[#31101b]">
              <ScrollText className="size-4" />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#fff8e8]/65">SideQuest</p>
          </div>
          <span className="rounded-sm border border-[#fff8e8]/20 px-3 py-1.5 text-[10px] font-semibold text-[#fff8e8]/60">
            Trail edition
          </span>
        </motion.div>

        <div className="relative py-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.12, duration: 0.5 }}
            className="mb-8 flex size-20 items-center justify-center rounded-2xl border-2 border-[#f5d58a] bg-[#8a293c] shadow-[6px_7px_0_rgba(18,5,9,0.35)]"
          >
            <Map className="size-10" strokeWidth={1.5} />
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-sm font-bold uppercase tracking-[0.12em] text-[#e5b85f]"
          >
            Your next story starts here
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
            className="mt-3 max-w-xs text-5xl font-semibold leading-[0.98] tracking-[-0.06em]"
          >
            Go somewhere worth remembering.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.36 }}
            className="mt-6 max-w-xs text-base leading-7 text-[#fff8e8]/65"
          >
            A voice-led guide for the curious detours, good pauses, and places you would not find by
            accident.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42 }}
          className="relative space-y-3"
        >
          <button
            type="button"
            onClick={onStartNewQuest}
            className="group flex w-full items-center justify-between rounded-lg border-2 border-[#f5d58a] bg-[#e5b85f] px-5 py-4 text-left text-[#31101b] shadow-[5px_6px_0_rgba(18,5,9,0.35)] transition hover:bg-[#f0ca78] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <span>
              <span className="block text-sm font-bold">Start a new Quest</span>
              <span className="mt-1 block text-xs text-[#5c252b]">Build a fresh little adventure</span>
            </span>
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
          </button>
          <button
            type="button"
            onClick={onContinueJourney}
            className="group flex w-full items-center justify-between rounded-lg border border-[#fff8e8]/30 bg-[#531929] px-5 py-4 text-left text-[#fff8e8] transition hover:bg-[#652033] active:translate-x-0.5 active:translate-y-0.5"
          >
            <span>
              <span className="block text-sm font-bold">Continue on your Journey</span>
              <span className="mt-1 block text-xs text-[#fff8e8]/55">Pick up where you left off</span>
            </span>
            <History className="size-5 text-[#e5b85f] transition-transform group-hover:translate-x-1" />
          </button>
        </motion.div>
      </div>
    </main>
  );
}
