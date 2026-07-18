/**
 * Server-side tool executor for the OpenAI Realtime voice session.
 *
 * The browser receives `response.function_call_arguments.done` events from the
 * model and posts them here. We whitelist the tool name, validate the
 * arguments shape, run the underlying retrieval, and return a JSON result the
 * browser will feed back to the model via `conversation.item.create`.
 *
 * Untrusted-by-construction: the browser is fully user-controlled, so a
 * malicious page could call this endpoint with arbitrary names. Whitelist +
 * per-tool argument validation are what keep that from being a vector into
 * Moss or anything else.
 */

import { NextResponse } from 'next/server';

import { query, type Constraints, type QueryResult } from '@/lib/server/query';
import { validateFix } from '@/lib/server/location';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const maxDuration = 60;

interface ToolCallBody {
  /** Whitelisted tool name; anything else returns 400. */
  name?: string;
  /** Original OpenAI Realtime call_id, echoed back so the browser can match it. */
  call_id?: string;
  /** Tool arguments as a JSON object (browser parses the model's JSON string). */
  arguments?: Record<string, unknown> | null;
  /** Traveler's current location, sent alongside the call. */
  lat?: number;
  lng?: number;
  accuracy?: number | null;
}

interface ToolCallResponse {
  call_id: string;
  /** JSON-serialisable result the browser hands back to the model. */
  output: Record<string, unknown>;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: ToolCallBody;
  try {
    const parsed = (await request.json()) as ToolCallBody;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'body must be a JSON object' }, { status: 400 });
    }
    body = parsed;
  } catch {
    return NextResponse.json({ error: 'body must be valid JSON' }, { status: 400 });
  }

  if (typeof body.call_id !== 'string' || !body.call_id) {
    return NextResponse.json({ error: 'call_id is required' }, { status: 400 });
  }

  switch (body.name) {
    case 'findNearbyPlaces':
      return runFindNearbyPlaces(body);
    default:
      // Whitelist: unknown tools are a 400, not a 404, because the browser should
      // never have offered them — the schema came from /api/session.
      return NextResponse.json(
        { error: `unknown tool: ${typeof body.name === 'string' ? body.name : '<missing>'}` },
        { status: 400 },
      );
  }
}

async function runFindNearbyPlaces(body: ToolCallBody): Promise<NextResponse> {
  const args = body.arguments ?? {};
  const utterance = args.utterance;
  if (typeof utterance !== 'string' || !utterance.trim()) {
    return NextResponse.json(
      { error: 'findNearbyPlaces requires a non-empty utterance' },
      { status: 400 },
    );
  }

  const fix = validateFix({ lat: body.lat, lng: body.lng, accuracy: body.accuracy });
  if (!fix.ok) {
    return NextResponse.json({ error: fix.error }, { status: 400 });
  }

  // Constraints mirror the zod schema in realtime-tools.ts. Each value is
  // coerced; unknown shapes return 400 rather than silently dropping.
  const constraints: Constraints = {};
  if (typeof args.radiusMin === 'number' && Number.isFinite(args.radiusMin) && args.radiusMin > 0) {
    constraints.radius_min = args.radiusMin;
  }
  if (typeof args.indoor === 'boolean') {
    constraints.indoor = args.indoor;
  }
  if (typeof args.maxBusyness === 'number' && Number.isFinite(args.maxBusyness)) {
    constraints.max_busyness = Math.max(0, Math.min(100, args.maxBusyness));
  }

  // Fire-and-await: the model is already paused waiting on this call_id. We
  // deliberately do not catch here — a real failure becomes the model seeing
  // an error output, which it can speak about.
  const result: QueryResult = await query(
    fix.value.lat,
    fix.value.lng,
    utterance.slice(0, 500),
    Object.keys(constraints).length ? constraints : null,
  );

  // Flatten chunks into the spoken-language-ready shape the guide expects.
  // Mirrors what agent/src/moss.ts used to do; we keep it inline rather than
  // importing the deleted module.
  const places = result.chunks.flatMap((chunk) => {
    const meta = chunk.metadata as Record<string, unknown>;
    const name = meta.name;
    if (typeof name !== 'string' || !name.trim()) return [];
    return [{
      name,
      kind: typeof meta.kind === 'string' ? meta.kind : null,
      description: typeof chunk.text === 'string' ? chunk.text : '',
      indoor: typeof meta.indoor === 'boolean' ? meta.indoor : null,
      busyness_pct: typeof meta.busyness_pct === 'number' ? meta.busyness_pct : null,
    }];
  });

  const payload: ToolCallResponse = {
    call_id: body.call_id!,
    output: places.length
      ? { places, warnings: result.warnings }
      : {
          places: [],
          note: result.warnings.length
            ? result.warnings.join(' ')
            : 'Nothing suitable was found nearby. Offer to widen the search or try something else.',
        },
  };

  return NextResponse.json(payload);
}