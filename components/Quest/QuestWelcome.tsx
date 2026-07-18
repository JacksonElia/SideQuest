"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Compass, History, MapPinned } from "lucide-react";

interface QuestWelcomeProps {
  onStartNewQuest: () => void;
  onContinueJourney: () => void;
}

export function QuestWelcome({ onStartNewQuest, onContinueJourney }: QuestWelcomeProps) {
  return (
    <main className="h-dvh overflow-hidden bg-[#071d2e] text-[#f7f3e8]">
      <div className="relative mx-auto flex h-full w-full max-w-md flex-col justify-between overflow-hidden px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(131,176,191,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(131,176,191,0.12)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="pointer-events-none absolute -right-36 -top-36 size-[28rem] rounded-full bg-[#167a88]/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-40 size-[30rem] rounded-full bg-[#e66f37]/20 blur-3xl" />
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 top-24 h-[28rem] w-[29rem] text-[#6cc5bc]/35"
          viewBox="0 0 460 460"
          fill="none"
        >
          <path
            d="M438 22C349 59 388 137 291 135C197 133 238 223 149 237C60 251 99 354 14 425"
            stroke="currentColor"
            strokeDasharray="3 12"
            strokeLinecap="round"
            strokeWidth="4"
          />
          <circle cx="438" cy="22" r="9" fill="#f5b44b" />
          <circle cx="14" cy="425" r="9" fill="#f5b44b" />
        </svg>
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative flex shrink-0 items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-full bg-[#f5b44b] text-[#071d2e] shadow-[3px_3px_0_rgba(0,0,0,0.25)]">
              <Compass className="size-4" strokeWidth={2.4} />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#f7f3e8]/80">
              SideQuest
            </p>
          </div>
        </motion.div>

        {/* The hero absorbs whatever height is left over, so short screens lose
            breathing room around the artwork rather than pushing the buttons off. */}
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center py-4 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.12, duration: 0.5 }}
            className="mb-5 flex shrink items-center justify-center text-[#f7f3e8]"
          >
            <MapPinned className="size-20 sm:size-28" strokeWidth={1.4} />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
            className="max-w-sm text-4xl font-semibold leading-[0.94] tracking-[-0.065em] sm:text-5xl"
          >
            Let&apos;s go
            <br />
            exploring.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.36 }}
            className="mt-4 max-w-sm text-sm leading-6 text-[#d1e4df]/75 sm:text-base sm:leading-7"
          >
            Pick a starting point. We&apos;ll find the interesting turns, the good stops, and a
            route worth following.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42 }}
          className="relative shrink-0 space-y-3"
        >
          <button
            type="button"
            onClick={onStartNewQuest}
            className="group flex w-full items-center justify-center gap-3 rounded-xl border-2 border-[#f8d477] bg-[#f5b44b] px-6 py-5 text-center text-xl font-bold text-[#071d2e] shadow-[5px_6px_0_rgba(0,0,0,0.3)] transition hover:bg-[#f8c563] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Plan your journey
            <ArrowUpRight className="size-6 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
          </button>
          <button
            type="button"
            onClick={onContinueJourney}
            className="group flex w-full items-center justify-center gap-3 rounded-xl border border-[#8bc7c4]/30 bg-[#0b2a3b]/75 px-6 py-4 text-center text-lg font-bold text-[#f7f3e8] transition hover:bg-[#12384a] active:translate-x-0.5 active:translate-y-0.5"
          >
            Keep exploring
            <History className="size-5 text-[#f5b44b] transition-transform group-hover:translate-x-1" />
          </button>
        </motion.div>
      </div>
    </main>
  );
}
