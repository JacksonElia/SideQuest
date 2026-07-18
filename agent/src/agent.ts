import { voice } from '@livekit/agents';

import { INSTRUCTIONS } from './prompt.ts';
import { findNearbyPlaces } from './tools/places.ts';
import type { UserData } from './types.ts';

/**
 * The guide is a single-purpose question-answerer about the city.
 *
 * There is deliberately no trip-planning tool: the traveler asks, the guide
 * answers. Anything that would require interviewing them first is out of scope.
 */
export function createGuideAgent(): voice.Agent<UserData> {
  return voice.Agent.create<UserData>({
    instructions: INSTRUCTIONS,
    tools: [findNearbyPlaces],
  });
}
