/**
 * Nearby-places retrieval.
 *
 * Replaces `python -m agent.query "<utterance>"`, which was CLI-only — this is
 * the first time the retrieval layer is reachable over HTTP.
 *
 * The response body carries scraped text (Wikipedia extracts, captions), which
 * is UNTRUSTED INPUT per AGENTS.md #2. It is returned as data under `chunks`
 * and must be wrapped as data by whatever hands it to an LLM; nothing here
 * concatenates it into a prompt.
 */

import { NextResponse } from 'next/server';

import { query } from '@/lib/server/query';
import { validateFix } from '@/lib/server/location';

// The Moss SDK is a native Node addon — it cannot run on the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A cold instance downloads the ONNX embedding model and the index before the
 * first query can resolve, which comfortably exceeds the default budget. Warm
 * invocations reuse both via the module-scoped store.
 */
export const maxDuration = 60;

const MAX_UTTERANCE_CHARS = 500;

interface QueryBody {
  lat?: number;
  lng?: number;
  utterance?: string;
  constraints?: Record<string, unknown> | null;
  place_id?: string | null;
}

export async function POST(request: Request) {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json({ error: 'body must be valid JSON' }, { status: 400 });
  }

  // A literal `null` body parses cleanly, so the try/catch above lets it
  // through and the field reads below would throw an unhandled 500.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return NextResponse.json({ error: 'body must be a JSON object' }, { status: 400 });
  }
  const body = parsed as QueryBody;

  const fix = validateFix({ lat: body.lat, lng: body.lng });
  if (!fix.ok) {
    return NextResponse.json({ error: fix.error }, { status: 400 });
  }

  const utterance = body.utterance;
  if (typeof utterance !== 'string' || !utterance.trim()) {
    return NextResponse.json({ error: 'utterance must be a non-empty string' }, { status: 400 });
  }
  if (utterance.length > MAX_UTTERANCE_CHARS) {
    return NextResponse.json(
      { error: `utterance must be at most ${MAX_UTTERANCE_CHARS} characters` },
      { status: 400 },
    );
  }

  // query() already fails soft on a Moss outage, returning a warning rather
  // than throwing, so there is no try/catch to add around it here.
  const result = await query(
    fix.value.lat,
    fix.value.lng,
    utterance,
    body.constraints ?? null,
    body.place_id ?? null,
  );

  return NextResponse.json(result);
}
