/**
 * Hand-written declarations for brightdata-fetch.js — the tsconfig sets
 * allowJs: false, so TypeScript routes cannot see the JS module without this.
 */

/**
 * Fetch the nearby-interest queries for the given location and index all
 * successful results in one Moss batch. Fail-soft: resolves 0 on a missing
 * API key or indexing failure instead of throwing.
 */
export function fetchAndIndexNearby(
  locationLabel?: string,
  lat?: number,
  lng?: number,
): Promise<number>;
