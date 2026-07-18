/**
 * The bridge from the voice agent to Moss.
 *
 * Retrieval deliberately goes over HTTP to the Next app's POST /api/query rather
 * than importing lib/server/query.ts directly. That route already owns input
 * validation, the fail-soft contract, and the long-lived Moss index handle, and
 * @moss-dev/moss is a native addon we do not want loaded into the agent's job
 * processes as well.
 *
 * `fetch` is injected so the whole module is testable without a server.
 */

import type { ActivityLevel, Fix, TravelProfile } from './types.ts';

/** Shape returned by POST /api/query (lib/server/query.ts QueryResult). */
interface QueryResponse {
  chunks: Array<{ text: string; score: number; metadata: Record<string, unknown> }>;
  latency_ms: number;
  warnings: string[];
  user_facts: unknown[];
}

/** One place, flattened to what the guide actually needs to speak about it. */
export interface NearbyPlace {
  name: string;
  kind: string | null;
  /** Scraped third-party prose. Untrusted — see TOOL_SAFETY_NOTE in prompt.ts. */
  description: string;
  walkingMinutes: number | null;
  indoor: boolean | null;
  busynessPct: number | null;
}

export interface LookupResult {
  places: NearbyPlace[];
  /** Degradation notices from the query layer, passed through for the guide to voice. */
  warnings: string[];
}

export interface LookupOptions {
  fix: Fix;
  utterance: string;
  radiusMin?: number | null;
  indoor?: boolean | null;
  maxBusyness?: number | null;
  profile?: TravelProfile | null;
  signal?: AbortSignal;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Walking-radius budget in minutes for each activity level.
 *
 * The query layer converts minutes to metres at 80 m/min (query.ts
 * METRES_PER_RADIUS_MINUTE), so these are roughly 2 km / 1.2 km / 640 m.
 */
const RADIUS_BY_ACTIVITY: Record<ActivityLevel, number> = {
  spry: 25,
  moderate: 15,
  restful: 8,
};

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_BASE_URL = 'http://localhost:3000';
/** Matches the 500-char cap enforced by the route, so we fail here rather than there. */
const MAX_UTTERANCE_CHARS = 500;
const METRES_PER_WALKING_MINUTE = 80;

export function apiBaseUrl(): string {
  return process.env.SIDEQUEST_API_URL || DEFAULT_BASE_URL;
}

/**
 * Choose the search radius.
 *
 * An explicit radius from the LLM wins — the traveler may have just said "I'll
 * go a bit further for good coffee". Otherwise it comes from what planning mode
 * learned about their pace.
 */
export function resolveRadiusMin(
  explicit: number | null | undefined,
  profile: TravelProfile | null | undefined,
): number | null {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  const level = profile?.activityLevel;
  return level ? RADIUS_BY_ACTIVITY[level] : null;
}

const EARTH_RADIUS_M = 6371008.8;

/** Great-circle distance in metres. Mirrors haversineMeters in lib/server/location.ts. */
function haversineMeters(a: Fix, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/**
 * Flatten a query chunk into a spoken-language-ready place.
 *
 * Walking time is computed here rather than asked of the model: the metadata
 * carries coordinates, and an LLM estimating distances from lat/lng is a
 * reliable source of confidently wrong answers.
 */
function toNearbyPlace(
  chunk: QueryResponse['chunks'][number],
  fix: Fix,
): NearbyPlace | null {
  const metadata = chunk.metadata ?? {};
  const name = metadata.name;
  if (typeof name !== 'string' || !name.trim()) return null;

  const lat = asNullableNumber(metadata.lat);
  const lng = asNullableNumber(metadata.lng);
  const walkingMinutes =
    lat !== null && lng !== null
      ? Math.max(1, Math.round(haversineMeters(fix, { lat, lng }) / METRES_PER_WALKING_MINUTE))
      : null;

  return {
    name,
    kind: typeof metadata.kind === 'string' ? metadata.kind : null,
    description: chunk.text,
    walkingMinutes,
    indoor: asNullableBoolean(metadata.indoor),
    busynessPct: asNullableNumber(metadata.busyness_pct),
  };
}

/**
 * Ask Moss for nearby places.
 *
 * Fails soft in the same spirit as query.ts: a dead or slow API yields an empty
 * list plus a warning the guide can voice, never a thrown error that would drop
 * the conversation.
 */
export async function lookupPlaces(options: LookupOptions): Promise<LookupResult> {
  const {
    fix,
    utterance,
    radiusMin,
    indoor,
    maxBusyness,
    profile,
    signal,
    baseUrl = apiBaseUrl(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

  const constraints: Record<string, unknown> = {};
  const resolvedRadius = resolveRadiusMin(radiusMin, profile);
  if (resolvedRadius !== null) constraints.radius_min = resolvedRadius;
  if (typeof indoor === 'boolean') constraints.indoor = indoor;
  if (typeof maxBusyness === 'number' && Number.isFinite(maxBusyness)) {
    constraints.max_busyness = maxBusyness;
  }

  const body = JSON.stringify({
    lat: fix.lat,
    lng: fix.lng,
    utterance: utterance.slice(0, MAX_UTTERANCE_CHARS),
    constraints: Object.keys(constraints).length ? constraints : null,
  });

  // The caller's abort signal (fired when the traveler interrupts) and our own
  // timeout both need to cancel the request, so they are combined into one.
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: combined,
    });
  } catch (err) {
    // An interruption is the traveler talking over us, not a failure. Rethrow so
    // the framework discards the tool call instead of the guide announcing that
    // a lookup failed when nothing did.
    if (signal?.aborted) throw err;
    return { places: [], warnings: ['The place lookup did not respond in time.'] };
  }

  if (!response.ok) {
    return { places: [], warnings: [`The place lookup failed (status ${response.status}).`] };
  }

  let payload: QueryResponse;
  try {
    payload = (await response.json()) as QueryResponse;
  } catch {
    return { places: [], warnings: ['The place lookup returned something unreadable.'] };
  }

  const chunks = Array.isArray(payload.chunks) ? payload.chunks : [];
  const places = chunks
    .map((chunk) => toNearbyPlace(chunk, fix))
    .filter((place): place is NearbyPlace => place !== null);

  return {
    places,
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
  };
}
