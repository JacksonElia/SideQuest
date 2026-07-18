"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-end gap-2"
    >
      <div className="flex size-7 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm">
        <Sparkles className="size-3.5" />
      </div>
      <div className="flex items-center gap-1.5 rounded-[22px] rounded-bl-md border border-slate-100 bg-slate-50 px-4 py-4">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.8, repeat: Infinity, delay: index * 0.14 }}
            className="size-1.5 rounded-full bg-slate-400"
          />
        ))}
      </div>
    </motion.div>
  );
}
