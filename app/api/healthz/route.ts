/**
 * Liveness probe. Reports whether the OpenAI config loads without exposing it —
 * a missing key shows up as ok:false here rather than as a failed session mint
 * at demo time.
 */

import { NextResponse } from 'next/server';

import { loadOpenAIConfig } from '@/lib/server/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cfg = loadOpenAIConfig();
    return NextResponse.json({ ok: true, model: cfg.model, voice: cfg.voice });
  } catch (err) {
    // The message names only which variables are absent, never their values.
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
}