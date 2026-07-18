/**
 * Headless smoke test: mint a token, dispatch the agent, confirm the dispatch
 * is registered. Proves credentials and the agent name are correct WITHOUT a
 * browser — run this first when something breaks, to tell a backend problem
 * apart from a frontend one.
 *
 * Does not verify audio or attribute delivery; those need the browser client.
 *
 *   npm run smoke
 */

import { AgentDispatchClient } from 'livekit-server-sdk';

import { loadConfig, describeConfig } from '../src/config.js';
import { createSession } from '../src/livekit.js';

// Arbitrary coordinates — deliberately NOT a fixed demo location. The query
// path must work anywhere (AGENTS.md #5). Override on the command line:
//   node --env-file=../.env.local scripts/smoke.js 48.8584 2.2945
const lat = Number(process.argv[2] ?? 40.7484);
const lng = Number(process.argv[3] ?? -73.9857);

const cfg = loadConfig();
console.log('[smoke] config', describeConfig(cfg));

const session = await createSession(cfg, { fix: { lat, lng, accuracy: 10 } });

console.log(`[smoke] room            ${session.roomName}`);
console.log(`[smoke] identity        ${session.identity}`);
console.log(`[smoke] token           ${session.token.length} chars (not printed)`);
console.log(`[smoke] agentDispatched ${session.agentDispatched}`);

if (!session.agentDispatched) {
  console.error(`[smoke] FAIL dispatch error: ${session.dispatchError}`);
  console.error(
    `[smoke] Check LIVEKIT_AGENT_NAME matches the agent name in the dashboard exactly.`,
  );
  process.exit(1);
}

const client = new AgentDispatchClient(cfg.livekitUrl, cfg.apiKey, cfg.apiSecret);
const dispatches = await client.listDispatch(session.roomName);

console.log(`[smoke] dispatches in room: ${dispatches.length}`);
for (const d of dispatches) {
  console.log(`[smoke]   agent=${d.agentName} id=${d.id}`);
}

if (dispatches.length === 0) {
  console.error('[smoke] FAIL dispatch created but not listed in the room');
  process.exit(1);
}

console.log('[smoke] PASS token minted and agent dispatched');
console.log('[smoke] NOTE this does not prove the agent actually joined or spoke.');
console.log('[smoke] For that, run `npm run dev` and open the browser client.');
