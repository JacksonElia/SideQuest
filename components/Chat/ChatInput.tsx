"use client";

import { useState, type FormEvent } from "react";
import { SendHorizontal } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  disabled?: boolean;
  placeholder?: string;
  /** Sends a typed message to the local text guide. */
  onSend: (text: string) => Promise<void>;
}

export function ChatInput({ disabled = false, placeholder, onSend }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);

  const canSend = value.trim().length > 0 && !isSending && !disabled;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSend) return;

    const text = value;
    // Clear optimistically so the box is ready for the next thought; restore it
    // if the send fails, rather than silently eating what they typed.
    setValue("");
    setIsSending(true);
    try {
      await onSend(text);
    } catch {
      setValue(text);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={disabled}
        placeholder={placeholder ?? "Ask your guide anything…"}
        aria-label="Message your guide"
        className="min-w-0 flex-1 rounded-lg border border-[#c7ac84] bg-[#fffaf0] px-3.5 py-2.5 text-sm text-[#31101b] placeholder:text-[#a08a78] focus:border-[#9c3b43] focus:outline-none focus:ring-2 focus:ring-[#9c3b43]/20 disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Send message"
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg text-white transition",
          canSend ? "bg-[#8a293c] hover:bg-[#9c3b43] active:scale-95" : "bg-[#c7ac84]",
        )}
      >
        {isSending ? (
          <Spinner className="size-4" label="Sending" />
        ) : (
          <SendHorizontal className="size-4" />
        )}
      </button>
    </form>
  );
}
