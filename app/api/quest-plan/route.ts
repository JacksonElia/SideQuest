/**
 * Turn the voice guide's saved travel profile into a set of nearby places.
 *
 * Two steps, both server-side: the planner writes three Moss queries from what
 * the traveler told the guide, then those queries are actually run. The earlier
 * version of this route stopped after the first step and logged the queries to
 * the console, which meant the plan never reached the map.
 */

import { NextResponse } from "next/server";

import { validateFix } from "@/lib/server/location";
import { generateQuests } from "@/lib/server/quest-generator";
import { generateQuestQueryPlan, radiusMinutesForProfile } from "@/lib/server/quest-planner";
import { query } from "@/lib/server/query";
import type { SearchResult } from "@/lib/server/store";
import type { TravelProfile } from "@/types/message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_LOCATION_LABEL_CHARS = 160;
const MAX_INTERESTS = 12;
const MAX_INTEREST_CHARS = 80;
/** Matches MAX_DISTINCT_PLACES in lib/server/query.ts, applied across all three queries. */
const MAX_PLACES = 5;

const ACTIVITY_LEVELS = ["spry", "moderate", "restful"] as const;
const BUDGETS = ["free-spending", "moderate", "frugal"] as const;

interface QuestPlanBody {
  locationLabel?: unknown;
  lat?: unknown;
  lng?: unknown;
  profile?: unknown;
}

export async function POST(request: Request) {
  let body: QuestPlanBody;
  try {
    body = (await request.json()) as QuestPlanBody;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  // A literal null or an array parses as JSON but has no fields to read.
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "body must be a JSON object" }, { status: 400 });
  }

  if (typeof body.locationLabel !== "string" || !body.locationLabel.trim()) {
    return NextResponse.json(
      { error: "locationLabel must be a non-empty string" },
      { status: 400 },
    );
  }
  if (body.locationLabel.length > MAX_LOCATION_LABEL_CHARS) {
    return NextResponse.json(
      { error: `locationLabel must be at most ${MAX_LOCATION_LABEL_CHARS} characters` },
      { status: 400 },
    );
  }

  const fix = validateFix({ lat: body.lat, lng: body.lng });
  if (!fix.ok) {
    return NextResponse.json({ error: fix.error }, { status: 400 });
  }

  const profile = parseProfile(body.profile);
  if (!profile.ok) {
    return NextResponse.json({ error: profile.error }, { status: 400 });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "Quest planning is not configured yet." }, { status: 503 });
  }

  const plan = await generateQuestQueryPlan(
    {
      locationLabel: body.locationLabel.trim(),
      latitude: fix.value.lat,
      longitude: fix.value.lng,
    },
    profile.value,
  );

  if (!plan.ok) {
    return NextResponse.json({ error: plan.error }, { status: plan.status ?? 502 });
  }

  // The three queries are independent, so they run together rather than in
  // series — this is on the traveler's critical path between finishing the
  // conversation and seeing a map.
  const radiusMin = radiusMinutesForProfile(profile.value);
  const results = await Promise.all(
    plan.value.queries.map((utterance) =>
      query(fix.value.lat, fix.value.lng, utterance, { radius_min: radiusMin }),
    ),
  );

  const places = dedupePlaces(results.flatMap((result) => result.chunks));
  const warnings = [...new Set(results.flatMap((result) => result.warnings))];

  // Only places with a usable name can be arranged into quests: the model is
  // told to copy stop names verbatim, so a nameless chunk has nothing to copy.
  const questInputPlaces = places
    .map((p) => ({
      name: typeof p.metadata?.name === "string" ? p.metadata.name : "",
      text: p.text,
    }))
    .filter((p) => p.name);
  const quests = questInputPlaces.length
    ? await generateQuests({
        locationLabel: body.locationLabel.trim(),
        profile: profile.value,
        places: questInputPlaces,
      })
    : [];

  // generateQuests fail-softs to []; surface that as a warning rather than an
  // error so the traveler still gets their places.
  if (places.length > 0 && quests.length === 0) {
    warnings.push("Quest naming is unavailable right now.");
  }

  return NextResponse.json({ queries: plan.value.queries, places, quests, warnings });
}

/**
 * Keep the best-scoring chunk per place across all three queries.
 *
 * `query()` already dedupes within a single call, but the three queries overlap
 * by design — they are three angles on the same neighbourhood — so the same
 * place routinely comes back more than once.
 */
function dedupePlaces(chunks: SearchResult[]): SearchResult[] {
  const byPlace = new Map<string, SearchResult>();

  for (const chunk of chunks) {
    const placeId = chunk.metadata?.place_id;
    // A chunk with no place_id cannot be deduped against anything; keying it by
    // its own text keeps it rather than collapsing all such chunks together.
    const key = typeof placeId === "string" && placeId ? placeId : `text:${chunk.text}`;

    const existing = byPlace.get(key);
    if (!existing || chunk.score > existing.score) {
      byPlace.set(key, chunk);
    }
  }

  return [...byPlace.values()].sort((a, b) => b.score - a.score).slice(0, MAX_PLACES);
}

type ParseProfileResult =
  | { ok: true; value: TravelProfile }
  | { ok: false; error: string };

/**
 * Validate the profile the browser echoes back from the agent.
 *
 * Every field is nullable because the guide lets travelers skip any question —
 * absent is meaningfully different from wrong, so a missing field is accepted
 * as null while a wrongly-typed one is rejected.
 */
function parseProfile(value: unknown): ParseProfileResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "profile must be an object" };
  }

  const raw = value as Record<string, unknown>;

  const durationDays = raw.durationDays ?? null;
  if (durationDays !== null && (typeof durationDays !== "number" || !Number.isFinite(durationDays))) {
    return { ok: false, error: "profile.durationDays must be a finite number or null" };
  }

  const rawInterests = raw.interests ?? [];
  if (!Array.isArray(rawInterests)) {
    return { ok: false, error: "profile.interests must be an array" };
  }
  if (rawInterests.length > MAX_INTERESTS) {
    return { ok: false, error: `profile.interests must have at most ${MAX_INTERESTS} entries` };
  }
  const interests: string[] = [];
  for (const interest of rawInterests) {
    if (typeof interest !== "string") {
      return { ok: false, error: "profile.interests must contain only strings" };
    }
    const trimmed = interest.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_INTEREST_CHARS) {
      return {
        ok: false,
        error: `profile.interests entries must be at most ${MAX_INTEREST_CHARS} characters`,
      };
    }
    interests.push(trimmed);
  }

  const activityLevel = raw.activityLevel ?? null;
  if (activityLevel !== null && !isOneOf(activityLevel, ACTIVITY_LEVELS)) {
    return {
      ok: false,
      error: `profile.activityLevel must be one of ${ACTIVITY_LEVELS.join(", ")} or null`,
    };
  }

  const budget = raw.budget ?? null;
  if (budget !== null && !isOneOf(budget, BUDGETS)) {
    return { ok: false, error: `profile.budget must be one of ${BUDGETS.join(", ")} or null` };
  }

  return { ok: true, value: { durationDays, interests, activityLevel, budget } };
}

function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}
