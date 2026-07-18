"use client";

import { useEffect, useRef } from "react";
import type { Message } from "@/types/message";
import { ChatMessage } from "./ChatMessage";
import { TypingIndicator } from "./TypingIndicator";

interface ChatWindowProps {
  messages: Message[];
  isTyping: boolean;
}

export function ChatWindow({ messages, isTyping }: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, isTyping]);

  return (
    <div ref={scrollRef} className="chat-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
      {messages.map((message) => (
        <ChatMessage key={message.id} message={message} />
      ))}
      {isTyping && <TypingIndicator />}
    </div>
  );
}
