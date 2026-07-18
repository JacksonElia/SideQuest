"use client";

import { motion } from "framer-motion";
import { Compass } from "lucide-react";

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-end gap-2"
    >
      <div className="flex size-7 items-center justify-center rounded-lg bg-[#31101b] text-[#f5d58a] shadow-sm">
        <Compass className="size-3.5" />
      </div>
      <div className="flex items-center gap-1.5 rounded-lg rounded-bl-none border border-[#dfceb1] bg-[#f5eddf] px-4 py-4">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.8, repeat: Infinity, delay: index * 0.14 }}
            className="size-1.5 rounded-full bg-[#9c3b43]"
          />
        ))}
      </div>
    </motion.div>
  );
}
