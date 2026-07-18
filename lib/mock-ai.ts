import type { Message } from "@/types/message";

export const MOCK_ASSISTANT_RESPONSE =
  "That sounds fun! Here are a few places nearby you might enjoy.";

// TODO: Replace this local response adapter with the future AI conversation service.
export const INITIAL_MESSAGES: Message[] = [
  {
    id: "assistant-welcome",
    role: "assistant",
    kind: "text",
    text: "Hi! I’m your walking guide. Tell me what kind of adventure sounds good today.",
    createdAt: "2026-07-18T17:00:00.000Z",
  },
];

export function createAssistantMessage(id: string): Message {
  return {
    id,
    role: "assistant",
    kind: "text",
    text: MOCK_ASSISTANT_RESPONSE,
    createdAt: new Date().toISOString(),
  };
}
