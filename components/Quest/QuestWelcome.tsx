"use client";

import { motion } from "framer-motion";
import { ArrowRight, Compass, History, Sparkles } from "lucide-react";

interface QuestWelcomeProps {
  onStartNewQuest: () => void;
  onContinueJourney: () => void;
}

export function QuestWelcome({ onStartNewQuest, onContinueJourney }: QuestWelcomeProps) {
  return (
    <main className="min-h-screen overflow-hidden bg-[#101114] text-white">
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-between overflow-hidden px-6 py-7">
        <div className="pointer-events-none absolute -right-36 -top-32 size-96 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-36 size-96 rounded-full bg-violet-500/25 blur-3xl" />
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-white text-slate-950">
              <Sparkles className="size-4" />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/60">SideQuest</p>
          </div>
          <span className="rounded-full border border-white/15 px-3 py-1.5 text-[10px] font-semibold text-white/50">
            A little adventure
          </span>
        </motion.div>

        <div className="relative py-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.12, duration: 0.5 }}
            className="mb-8 flex size-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-blue-400 to-violet-500 shadow-2xl shadow-blue-500/20"
          >
            <Compass className="size-10" strokeWidth={1.5} />
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-sm font-semibold text-blue-300"
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
            className="mt-6 max-w-xs text-base leading-7 text-white/55"
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
            className="group flex w-full items-center justify-between rounded-[22px] bg-white px-5 py-4 text-left text-slate-950 shadow-xl shadow-black/20 transition hover:bg-blue-50 active:scale-[0.98]"
          >
            <span>
              <span className="block text-sm font-bold">Start a new Quest</span>
              <span className="mt-1 block text-xs text-slate-500">Build a fresh little adventure</span>
            </span>
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
          </button>
          <button
            type="button"
            onClick={onContinueJourney}
            className="group flex w-full items-center justify-between rounded-[22px] border border-white/15 bg-white/5 px-5 py-4 text-left text-white backdrop-blur transition hover:bg-white/10 active:scale-[0.98]"
          >
            <span>
              <span className="block text-sm font-bold">Continue on your Journey</span>
              <span className="mt-1 block text-xs text-white/45">Pick up where you left off</span>
            </span>
            <History className="size-5 text-white/60 transition-transform group-hover:translate-x-1" />
          </button>
        </motion.div>
      </div>
    </main>
  );
}
