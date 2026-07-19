"use client";

import { motion } from "framer-motion";
import { Compass } from "lucide-react";
import Image from "next/image";
import type { Message } from "@/types/message";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <motion.article
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className={cn(
        "flex items-end gap-3 px-1",
        isUser ? "justify-end pl-4" : "justify-start pr-4",
      )}
    >
      {!isUser && (
        <div className="mb-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#31101b] text-[#f5d58a] shadow-sm">
          <Compass className="size-3.5" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[82%] space-y-1.5 rounded-xl px-4 py-3 text-sm leading-6 shadow-sm",
          isUser
            ? "rounded-br-none border-2 border-[#6b1f32] bg-[#8a293c] text-[#fff8e8] shadow-[#5c252b]/15"
            : "rounded-bl-none border-2 border-[#d7bb95] bg-[#f5eddf] text-[#5c252b]",
        )}
      >
        <p
          className={cn(
            "text-[9px] font-bold uppercase tracking-[0.18em]",
            isUser ? "text-[#f5d58a]" : "text-[#9c3b43]",
          )}
        >
          {isUser ? "You" : "SideQuest"}
        </p>
        {message.kind === "text" && <p>{message.text}</p>}
        {message.kind === "image" && (
          <div className="space-y-2">
            <Image
              src={message.imageUrl}
              alt={message.alt}
              width={640}
              height={480}
              unoptimized
              className="max-h-56 w-full rounded-2xl object-cover"
            />
            <p className={cn("text-xs", isUser ? "text-[#f5d58a]" : "text-[#8c6a5f]")}>
              Photo shared with your guide
            </p>
          </div>
        )}
      </div>
    </motion.article>
  );
}
