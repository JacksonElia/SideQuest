/**
 * Records what planning mode learned, and in doing so ends planning mode.
 *
 * The persona describes two modes rather than two agents, so there is no
 * handoff here. Writing the profile is the whole transition: it gives active
 * mode its search radius, and it tells the UI the plan is settled.
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';

import type { TravelProfile, UserData } from '../types.ts';

export const saveTravelProfile = llm.tool({
  name: 'saveTravelProfile',
  description:
    'Record what you have learned about the traveler once you have asked about their trip ' +
    'length, interests, pace, and budget. Call this before you start guiding them, and again ' +
    'if they later change their plans. Pass null for anything they chose to skip.',
  parameters: z.object({
    durationDays: z
      .number()
      .nullable()
      .describe('Roughly how many days they are traveling. Null if they did not say.'),
    interests: z
      .array(z.string())
      .describe(
        'What they are drawn to, in a few short words each, such as history, landscapes, ' +
          'or food. Empty array if they did not say.',
      ),
    activityLevel: z
      .enum(['spry', 'moderate', 'restful'])
      .nullable()
      .describe(
        'How active they want to be. Use spry if they are up for anything, restful if they ' +
          'want something slow and easy, moderate in between. Null if they did not say.',
      ),
    budget: z
      .enum(['free-spending', 'moderate', 'frugal'])
      .nullable()
      .describe('How freely they are spending. Null if they did not say.'),
  }),
  execute: async ({ durationDays, interests, activityLevel, budget }, { ctx }) => {
    const userData = ctx.userData as UserData;

    const profile: TravelProfile = {
      durationDays,
      interests: interests ?? [],
      activityLevel,
      budget,
    };
    userData.profile = profile;

    // The UI update is a nicety; a failed publish must not cost the traveler
    // their profile or interrupt the conversation.
    try {
      await userData.publishProfile?.(profile);
    } catch (err) {
      console.error('[profile] failed to publish to the frontend:', err);
    }

    return {
      saved: true,
      note: 'Their plan is noted. Recap it warmly in a sentence or two, then start guiding them.',
    };
  },
});
