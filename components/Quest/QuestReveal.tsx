"use client";

import { motion } from "framer-motion";
import { ArrowRight, Compass, Sparkles } from "lucide-react";

interface QuestRevealProps {
  questName: string;
  onContinue: () => void;
}

export function QuestReveal({ questName, onContinue }: QuestRevealProps) {
  return (
    <main className="min-h-screen overflow-hidden bg-[#101114] text-white">
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
          className="pointer-events-none absolute -right-36 top-12 size-80 rounded-full border border-blue-300/20"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="pointer-events-none absolute -left-40 bottom-16 size-96 rounded-full border border-violet-300/20"
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.18),transparent_48%)]" />

        <motion.div
          initial={{ opacity: 0, scale: 0.7, rotate: -12 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 180, damping: 14 }}
          className="relative flex size-24 items-center justify-center rounded-[30px] bg-gradient-to-br from-blue-400 to-violet-500 shadow-2xl shadow-blue-500/30"
        >
          <Compass className="size-12" strokeWidth={1.4} />
          <Sparkles className="absolute -right-3 -top-3 size-7 text-yellow-300" />
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="relative mt-10 text-sm font-bold uppercase tracking-[0.24em] text-blue-300"
        >
          Here’s the Quest
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="relative mt-4 max-w-sm text-5xl font-semibold leading-[0.95] tracking-[-0.06em]"
        >
          {questName}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
          className="relative mt-6 max-w-xs text-sm leading-6 text-white/55"
        >
          A little route, a few good surprises, and plenty of room to change your mind.
        </motion.p>
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75 }}
          type="button"
          onClick={onContinue}
          className="relative mt-12 flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-blue-50 active:scale-95"
        >
          Begin the adventure
          <ArrowRight className="size-4" />
        </motion.button>
      </div>
    </main>
  );
}
