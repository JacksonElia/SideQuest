/**
 * OpenAI Realtime tool definitions sent to the model via session.update.
 *
 * Kept in lockstep with the server-side executor in app/api/tool/route.ts and
 * the schema docs in data/SCHEMA.md. The model calls these by name; the
 * browser receives the call, POSTs to /api/tool, and we return the output.
 */

import type { OpenAIConfig } from './config.ts';

export interface RealtimeTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const FIND_NEARBY_PLACES_TOOL: RealtimeTool = {
  type: 'function',
  name: 'findNearbyPlaces',
  description:
    "Look up real places near the traveler's current position. Use this whenever they ask " +
    'what is around, where to eat or drink, what is worth seeing, or where to go next. ' +
    'Describe the results in your own words; never read them out verbatim. If it returns ' +
    'nothing, say so plainly and offer to widen the search.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      utterance: {
        type: 'string',
        description:
          'What the traveler is looking for, in natural language, as they described it. ' +
          'For example "a quiet cafe to sit and read" or "somewhere with a view of the bay". ' +
          "Include their interests when relevant; do not include coordinates or distances.",
      },
      radiusMin: {
        type: ['number', 'null'],
        description:
          'How many minutes they are willing to walk. Omit or null unless they said something ' +
          'specific about distance; their usual pace is applied automatically.',
      },
      indoor: {
        type: ['boolean', 'null'],
        description: 'Set true for indoor places or false for outdoor ones. Omit or null if it does not matter.',
      },
      maxBusyness: {
        type: ['number', 'null'],
        description:
          'Highest acceptable crowd level, zero to one hundred. Use around thirty when they ' +
          'ask for somewhere quiet. Omit or null if it does not matter.',
      },
    },
    required: ['utterance'],
  },
};

/** Tools the browser installs via session.update after WebRTC connects. */
export const REALTIME_TOOLS: RealtimeTool[] = [FIND_NEARBY_PLACES_TOOL];

/**
 * The session.update payload the browser sends right after the data channel
 * opens. Model and voice come from the server mint; the client never picks them
 * itself (so a malicious page can't downgrade the model or swap voices).
 */
export function buildSessionUpdate(
  cfg: OpenAIConfig,
  instructions: string,
  tools: RealtimeTool[],
): Record<string, unknown> {
  return {
    type: 'session.update',
    session: {
      modalities: ['text', 'audio'],
      instructions,
      voice: cfg.voice,
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      turn_detection: { type: 'server_vad' },
      tools,
      tool_choice: 'auto',
    },
  };
}