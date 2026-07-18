/**
 * Pure location logic. No I/O, no SDK imports — this is the layer under test.
 *
 * Two rules from AGENTS.md drive everything here:
 *   #3 Numbers and conditions go in metadata filters, never into embedded text.
 *   #5 Location is a RUNTIME input. Nothing in this file knows about any
 *      particular city; every function takes arbitrary coordinates.
 */

/** LiveKit warns attributes are unsuitable for updates more than once every few seconds. */
export const MIN_PUBLISH_INTERVAL_MS = 5000;

/** Below this, movement is indistinguishable from consumer-GPS jitter. */
export const MIN_PUBLISH_DISTANCE_M = 25;

const EARTH_RADIUS_M = 6371008.8; // IUGG mean radius

export interface Fix {
  lat: number;
  lng: number;
  accuracy?: number | null;
}

export interface TimedFix extends Fix {
  ts: number;
}

export type ValidatedFix =
  | { ok: true; value: { lat: number; lng: number; accuracy: number | null } }
  | { ok: false; error: string };

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Validate a GPS fix from an untrusted client.
 * Returns {ok:true, value} or {ok:false, error} — never throws, so the HTTP
 * layer can turn a bad fix into a 400 instead of a 500.
 */
export function validateFix(fix: unknown): ValidatedFix {
  if (fix === null || typeof fix !== 'object') {
    return { ok: false, error: 'fix must be an object with lat and lng' };
  }

  const { lat, lng, accuracy } = fix as Partial<Fix>;

  // Strings are deliberately not coerced: "37.78" from a query string is a bug
  // upstream, and silently accepting it hides it.
  if (!isFiniteNumber(lat)) return { ok: false, error: 'lat must be a finite number' };
  if (!isFiniteNumber(lng)) return { ok: false, error: 'lng must be a finite number' };
  if (lat < -90 || lat > 90) return { ok: false, error: 'lat must be within [-90, 90]' };
  if (lng < -180 || lng > 180) return { ok: false, error: 'lng must be within [-180, 180]' };

  if (accuracy !== undefined && accuracy !== null) {
    if (!isFiniteNumber(accuracy)) return { ok: false, error: 'accuracy must be a finite number' };
    if (accuracy < 0) return { ok: false, error: 'accuracy must be non-negative' };
  }

  return { ok: true, value: { lat, lng, accuracy: accuracy ?? null } };
}

/**
 * Great-circle distance in metres between two fixes.
 * Haversine handles the antimeridian correctly because it works on the sine of
 * the half-delta — a naive `lngA - lngB` would report ~40000km for two points
 * a few metres either side of 180°.
 */
export function haversineMeters(a: Pick<Fix, 'lat' | 'lng'>, b: Pick<Fix, 'lat' | 'lng'>): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLng = toRad(b.lng - a.lng);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Should this fix be published as a participant attribute?
 *
 * Gated on time AND distance. Raw `watchPosition` fires several times a second;
 * publishing each one would hammer the LiveKit server and, per the docs, is an
 * unsupported use of attributes.
 */
export function shouldPublishFix(
  prev: TimedFix | null,
  next: TimedFix,
  opts: { minIntervalMs?: number; minDistanceM?: number } = {},
): boolean {
  const minInterval = opts.minIntervalMs ?? MIN_PUBLISH_INTERVAL_MS;
  const minDistance = opts.minDistanceM ?? MIN_PUBLISH_DISTANCE_M;

  if (!prev) return true; // first fix always goes out
  if (next.ts - prev.ts < minInterval) return false;

  return haversineMeters(prev, next) >= minDistance;
}

/** ~1m at the equator; enough for a walking guide, and avoids leaking spurious precision. */
const COORD_DECIMALS = 5;

const trimNumber = (n: number, decimals: number) => String(Number(n.toFixed(decimals)));

/**
 * Encode a fix as LiveKit participant attributes.
 *
 * Attributes are Record<string, string>, so every value is stringified
 * explicitly. Each number stays a discrete field the agent can filter on —
 * never a sentence like "you are near 37.78, -122.39", which would put
 * coordinates into text the LLM reasons over (AGENTS.md #3).
 */
export function encodeLocationAttributes(fix: TimedFix): Record<string, string> {
  const result = validateFix(fix);
  if (!result.ok) throw new Error(`invalid fix: ${result.error}`);

  const { lat, lng, accuracy } = result.value;

  const attrs: Record<string, string> = {
    'sidequest.lat': trimNumber(lat, COORD_DECIMALS),
    'sidequest.lng': trimNumber(lng, COORD_DECIMALS),
    'sidequest.fix_ts': String(fix.ts),
  };

  // Omitted rather than set to the string "null", which an agent reading
  // attributes would have to special-case.
  if (accuracy !== null) {
    attrs['sidequest.accuracy_m'] = trimNumber(accuracy, 1);
  }

  return attrs;
}
