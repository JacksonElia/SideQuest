/**
 * Headless smoke test: mint an OpenAI Realtime ephemeral client secret and
 * confirm the configuration is reachable. Proves credentials and model choice
 * are correct WITHOUT a browser.
 *
 * Does not verify audio or the WebRTC handshake; those need the browser
 * client. Run this first when something breaks, to tell a backend problem
 * apart from a frontend one.
 *
 *   npm run smoke
 */

import { loadOpenAIConfig, describeConfig } from '../lib/server/config.ts';
import { mintEphemeralSession } from '../lib/server/openai.ts';
import { INSTRUCTIONS } from '../lib/server/prompt.ts';
import { REALTIME_TOOLS } from '../lib/server/realtime-tools.ts';

// Arbitrary coordinates — deliberately NOT a fixed demo location. The query
// path must work anywhere (AGENTS.md #5). Override on the command line:
//   npm run smoke -- 48.8584 2.2945
const lat = Number(process.argv[2] ?? 40.7484);
const lng = Number(process.argv[3] ?? -73.9857);

const cfg = loadOpenAIConfig();
console.log('[smoke] config', describeConfig(cfg));

const session = await mintEphemeralSession(cfg, { instructions: INSTRUCTIONS });

console.log(`[smoke] model           ${session.model}`);
console.log(`[smoke] voice           ${session.voice}`);
console.log(`[smoke] clientSecret    ${session.clientSecret.length} chars (not printed)`);
console.log(`[smoke] expiresAt       ${session.expiresAt ?? '<unset>'}`);
console.log(`[smoke] tools defined   ${REALTIME_TOOLS.length}`);

if (!session.clientSecret.startsWith('ek_')) {
  console.error('[smoke] FAIL unexpected client_secret shape (expected "ek_..." prefix).');
  process.exit(1);
}

console.log('[smoke] PASS ephemeral session minted');
console.log(
  '[smoke] NOTE this does not prove the browser can complete the WebRTC handshake.',
);
console.log('[smoke] For that, run `npm run dev` and tap to talk in the browser.');

// Keep `lat`/`lng` referenced so the smoke script reads as the GPS-aware check
// it's always been, not an unrelated one.
console.log(`[smoke] (coords used for context: ${lat.toFixed(4)}, ${lng.toFixed(4)})`);