import { voice } from '@livekit/agents';

import { INSTRUCTIONS } from './prompt.ts';
import { findNearbyPlaces } from './tools/places.ts';
import { saveTravelProfile } from './tools/profile.ts';
import type { UserData } from './types.ts';

/**
 * One agent for both halves of the experience.
 *
 * Planning and active mode share this persona and this tool set; the prompt
 * decides which mode it is in, and saveTravelProfile is what moves it along.
 */
export function createGuideAgent(): voice.Agent<UserData> {
  return voice.Agent.create<UserData>({
    instructions: INSTRUCTIONS,
    tools: [saveTravelProfile, findNearbyPlaces],
  });
}
