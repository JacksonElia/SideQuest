import { NextResponse } from "next/server";

import {
  fallbackGuideAnswer,
  generateGuideAnswer,
  type GuidePlace,
} from "@/lib/server/guide-answer";
import { validateFix } from "@/lib/server/location";
import { query } from "@/lib/server/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_QUESTION_CHARS = 500;

interface GuideAnswerBody {
  lat?: unknown;
  lng?: unknown;
  question?: unknown;
}

export async function POST(request: Request) {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return NextResponse.json({ error: "body must be a JSON object" }, { status: 400 });
  }
  const body = parsed as GuideAnswerBody;

  const fix = validateFix({ lat: body.lat, lng: body.lng });
  if (!fix.ok) {
    return NextResponse.json({ error: fix.error }, { status: 400 });
  }
  if (typeof body.question !== "string" || !body.question.trim()) {
    return NextResponse.json({ error: "question must be a non-empty string" }, { status: 400 });
  }
  if (body.question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json(
      { error: `question must be at most ${MAX_QUESTION_CHARS} characters` },
      { status: 400 },
    );
  }

  const question = body.question.trim();
  const result = await query(fix.value.lat, fix.value.lng, question);
  const places = toGuidePlaces(result.chunks);
  const generated = await generateGuideAnswer({
    question,
    places,
    location: { latitude: fix.value.lat, longitude: fix.value.lng },
  });
  const answer = generated.ok
    ? generated.answer
    : fallbackGuideAnswer(
        question,
        places.map((place) => place.name),
      );

  return NextResponse.json({
    answer,
    warnings: generated.ok
      ? result.warnings
      : [...result.warnings, "A generated guide response was unavailable."],
  });
}

function toGuidePlaces(
  chunks: Array<{ text: string; metadata: Record<string, unknown> }>,
): GuidePlace[] {
  const seenNames = new Set<string>();
  const places: GuidePlace[] = [];

  for (const chunk of chunks) {
    const name = chunk.metadata.name;
    if (typeof name !== "string" || !name.trim() || seenNames.has(name)) continue;

    seenNames.add(name);
    places.push({ name: name.trim(), text: chunk.text });
  }

  return places;
}
