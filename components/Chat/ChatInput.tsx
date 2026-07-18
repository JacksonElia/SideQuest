"use client";

import { motion } from "framer-motion";
import { ArrowUp } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function ChatInput({ value, onChange, onSubmit }: ChatInputProps) {
  return (
    <div className="border-t border-slate-100 bg-white p-3">
      <div className="flex items-end gap-2 rounded-[22px] border border-slate-200 bg-slate-50 p-1.5 pl-4 transition-colors focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100/70">
        <textarea
          id="chat-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          rows={1}
          placeholder="Ask about somewhere nearby..."
          className="max-h-24 min-h-10 flex-1 resize-none bg-transparent py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
          aria-label="Message your walking guide"
        />
        <motion.button
          whileTap={{ scale: 0.9 }}
          type="button"
          onClick={onSubmit}
          disabled={!value.trim()}
          className="flex size-10 shrink-0 items-center justify-center rounded-[17px] bg-slate-950 text-white shadow-sm transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          aria-label="Send message"
        >
          <ArrowUp className="size-4" strokeWidth={2.5} />
        </motion.button>
      </div>
      <p className="px-2 pt-2 text-center text-[10px] font-medium text-slate-400">
        Your guide is powered by curiosity, not certainty.
      </p>
    </div>
  );
}
