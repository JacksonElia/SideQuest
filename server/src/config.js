/**
 * Environment loading and validation. Fails fast at startup with a readable
 * message rather than surfacing a cryptic SDK error on the first request.
 *
 * Secrets are read here and never logged. `describeConfig()` exists so startup
 * logging has a safe thing to print.
 */

/**
 * Read an env var, accepting a legacy/misspelled alias with a loud warning.
 * The alias support is a hackathon concession — fix the .env, don't rely on it.
 */
function readWithAlias(canonical, aliases = []) {
  const direct = process.env[canonical];
  if (direct) return direct;

  for (const alias of aliases) {
    if (process.env[alias]) {
      console.warn(
        `[config] WARNING: using ${alias} as a fallback for ${canonical}. ` +
          `Rename it in .env.local — the alias is not supported by the LiveKit SDK itself.`,
      );
      return process.env[alias];
    }
  }
  return undefined;
}

export function loadConfig() {
  const cfg = {
    // The SDK reads LIVEKIT_URL itself when a client is constructed bare, so the
    // canonical name matters beyond our own code.
    livekitUrl: readWithAlias('LIVEKIT_URL', ['LIVEKIT_WEBSOCKET_URL']),
    apiKey: readWithAlias('LIVEKIT_API_KEY', ['LIVEKEY_API_KEY']),
    apiSecret: process.env.LIVEKIT_API_SECRET,
    agentName: process.env.LIVEKIT_AGENT_NAME,
    agentId: process.env.LIVEKIT_AGENT_ID ?? null, // reference only; dispatch uses the name
    port: Number(process.env.PORT ?? 3001),
  };

  const missing = [];
  if (!cfg.livekitUrl) missing.push('LIVEKIT_URL');
  if (!cfg.apiKey) missing.push('LIVEKIT_API_KEY');
  if (!cfg.apiSecret) missing.push('LIVEKIT_API_SECRET');
  if (!cfg.agentName) missing.push('LIVEKIT_AGENT_NAME');

  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}.\n` +
        `Copy .env.example to .env.local and fill them in. ` +
        `LIVEKIT_API_SECRET is shown only once when the key is created in the LiveKit Cloud dashboard.`,
    );
  }

  if (!/^wss?:\/\//.test(cfg.livekitUrl)) {
    throw new Error(
      `LIVEKIT_URL must be a WebSocket URL starting with wss:// (got "${cfg.livekitUrl.slice(0, 8)}...").`,
    );
  }

  if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535 (got "${process.env.PORT}").`);
  }

  return cfg;
}

/** Safe-to-log view of the config. Never includes the secret. */
export function describeConfig(cfg) {
  return {
    livekitUrl: cfg.livekitUrl,
    apiKey: `${cfg.apiKey.slice(0, 6)}…`, // key ID prefix only, enough to tell keys apart
    apiSecret: '<set>',
    agentName: cfg.agentName,
    port: cfg.port,
  };
}
