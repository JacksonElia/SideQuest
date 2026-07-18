/** A GPS fix the agent can act on. */
export interface Fix {
  lat: number;
  lng: number;
  accuracyM: number | null;
  /** Epoch ms of the reading, so staleness is visible to callers. */
  ts: number | null;
}

/** How willing the traveler is to walk. Drives the search radius. */
export type ActivityLevel = 'spry' | 'moderate' | 'restful';

export type Budget = 'free-spending' | 'moderate' | 'frugal';

/**
 * What the guide learned in planning mode.
 *
 * Every field is nullable: the persona explicitly allows the traveler to skip
 * any question, so a partial profile must still be recordable.
 */
export interface TravelProfile {
  durationDays: number | null;
  interests: string[];
  activityLevel: ActivityLevel | null;
  budget: Budget | null;
}

/**
 * Session state shared across tool calls.
 *
 * `profile === null` is what "still in planning mode" means; saveTravelProfile
 * filling it in is the mode transition.
 */
export interface UserData {
  profile: TravelProfile | null;
  /** Most recent fix seen, from participant attributes or the dispatch metadata. */
  lastFix: Fix | null;
  /** Identity of the traveler, used to read their attributes off the room. */
  participantIdentity: string | null;
}

export function createUserData(initialFix: Fix | null): UserData {
  return { profile: null, lastFix: initialFix, participantIdentity: null };
}
