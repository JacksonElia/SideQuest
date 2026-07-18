/**
 * Environment loading and validation for the OpenRouter layer.
 *
 * Deliberately NOT folded into src/config.js: that one is loaded at server
 * startup and throwing there would take down token minting. LLM work is
 * out-of-band (summarizing scraped data, prepping context for agents), so its
 * config is loaded lazily by the first caller instead. A missing OpenRouter key
 * must never stop the voice path from booting.
 *
 * Secrets are read here and never logged. `describeLlmConfig()` exists so
 * startup/smoke logging has a safe thing to print.
 */

/** Single default model for everything. Roles get specialized later. */
export const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';

/** OpenRouter rankings attribution. Public, not a secret. */
const DEFAULT_APP_TITLE = 'Sidequest';

/**
 * Bulk summarization runs long; the SDK default is not tuned for it. 60s is
 * generous for a single completion and still bounded, so a hung provider
 * surfaces as a failed item rather than a hung batch.
 */
export const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Simultaneous in-flight requests in a batch. Kept modest: OpenRouter rate
 * limits are per-key, and the retry backoff below is a poor substitute for
 * simply not stampeding.
 */
export const DEFAULT_CONCURRENCY = 4;

const isPositiveInt = (v) => Number.isInteger(v) && v > 0;

/**
 * Read and validate the LLM environment.
 *
 * @returns {{apiKey:string, model:string, appTitle:string, httpReferer:string|undefined,
 *            timeoutMs:number, concurrency:number}}
 * @throws if OPENROUTER_API_KEY is absent or a numeric override is malformed.
 */
export function loadLlmConfig(env = process.env) {
  const apiKey = env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      'Missing required environment variable: OPENROUTER_API_KEY.\n' +
        'Copy .env.example to .env.local and fill it in. Create a key at ' +
        'https://openrouter.ai/keys — the value is shown only once.',
    );
  }

  const cfg = {
    apiKey,
    // One model for everything today. Override per-environment rather than per
    // call site, so swapping models at demo time is a single edit.
    model: env.OPENROUTER_MODEL || DEFAULT_MODEL,
    appTitle: env.OPENROUTER_APP_TITLE || DEFAULT_APP_TITLE,
    // Optional: OpenRouter uses it for public app rankings. Undefined is fine.
    httpReferer: env.OPENROUTER_HTTP_REFERER || undefined,
    timeoutMs: Number(env.OPENROUTER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    concurrency: Number(env.OPENROUTER_CONCURRENCY ?? DEFAULT_CONCURRENCY),
  };

  if (!isPositiveInt(cfg.timeoutMs)) {
    throw new Error(
      `OPENROUTER_TIMEOUT_MS must be a positive integer (got "${env.OPENROUTER_TIMEOUT_MS}").`,
    );
  }

  if (!isPositiveInt(cfg.concurrency)) {
    throw new Error(
      `OPENROUTER_CONCURRENCY must be a positive integer (got "${env.OPENROUTER_CONCURRENCY}").`,
    );
  }

  return cfg;
}

/** Safe-to-log view of the config. Never includes the key. */
export function describeLlmConfig(cfg) {
  return {
    // Key prefix only — enough to tell two keys apart, useless if leaked.
    apiKey: `${cfg.apiKey.slice(0, 8)}…`,
    model: cfg.model,
    appTitle: cfg.appTitle,
    timeoutMs: cfg.timeoutMs,
    concurrency: cfg.concurrency,
  };
}
