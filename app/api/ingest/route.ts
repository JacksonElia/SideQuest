/**
 * On-demand Bright Data ingestion for the traveler's current location.
 *
 * The browser posts a location label plus coordinates once a fix is known; the
 * route fetches nearby-interest SERP results through Bright Data and indexes
 * them into Moss so quest planning has fresh local material to draw from. The
 * fetch is awaited rather than fire-and-forgotten — serverless platforms are
 * free to kill any work still running after the response is sent.
 */

import { NextResponse } from "next/server";

import { fetchAndIndexNearby } from "@/lib/server/brightdata-fetch.js";
import { validateFix } from "@/lib/server/location";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_LOCATION_LABEL_CHARS = 160;

interface IngestBody {
  locationLabel?: unknown;
  lat?: unknown;
  lng?: unknown;
}

export async function POST(request: Request) {
  let body: IngestBody;
  try {
    body = (await request.json()) as IngestBody;
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

  const indexed = await fetchAndIndexNearby(
    body.locationLabel.trim(),
    fix.value.lat,
    fix.value.lng,
  );

  return NextResponse.json({ indexed });
}
