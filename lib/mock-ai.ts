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

export function createPlanningMessages(questName: string, locationLabel: string): Message[] {
  return [
    {
      id: "assistant-plan",
      role: "assistant",
      kind: "text",
      text: `You’re starting in ${locationLabel}. I’ve mapped out ${questName}: a loose route with a good first stop, an unexpected turn, and room to follow your curiosity. Want to make it calmer, weirder, or more food-focused?`,
      createdAt: new Date().toISOString(),
    },
  ];
}

export function createAssistantMessage(id: string): Message {
  return {
    id,
    role: "assistant",
    kind: "text",
    text: MOCK_ASSISTANT_RESPONSE,
    createdAt: new Date().toISOString(),
  };
}
