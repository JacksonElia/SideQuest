/**
 * OpenAI Realtime session minting.
 *
 * Server-side only: holds the OPENAI_API_KEY and exchanges it for a short-lived
 * `ek_...` client secret the browser uses to authenticate the WebRTC SDP
 * exchange to `/v1/realtime/calls`. The key never crosses the network to the
 * browser.
 *
 * One ephemeral secret per voice session: the browser calls /api/session right
 * before opening the WebRTC connection, so a new secret is bound to a new
 * conversation. Secrets expire automatically; we don't track that here.
 *
 * Aligned with the GA Realtime API surface (no `OpenAI-Beta` header). Verified
 * against the canonical docs at https://platform.openai.com/docs/guides/realtime
 * and https://platform.openai.com/docs/guides/realtime-webrtc.
 */

import type { OpenAIConfig } from "./config.ts";

/** The subset of the Realtime client_secret response the browser actually needs. */
export interface EphemeralSession {
  /** Bearer token the browser uses for the SDP exchange (`ek_...`). */
  clientSecret: string;
  /** Unix seconds at which the secret stops working. */
  expiresAt: number | null;
  /** Model id echoed back; the browser mirrors it into any session.update. */
  model: string;
  /** Voice the server picked; the browser mirrors it into session.update. */
  voice: string;
}

interface OpenAIClientSecretResponse {
  value?: string;
  expires_at?: number;
  session?: {
    model?: string;
    audio?: { output?: { voice?: string } };
  };
}

const OPENAI_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";

/**
 * POST /v1/realtime/client_secrets and shape the response for the browser.
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

  const response = await fetchImpl(OPENAI_CLIENT_SECRETS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
      // Stable per-session identifier so abuse is traceable per traveler, not
      // per org. For a hackathon a literal is fine; production would hash the
      // user's stable id. The browser never sees this header — it is bound
      // to the ephemeral token at mint time.
      "OpenAI-Safety-Identifier": "sidequest-traveler",
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: cfg.model,
        instructions: options.instructions,
        audio: { output: { voice: cfg.voice } },
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    // Deliberately no upstream body in the error — error messages from OpenAI
    // can echo our request content. Status code is enough for the caller to
    // log and the operator to diagnose.
    throw new Error(`OpenAI client_secret mint failed (status ${response.status})`);
  }

  const payload = (await response.json()) as OpenAIClientSecretResponse;
  if (typeof payload.value !== "string" || payload.value.length === 0) {
    throw new Error("OpenAI client_secret response missing value");
  }

  return {
    clientSecret: payload.value,
    expiresAt: typeof payload.expires_at === "number" ? payload.expires_at : null,
    model: payload.session?.model ?? cfg.model,
    voice: payload.session?.audio?.output?.voice ?? cfg.voice,
  };
}
