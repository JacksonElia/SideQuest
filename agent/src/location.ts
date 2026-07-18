/**
 * Decoding the traveler's position from the two places it arrives.
 *
 * Pure functions, no SDK imports — this is the layer under test. It mirrors the
 * encoders in the Next app (lib/server/location.ts and lib/server/livekit.ts);
 * the wire formats below are that module's output and must stay in step with it.
 */

import type { Fix } from './types.ts';

/** Attribute keys written by the browser via setAttributes(). */
const ATTR_LAT = 'sidequest.lat';
const ATTR_LNG = 'sidequest.lng';
const ATTR_ACCURACY = 'sidequest.accuracy_m';
const ATTR_FIX_TS = 'sidequest.fix_ts';

/** Schema tag on the job metadata seeded at dispatch. */
const METADATA_SCHEMA = 'sidequest.location.v1';

/**
 * Parse a coordinate that arrived as a string.
 *
 * Number() is deliberately avoided: it maps '' and whitespace to 0, which would
 * silently place the traveler off the coast of Africa rather than failing.
 */
function parseCoord(value: string | undefined): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inRange(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Read a fix out of LiveKit participant attributes.
 *
 * Returns null rather than throwing: attributes are updated live by an untrusted
 * client, and a malformed update should fall through to the previous fix instead
 * of taking down a tool call.
 */
export function fixFromAttributes(attributes: Record<string, string> | undefined): Fix | null {
  if (!attributes) return null;

  const lat = parseCoord(attributes[ATTR_LAT]);
  const lng = parseCoord(attributes[ATTR_LNG]);
  if (lat === null || lng === null || !inRange(lat, lng)) return null;

  return {
    lat,
    lng,
    accuracyM: parseCoord(attributes[ATTR_ACCURACY]),
    ts: parseCoord(attributes[ATTR_FIX_TS]),
  };
}

/**
 * Read the seed fix out of the dispatch job metadata.
 *
 * This is what gives the guide coordinates at job start, before the browser has
 * published its first attribute update.
 */
export function fixFromJobMetadata(metadata: string | undefined): Fix | null {
  if (!metadata) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const envelope = parsed as { schema?: unknown; location?: unknown };
  if (envelope.schema !== METADATA_SCHEMA) return null;
  if (typeof envelope.location !== 'object' || envelope.location === null) return null;

  const location = envelope.location as Record<string, unknown>;
  const { lat, lng } = location;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inRange(lat, lng)) return null;

  const accuracy = location.accuracy_m;
  const fixTs = location.fix_ts;

  return {
    lat,
    lng,
    accuracyM: typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null,
    ts: typeof fixTs === 'number' && Number.isFinite(fixTs) ? fixTs : null,
  };
}
