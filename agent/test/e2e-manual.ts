/**
 * Manual end-to-end check: join a real room as the traveler and talk to the guide.
 *
 * Not part of `npm test` — it needs credentials, a running Next app, and a
 * running worker, and it costs inference. Run it when you want proof that the
 * whole chain is live rather than that the units are correct:
 *
 *   npm run dev          # terminal one
 *   npm run agent:dev    # terminal two
 *   node --env-file=../.env.local test/e2e-manual.ts   # from agent/
 *
 * It sends text rather than audio, which exercises the same agent turn as
 * speech does — the guide replies by voice and its transcript comes back over
 * the same stream a browser would read.
 */

import { Room, RoomEvent } from '@livekit/rtc-node';

const API = process.env.SIDEQUEST_API_URL || 'http://localhost:3000';
const TRANSCRIPTION_TOPIC = 'lk.transcription';
const CHAT_TOPIC = 'lk.chat';

/** What the traveler says, and how long to listen after each line. */
const SCRIPT: Array<{ say: string; waitMs: number }> = [
  { say: "I'm here for about three days.", waitMs: 12_000 },
  { say: 'I love food and a bit of history.', waitMs: 12_000 },
  { say: "I'd like to take it slow, nothing too strenuous.", waitMs: 12_000 },
  { say: "I'm travelling pretty frugally.", waitMs: 15_000 },
  { say: 'Is there anywhere quiet nearby to sit outside?', waitMs: 20_000 },
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface SessionResponse {
  serverUrl: string;
  roomName: string;
  identity: string;
  token: string;
  agentDispatched: boolean;
  error?: string;
}

async function main() {
  const response = await fetch(`${API}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lat: 37.7793, lng: -122.3931, accuracy: 12 }),
  });
  const session = (await response.json()) as SessionResponse;
  if (!response.ok) throw new Error(session.error ?? `HTTP ${response.status}`);

  console.log(`room=${session.roomName} dispatched=${session.agentDispatched}`);

  const room = new Room();
  const seen = new Set<string>();

  room.registerTextStreamHandler(TRANSCRIPTION_TOPIC, async (reader, identity) => {
    const attributes = reader.info.attributes ?? {};
    const text = await reader.readAll();
    if (process.env.E2E_DEBUG) {
      console.log(`  [raw ${identity}] attrs=${JSON.stringify(attributes)} text=${text}`);
    }
    // readAll() resolves on stream close, which is the real completion signal.
    const key = `${attributes['lk.segment_id']}:${text}`;
    if (seen.has(key) || !text.trim()) return;
    seen.add(key);
    const who = identity.identity === session.identity ? 'traveler' : 'GUIDE';
    console.log(`  [${who}] ${text}`);
  });

  room.registerTextStreamHandler('sidequest.profile', async (reader) => {
    console.log(`  [PROFILE SAVED] ${await reader.readAll()}`);
  });

  room.on(RoomEvent.TrackSubscribed, (_track, _pub, participant) => {
    console.log(`  (audio track from ${participant.identity} — the guide is speaking)`);
  });

  await room.connect(session.serverUrl, session.token, { autoSubscribe: true, dynacast: true });
  console.log('connected; waiting for the greeting…\n');
  await sleep(15_000);

  for (const line of SCRIPT) {
    console.log(`\n> ${line.say}`);
    await room.localParticipant?.sendText(line.say, { topic: CHAT_TOPIC });
    await sleep(line.waitMs);
  }

  await room.disconnect();
  console.log('\ndone');
  process.exit(0);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
