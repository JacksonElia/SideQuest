/**
 * Liveness probe. Reports whether the LiveKit config is loadable without
 * exposing any of it — a missing secret shows up as ok:false here rather than
 * as a failed session mint at demo time.
 */

import { NextResponse } from 'next/server';

import { loadConfig } from '@/lib/server/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cfg = loadConfig();
    return NextResponse.json({ ok: true, agentName: cfg.agentName });
  } catch (err) {
    // The message names only which variables are absent, never their values.
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 503 });
  }
}
