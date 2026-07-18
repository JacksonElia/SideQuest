/**
 * Environment loading and validation. Fails fast with a readable message rather
 * than surfacing a cryptic SDK error on the first request.
 *
 * Secrets are read here and never logged. `describeConfig()` exists so startup
 * logging has a safe thing to print.
 */

export interface OpenAIConfig {
  apiKey: string;
  /** Realtime model id (e.g. `gpt-realtime` or `gpt-4o-realtime-preview`). */
  model: string;
  /** Voice id the Realtime session speaks with. */
  voice: string;
}

const DEFAULT_MODEL = 'gpt-realtime';
const DEFAULT_VOICE = 'alloy';

export function loadOpenAIConfig(): OpenAIConfig {
  const cfg: OpenAIConfig = {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_REALTIME_MODEL || DEFAULT_MODEL,
    voice: process.env.OPENAI_REALTIME_VOICE || DEFAULT_VOICE,
  };

  const missing: string[] = [];
  if (!cfg.apiKey) missing.push('OPENAI_API_KEY');

  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}.\n` +
        `Copy .env.example to .env.local and fill it in. ` +
        `OPENAI_API_KEY is shown only once when the key is created in the OpenAI dashboard.`,
    );
  }

  return cfg;
}

/** Safe-to-log view of the config. Never includes the secret. */
export function describeConfig(cfg: OpenAIConfig) {
  return {
    model: cfg.model,
    voice: cfg.voice,
    apiKey: `${cfg.apiKey.slice(0, 7)}…`,
  };
}