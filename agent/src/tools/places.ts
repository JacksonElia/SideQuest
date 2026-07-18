/** The guide's one lookup tool: what's worth visiting near the traveler right now. */

import { llm } from '@livekit/agents';
import { z } from 'zod';

import { lookupPlaces } from '../moss.ts';
import type { UserData } from '../types.ts';

export const findNearbyPlaces = llm.tool({
  name: 'findNearbyPlaces',
  description:
    "Look up real places near the traveler's current position. Use this whenever they ask " +
    'what is around, where to eat or drink, what is worth seeing, or where to go next. ' +
    'Describe the results in your own words; never read them out verbatim. If it returns ' +
    'nothing, say so plainly and offer to widen the search.',
  parameters: z.object({
    utterance: z
      .string()
      .describe(
        'What the traveler is looking for, in natural language, as they described it. ' +
          'For example "a quiet cafe to sit and read" or "somewhere with a view of the bay". ' +
          'Include their interests when relevant; do not include coordinates or distances.',
      ),
    radiusMin: z
      .number()
      .nullable()
      .optional()
      .describe(
        'How many minutes they are willing to walk. Omit unless they said something ' +
          'specific about distance; their usual pace is applied automatically.',
      ),
    indoor: z
      .boolean()
      .nullable()
      .optional()
      .describe('Set true for indoor places or false for outdoor ones. Omit if it does not matter.'),
    maxBusyness: z
      .number()
      .nullable()
      .optional()
      .describe(
        'Highest acceptable crowd level, zero to one hundred. Use around thirty when they ' +
          'ask for somewhere quiet. Omit if it does not matter.',
      ),
  }),
  execute: async ({ utterance, radiusMin, indoor, maxBusyness }, { ctx, abortSignal }) => {
    const userData = ctx.userData as UserData;

    // lastFix is kept current by the attribute listener in main.ts, so this is
    // already the freshest position the traveler's browser has published.
    const fix = userData.lastFix;
    if (!fix) {
      // ToolError reaches the model as a normal result, so the guide can say this
      // gracefully rather than the framework swallowing it as an internal error.
      throw new llm.ToolError(
        "I don't have your location just yet. Ask the traveler to allow location access, " +
          'then try again.',
      );
    }

    const { places, warnings } = await lookupPlaces({
      fix,
      utterance,
      radiusMin,
      indoor,
      maxBusyness,
      profile: userData.profile,
      signal: abortSignal,
    });

    if (!places.length) {
      return {
        places: [],
        note: warnings.length
          ? warnings.join(' ')
          : 'Nothing suitable was found nearby. Offer to widen the search or try something else.',
      };
    }

    return { places, warnings };
  },
});
