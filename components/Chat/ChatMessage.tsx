"use client";

import { motion } from "framer-motion";
import { Compass, Headphones } from "lucide-react";
import Image from "next/image";
import type { Message } from "@/types/message";
import { cn, formatDuration } from "@/lib/utils";

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
      className={cn("flex items-end gap-2", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && (
        <div className="mb-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#31101b] text-[#f5d58a] shadow-sm">
          <Compass className="size-3.5" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[82%] rounded-lg px-4 py-3 text-sm leading-6 shadow-sm",
          isUser
            ? "rounded-br-none bg-[#8a293c] text-[#fff8e8] shadow-[#5c252b]/15"
            : "rounded-bl-none border border-[#dfceb1] bg-[#f5eddf] text-[#5c252b]",
        )}
      >
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
        {message.kind === "voice" && (
          <div className="flex min-w-40 items-center gap-3">
            <div
              className={cn(
                "flex size-9 items-center justify-center rounded-full",
                isUser ? "bg-[#6b1f32] text-[#f5d58a]" : "bg-[#fffaf0] text-[#9c3b43]",
              )}
            >
              <Headphones className="size-4" />
            </div>
            <div className="flex-1">
              <div
                className={cn(
                  "flex items-center gap-1",
                  isUser ? "text-[#f5d58a]" : "text-[#8c6a5f]",
                )}
              >
                {[3, 6, 10, 5, 8, 4, 7, 3].map((height, index) => (
                  <span
                    key={`${height}-${index}`}
                    className={cn(
                      "w-0.5 rounded-full",
                      isUser ? "bg-[#e5b85f]" : "bg-[#c67c2e]",
                    )}
                    style={{ height }}
                  />
                ))}
              </div>
              <p className={cn("mt-1 text-xs", isUser ? "text-[#f5d58a]" : "text-[#8c6a5f]")}>
                Voice note · {formatDuration(message.durationSeconds)}
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.article>
  );
}
