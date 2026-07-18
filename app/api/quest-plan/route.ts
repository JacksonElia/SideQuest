import { NextResponse } from "next/server";

import { validateFix } from "@/lib/server/location";
import { generateQuestQueryPlan } from "@/lib/server/quest-planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_LOCATION_LABEL_CHARS = 160;

interface QuestPlanBody {
  locationLabel?: unknown;
  lat?: unknown;
  lng?: unknown;
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

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "Quest planning is not configured yet." }, { status: 503 });
  }

  const result = await generateQuestQueryPlan({
    locationLabel: body.locationLabel.trim(),
    latitude: fix.value.lat,
    longitude: fix.value.lng,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 502 });
  }

  return NextResponse.json({ queries: result.value.queries });
}
