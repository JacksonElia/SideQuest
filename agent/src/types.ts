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
  /**
   * Most recent fix seen. Seeded from the dispatch metadata and then kept
   * current by the participant-attribute listener in main.ts, so tools can read
   * it directly instead of reaching back into the room.
   */
  lastFix: Fix | null;
  /**
   * Pushes the saved profile to the browser so the UI can render it.
   *
   * Injected by main.ts because the room lives on the JobContext, which tools
   * have no handle on. Optional so the tools remain testable without a room.
   */
  publishProfile?: (profile: TravelProfile) => Promise<void>;
}

export function createUserData(initialFix: Fix | null): UserData {
  return { profile: null, lastFix: initialFix };
}
