/**
 * Mint a LiveKit token and dispatch the agent.
 *
 * Lifted from the standalone server's POST /session handler. The LiveKit logic
 * itself is untouched — only the HTTP plumbing changed:
 *
 *   - Body parsing and the 4KB cap are enforced here rather than by a manual
 *     stream reader. A GPS fix is ~100 bytes; anything larger is abuse.
 *   - CORS is gone. The browser now calls a same-origin route, so the
 *     localhost-only allowance the old server needed no longer applies.
 */

import { NextResponse } from 'next/server';

import { loadConfig } from '@/lib/server/config';
import { createSession, HttpError } from '@/lib/server/livekit';

// livekit-server-sdk and the token signing need Node builtins, not edge.
export const runtime = 'nodejs';
// Every session mints a fresh token; caching one would hand two users the same room.
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 4 * 1024;

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);

    const cfg = loadConfig();
    const session = await createSession(cfg, {
      fix: { lat: body.lat, lng: body.lng, accuracy: body.accuracy },
      identity: body.identity,
    });

    console.log(
      `[session] room=${session.roomName} identity=${session.identity} ` +
        `agent=${cfg.agentName} dispatched=${session.agentDispatched}`,
    );

    return NextResponse.json(session);
  } catch (err) {
    const status = err instanceof HttpError ? err.statusCode : 500;
    if (status >= 500) console.error('[session]', err);

    // Only our own deliberate 4xx messages are echoed; 5xx stays opaque so an
    // SDK error can never leak a credential into an HTTP response body.
    const message = status >= 500 ? 'internal error' : (err as Error).message;
    return NextResponse.json({ error: message }, { status });
  }
}

interface SessionBody {
  lat?: number;
  lng?: number;
  accuracy?: number | null;
  identity?: string;
}

async function readJsonBody(request: Request): Promise<SessionBody> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) {
    throw new HttpError('request body too large', 413);
  }

  const raw = await request.text();
  // Re-checked after reading: content-length is client-supplied and may lie.
  if (raw.length > MAX_BODY_BYTES) {
    throw new HttpError('request body too large', 413);
  }
  if (!raw) return {};

  try {
    return JSON.parse(raw) as SessionBody;
  } catch {
    throw new HttpError('body must be valid JSON', 400);
  }
}
