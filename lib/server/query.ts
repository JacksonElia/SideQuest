/**
 * Retrieve the most relevant nearby SideQuest places.
 *
 * Ported from the original agent/query.py.
 */

import { createStore, MossStore } from './store.ts';
import type { SearchResult, Store } from './store.ts';
import { applyContext as applyContextRules } from './context.ts';

export const INDEX_NAME = 'sidequest-places';
const CANDIDATE_COUNT = 100;

/** Metres of walking distance assumed per minute of the caller's radius budget. */
const METRES_PER_RADIUS_MINUTE = 80;
const DEFAULT_RADIUS_MIN = 15;
const MAX_DISTINCT_PLACES = 5;

export interface Constraints {
  radius_min?: number;
  indoor?: boolean;
  lang?: string;
  max_busyness?: number;
  [key: string]: unknown;
}

export interface QueryResult {
  chunks: SearchResult[];
  latency_ms: number;
  warnings: string[];
  user_facts: unknown[];
}

/**
 * The query path is intentionally backed by one long-lived store. In particular,
 * MossStore loads the places index once rather than on every query.
 *
 * The Python version built this at import time. Here it is lazy: Next.js
 * evaluates modules during `next build`, where MOSS_PROJECT_ID is typically
 * absent, and an eager MossStore() would fail the build rather than the request.
 * Module scope still persists across warm invocations, so the index load is
 * amortized exactly as before.
 */
let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  storePromise ??= (async () => {
    const store = createStore();
    if (store instanceof MossStore) {
      await store.loadIndex(INDEX_NAME);
    }
    return store;
  })();
  return storePromise;
}

/** Replace the cached store. Tests use this to inject a FakeStore. */
export function setStore(store: Store | null): void {
  storePromise = store ? Promise.resolve(store) : null;
}

/** Return up to five distinct nearby places ranked by semantic relevance. */
export async function query(
  userLat: number,
  userLng: number,
  utterance: string,
  constraints: Constraints | null = null,
  placeId: string | null = null,
): Promise<QueryResult> {
  const [conditioned, contextWarnings] = applyContext(constraints ?? {});
  const filters = nativeFilters(conditioned, placeId);
  const radiusM = Number(conditioned.radius_min ?? DEFAULT_RADIUS_MIN) * METRES_PER_RADIUS_MINUTE;

  let warnings = contextWarnings;
  const startedAt = performance.now();

  let candidates: SearchResult[];
  try {
    const store = await getStore();
    candidates = await store.search(INDEX_NAME, utterance, {
      lat: userLat,
      lng: userLng,
      radiusM,
      filters: Object.keys(filters).length ? filters : null,
      topK: CANDIDATE_COUNT,
    });
  } catch {
    // Fail soft (AGENTS.md): a Moss outage degrades the answer, it does not
    // break the voice path. The caller still gets a well-formed result.
    candidates = [];
    warnings = [...warnings, 'Nearby places are temporarily unavailable.'];
  }

  const latencyMs = performance.now() - startedAt;

  return {
    chunks: distinctPlaces(candidates, conditioned),
    latency_ms: latencyMs,
    warnings,
    user_facts: [],
  };
}

export type ContextHook = (constraints: Constraints) => [Constraints, string[]];

let contextHook: ContextHook | null = null;

/**
 * Override context conditioning. Tests use this in place of the monkeypatching
 * the Python suite did against the module-private `_apply_context`.
 */
export function setContextHook(hook: ContextHook | null): void {
  contextHook = hook;
}

/**
 * Apply context conditioning to the caller's constraints.
 *
 * Fails soft: a throw from the context rules degrades to the unconditioned
 * constraints rather than taking down the query path (AGENTS.md).
 */
function applyContext(constraints: Constraints): [Constraints, string[]] {
  const hook = contextHook ?? applyContextRules;
  try {
    return hook({ ...constraints });
  } catch {
    return [{ ...constraints }, []];
  }
}

/** Use only exact filters at the Store boundary; numeric values are encoded. */
function nativeFilters(
  constraints: Constraints,
  placeId: string | null,
): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  for (const key of ['indoor', 'lang'] as const) {
    if (key in constraints && constraints[key] !== undefined) {
      filters[key] = constraints[key];
    }
  }
  if (placeId !== null) filters.place_id = placeId;
  return filters;
}

/** Apply encoded numeric constraints and retain the best chunk for each place. */
function distinctPlaces(candidates: SearchResult[], constraints: Constraints): SearchResult[] {
  const maxBusyness = constraints.max_busyness;
  const chunks: SearchResult[] = [];
  const seenPlaceIds = new Set<string>();

  for (const candidate of candidates) {
    const metadata = candidate.metadata ?? {};

    if (maxBusyness !== undefined && asNumber(metadata.busyness_pct) > Number(maxBusyness)) {
      continue;
    }

    const placeId = metadata.place_id;
    if (typeof placeId !== 'string' || !placeId || seenPlaceIds.has(placeId)) continue;

    seenPlaceIds.add(placeId);
    chunks.push(candidate);
    if (chunks.length === MAX_DISTINCT_PLACES) break;
  }

  return chunks;
}

/**
 * Coerce a metadata value to a number, treating anything unparseable as
 * Infinity so a malformed record fails the busyness ceiling rather than
 * slipping past it.
 */
function asNumber(value: unknown): number {
  // Number() is deliberately not used bare: it maps null, "", and [] to 0,
  // which would let a record with a missing busyness_pct slip under the
  // ceiling. Python's float() raised on all three, excluding them instead.
  if (value === null || value === undefined) return Number.POSITIVE_INFINITY;
  if (typeof value !== 'number' && typeof value !== 'string') {
    return Number.POSITIVE_INFINITY;
  }
  if (typeof value === 'string' && value.trim() === '') return Number.POSITIVE_INFINITY;

  const parsed = Number(value);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}
