import { NextResponse } from "next/server";

import { validateFix } from "@/lib/server/location";
import { query } from "@/lib/server/query";
import { generateQuestQueryPlan, radiusMinutesForProfile } from "@/lib/server/quest-planner";
import type { TravelProfile } from "@/types/message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_LOCATION_LABEL_CHARS = 160;
const MAX_INTEREST_CHARS = 500;

interface QuestPlanBody {
  locationLabel?: unknown;
  lat?: unknown;
  lng?: unknown;
  profile?: unknown;
}

interface QuestPlace {
  name: string;
  detail: string | null;
}

export async function POST(request: Request) {
  let body: QuestPlanBody;
  try {
    body = (await request.json()) as QuestPlanBody;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
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

  const profile = parseTravelProfile(body.profile);
  if (!profile) {
    return NextResponse.json(
      { error: "profile must include valid travel preferences" },
      { status: 400 },
    );
  }

  const plan = await generateQuestQueryPlan(
    {
      locationLabel: body.locationLabel.trim(),
      latitude: fix.value.lat,
      longitude: fix.value.lng,
    },
    profile,
  );
  if (!plan.ok) {
    return NextResponse.json({ error: plan.error }, { status: plan.status ?? 502 });
  }

  const results = await Promise.all(
    plan.value.queries.map((queryText) =>
      query(fix.value.lat, fix.value.lng, queryText, {
        radius_min: radiusMinutesForProfile(profile),
      }),
    ),
  );
  const places = toDistinctPlaces(results.flatMap((result) => result.chunks));
  const warnings = results.flatMap((result) => result.warnings);

  console.log(
    `[quest-plan] Generated ${plan.value.queries.length} OpenRouter queries and found ${places.length} Moss places.`,
  );
  return NextResponse.json({ queries: plan.value.queries, places, warnings });
}

function parseTravelProfile(value: unknown): TravelProfile | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const profile = value as Partial<TravelProfile>;
  const { durationDays, interests, activityLevel, budget } = profile;
  if (
    (durationDays !== null &&
      (typeof durationDays !== "number" || !Number.isFinite(durationDays))) ||
    !Array.isArray(interests) ||
    interests.some(
      (interest) =>
        typeof interest !== "string" || !interest.trim() || interest.length > MAX_INTEREST_CHARS,
    ) ||
    ![null, "spry", "moderate", "restful"].includes(activityLevel ?? null) ||
    ![null, "free-spending", "moderate", "frugal"].includes(budget ?? null)
  ) {
    return null;
  }

  return {
    durationDays: durationDays ?? null,
    interests: interests.map((interest) => interest.trim()),
    activityLevel: activityLevel ?? null,
    budget: budget ?? null,
  };
}

function toDistinctPlaces(
  chunks: Array<{ text: string; metadata: Record<string, unknown> }>,
): QuestPlace[] {
  const seen = new Set<string>();
  const places: QuestPlace[] = [];

  for (const chunk of chunks) {
    const name = chunk.metadata.name;
    if (typeof name !== "string" || !name.trim() || seen.has(name)) continue;

    seen.add(name);
    places.push({ name, detail: chunk.text || null });
  }

  return places;
}
