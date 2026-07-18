/**
 * Mint an ephemeral OpenAI Realtime session.
 *
 * Replaces the LiveKit token + dispatch flow. The browser gets back the things
 * it needs to open a WebRTC connection straight to api.openai.com — the
 * server key never crosses the network.
 */

import { NextResponse } from 'next/server';

import { loadOpenAIConfig } from '@/lib/server/config';
import { validateFix, type TimedFix } from '@/lib/server/location';
import { mintEphemeralSession } from '@/lib/server/openai';
import { INSTRUCTIONS } from '@/lib/server/prompt';
import { REALTIME_TOOLS, buildSessionUpdate } from '@/lib/server/realtime-tools';

// OpenAI's mint endpoint is a Node-flavoured HTTPS call.
export const runtime = 'nodejs';
// Every session mints a fresh secret; caching would hand two users the same token.
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 4 * 1024;

interface SessionResponse {
  clientSecret: string;
  expiresAt: number | null;
  model: string;
  voice: string;
  /** session.update payload the browser sends as soon as the data channel opens. */
  sessionUpdate: Record<string, unknown>;
  /** Initial location, so the browser can seed the model without an extra turn. */
  initialLocation: TimedFix;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJsonBody(request);

    const validated = validateFix({
      lat: body.lat,
      lng: body.lng,
      accuracy: body.accuracy,
    });
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const cfg = loadOpenAIConfig();
    const fix: TimedFix = { ...validated.value, ts: Date.now() };

    const session = await mintEphemeralSession(cfg, { instructions: INSTRUCTIONS });

    const payload: SessionResponse = {
      clientSecret: session.clientSecret,
      expiresAt: session.expiresAt,
      model: session.model,
      voice: session.voice,
      sessionUpdate: buildSessionUpdate(cfg, INSTRUCTIONS, REALTIME_TOOLS),
      initialLocation: fix,
    };

    console.log(
      `[session] model=${session.model} voice=${session.voice} ` +
        `lat=${fix.lat.toFixed(4)} lng=${fix.lng.toFixed(4)}`,
    );

    return NextResponse.json(payload);
  } catch (err) {
    console.error('[session]', err);
    // Never echo upstream error bodies — they can echo request content.
    return NextResponse.json({ error: 'internal error' }, { status: 502 });
  }
}

interface SessionBody {
  lat?: number;
  lng?: number;
  accuracy?: number | null;
}

async function readJsonBody(request: Request): Promise<SessionBody> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) {
    throw new Error('request body too large');
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    throw new Error('request body too large');
  }
  if (!raw) return {};

  try {
    return JSON.parse(raw) as SessionBody;
  } catch {
    throw new Error('body must be valid JSON');
  }
}