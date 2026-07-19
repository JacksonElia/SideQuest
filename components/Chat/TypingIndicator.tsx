"use client";

import { motion } from "framer-motion";
import { Compass } from "lucide-react";

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-end gap-3 px-1"
    >
      <div className="flex size-7 items-center justify-center rounded-lg bg-[#31101b] text-[#f5d58a] shadow-sm">
        <Compass className="size-3.5" />
      </div>
      <div className="flex flex-col items-start gap-1.5 rounded-xl rounded-bl-none border-2 border-[#d7bb95] bg-[#f5eddf] px-4 py-3">
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#9c3b43]">
          SideQuest
        </span>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((index) => (
            <motion.span
              key={index}
              animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: index * 0.14 }}
              className="size-1.5 rounded-full bg-[#9c3b43]"
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
