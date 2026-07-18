/**
 * OpenAI Realtime session minting.
 *
 * Server-side only: holds the OPENAI_API_KEY and exchanges it for a short-lived
 * `ek_...` client secret the browser uses to authenticate the WebRTC SDP
 * exchange. The key never crosses the network to the browser.
 *
 * One ephemeral secret per voice session: the browser calls /api/session right
 * before opening the WebRTC connection, so a new secret is bound to a new
 * conversation. Secrets expire automatically; we don't track that here.
 */

import type { OpenAIConfig } from './config.ts';

/** The subset of the Realtime session response the browser actually needs. */
export interface EphemeralSession {
  /** Bearer token the browser uses for the SDP exchange (`ek_...`). */
  clientSecret: string;
  /** Unix seconds at which the secret stops working. */
  expiresAt: number | null;
  /** Model id the browser passes to the Realtime WebRTC URL. */
  model: string;
  /** Voice the server picked; the browser mirrors it into session.update. */
  voice: string;
}

interface OpenAISessionResponse {
  id?: string;
  object?: string;
  model?: string;
  modalities?: string[];
  instructions?: string;
  voice?: string;
  client_secret?: {
    value?: string;
    expires_at?: number;
  };
}

const OPENAI_REALTIME_SESSIONS_URL = 'https://api.openai.com/v1/realtime/sessions';

/**
 * POST /v1/realtime/sessions and shape the response for the browser.
 *
 * Throws on non-2xx so the route handler can return a 502 with the upstream's
 * status — no body, no credentials, just the status code and a generic message.
 */
export async function mintEphemeralSession(
  cfg: OpenAIConfig,
  options: { instructions: string },
  deps: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<EphemeralSession> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 10_000;

  const response = await fetchImpl(OPENAI_REALTIME_SESSIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      voice: cfg.voice,
      instructions: options.instructions,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    // Deliberately no upstream body in the error — error messages from OpenAI
    // can echo our request content. Status code is enough for the caller to
    // log and the operator to diagnose.
    throw new Error(`OpenAI realtime session mint failed (status ${response.status})`);
  }

  const payload = (await response.json()) as OpenAISessionResponse;
  const secret = payload.client_secret?.value;
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('OpenAI realtime session response missing client_secret.value');
  }
  if (typeof payload.model !== 'string' || payload.model.length === 0) {
    throw new Error('OpenAI realtime session response missing model');
  }

  return {
    clientSecret: secret,
    expiresAt: typeof payload.client_secret?.expires_at === 'number' ? payload.client_secret.expires_at : null,
    model: payload.model,
    voice: typeof payload.voice === 'string' && payload.voice.length > 0 ? payload.voice : cfg.voice,
  };
}