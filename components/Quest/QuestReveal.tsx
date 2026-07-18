"use client";

import { motion } from "framer-motion";
import { ArrowRight, Compass, Flag } from "lucide-react";

interface QuestRevealProps {
  questName: string;
  onContinue: () => void;
}

export function QuestReveal({ questName, onContinue }: QuestRevealProps) {
  return (
    <main className="min-h-screen overflow-hidden bg-[#31101b] text-[#fff8e8]">
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
          className="pointer-events-none absolute -right-36 top-12 size-80 rounded-full border border-[#e5b85f]/25"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="pointer-events-none absolute -left-40 bottom-16 size-96 rounded-full border border-[#c67c2e]/30"
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(198,124,46,0.25),transparent_48%)]" />

        <motion.div
          initial={{ opacity: 0, scale: 0.7, rotate: -12 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 180, damping: 14 }}
          className="relative flex size-24 items-center justify-center rounded-2xl border-2 border-[#f5d58a] bg-[#8a293c] shadow-[7px_8px_0_rgba(18,5,9,0.4)]"
        >
          <Compass className="size-12" strokeWidth={1.4} />
          <Flag className="absolute -right-3 -top-3 size-7 text-[#e5b85f]" />
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="relative mt-10 text-sm font-bold uppercase tracking-[0.24em] text-[#e5b85f]"
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
          className="relative mt-6 max-w-xs text-sm leading-6 text-[#fff8e8]/65"
        >
          A little route, a few good surprises, and plenty of room to change your mind.
        </motion.p>
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75 }}
          type="button"
          onClick={onContinue}
          className="relative mt-12 flex items-center gap-2 rounded-lg border-2 border-[#f5d58a] bg-[#e5b85f] px-5 py-3 text-sm font-bold text-[#31101b] shadow-[4px_5px_0_rgba(18,5,9,0.35)] transition hover:bg-[#f0ca78] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
        >
          Begin the adventure
          <ArrowRight className="size-4" />
        </motion.button>
      </div>
    </main>
  );
}
