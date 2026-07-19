/**
 * POST /api/context — proactive retrieval-side companion to /api/tool.
 *
 * The browser fires this on every user turn with the latest transcript plus
 * the traveler's coordinates. The server runs the same `query()` path the
 * `findNearbyPlaces` tool uses, summarizes the result into one short prose
 * line via `summarizeForContext`, and returns that.
 *
 * Why a separate route and not /api/tool? Two reasons:
 *
 *   1. The browser is the caller here, not the model. /api/tool is the
 *      server-side executor for a model-issued `response.function_call_args.done`
 *      event, which means the model already decided to look something up. The
 *      proactive path runs *before* the model asks.
 *
 *   2. The browser asks in the user's words; the model calls the tool with
 *      constraints it inferred from the system prompt. Same retrieval,
 *      different callers.
 *
 * Failures are soft: this never throws to the client. A Moss outage or a slow
 * embedding call returns `{ summary: "" }`, which the browser uses to skip
 * the conversation item entirely.
 */

import { NextResponse } from "next/server";

import { summarizeForContext } from "@/lib/server/context-summary";
import { validateFix } from "@/lib/server/location";
import { query } from "@/lib/server/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/** Hard cap so the browser sends one short transcript, not a wall of text. */
const MAX_UTTERANCE_CHARS = 500;

interface ContextBody {
  lat?: number;
  lng?: number;
  utterance?: string;
}

interface ContextResponse {
  /** Voice-friendly prose line for the Realtime session. Empty when there is nothing to say. */
  summary: string;
  /** Wallclock latency for the retrieval itself; pure diagnostics. */
  latencyMs?: number;
}

export async function POST(
  request: Request,
): Promise<NextResponse<ContextResponse | { error: string }>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return NextResponse.json({ error: "body must be a JSON object" }, { status: 400 });
  }
  const body = parsed as ContextBody;

  const fix = validateFix({ lat: body.lat, lng: body.lng });
  if (!fix.ok) {
    return NextResponse.json({ error: fix.error }, { status: 400 });
  }

  const utterance = body.utterance;
  if (typeof utterance !== "string" || !utterance.trim()) {
    return NextResponse.json({ error: "utterance must be a non-empty string" }, { status: 400 });
  }
  if (utterance.length > MAX_UTTERANCE_CHARS) {
    return NextResponse.json(
      { error: `utterance must be at most ${MAX_UTTERANCE_CHARS} characters` },
      { status: 400 },
    );
  }

  // Same `query()` path the `findNearbyPlaces` tool uses. No constraints here:
  // the user's words drive the embedding, and the radius defaults to a short
  // walk so the prose stays about things within easy reach.
  let result;
  try {
    result = await query(fix.value.lat, fix.value.lng, utterance.slice(0, MAX_UTTERANCE_CHARS));
  } catch {
    // Fail soft per AGENTS.md.
    return NextResponse.json({ summary: "" });
  }

  const summary = summarizeForContext(result);
  return NextResponse.json({ summary, latencyMs: Math.round(result.latency_ms) });
}
