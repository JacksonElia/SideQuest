/**
 * The only module that touches livekit-server-sdk. Everything else works with
 * plain objects, which keeps the SDK surface small and swappable.
 *
 * Verified against docs.livekit.io (server-sdk-js v2):
 *   - AccessToken(apiKey, apiSecret, {identity, name, metadata, attributes, ttl})
 *   - at.addGrant({...}); await at.toJwt()   <- async since the jose migration
 *   - agentDispatch.createDispatch(roomName, agentName, { metadata })
 */

import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk';
import { randomUUID } from 'node:crypto';

import { validateFix, encodeLocationAttributes } from './location.js';

/** Rooms are single-session and disposable; a fresh name per tap avoids state bleed. */
export function newRoomName(prefix = 'sidequest') {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

/**
 * Mint a join token for the human participant.
 *
 * `canUpdateOwnMetadata` is what allows the browser to call setAttributes() —
 * without it the GPS updates are silently rejected by the server.
 *
 * The initial fix is seeded into token attributes so the agent can read a
 * location the instant the participant joins, before any client-side update
 * has had a chance to land.
 */
export async function mintToken(cfg, { roomName, identity, fix }) {
  const attributes = fix ? encodeLocationAttributes(fix) : undefined;

  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity,
    // 1h is plenty for a session and limits the blast radius of a leaked token.
    ttl: '1h',
    attributes,
  });

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true, // microphone
    canSubscribe: true, // agent's voice
    canPublishData: true,
    canUpdateOwnMetadata: true, // REQUIRED for setAttributes() on the client
  });

  return at.toJwt();
}

/**
 * Explicitly dispatch the dashboard agent into the room.
 *
 * Deliberately NOT using the token-based RoomConfiguration path: per the docs,
 * token dispatch only fires when the room is first created, so a reconnect or a
 * second participant would join an agentless room.
 *
 * The fix is passed as job metadata so the agent has coordinates at job start.
 * It is JSON with discrete numeric fields — never prose (AGENTS.md #3).
 */
export async function dispatchAgent(cfg, { roomName, fix }) {
  const client = new AgentDispatchClient(cfg.livekitUrl, cfg.apiKey, cfg.apiSecret);

  const metadata = JSON.stringify({
    schema: 'sidequest.location.v1',
    location: fix ? { lat: fix.lat, lng: fix.lng, accuracy_m: fix.accuracy, fix_ts: fix.ts } : null,
  });

  return client.createDispatch(roomName, cfg.agentName, { metadata });
}

/**
 * Create a full session: validate the fix, mint a token, dispatch the agent.
 *
 * Fail-soft on dispatch (AGENTS.md): if dispatch fails, the participant still
 * gets a usable token and connects to the room. They land in a silent room
 * rather than seeing an error page, and `agentDispatched: false` tells the
 * client to show a degraded-mode notice.
 */
export async function createSession(cfg, { fix: rawFix, identity }) {
  const validated = validateFix(rawFix);
  if (!validated.ok) {
    const err = new Error(validated.error);
    err.statusCode = 400;
    throw err;
  }

  const fix = { ...validated.value, ts: Date.now() };
  const roomName = newRoomName();
  const participantIdentity = identity || `traveler-${randomUUID().slice(0, 8)}`;

  const token = await mintToken(cfg, { roomName, identity: participantIdentity, fix });

  let agentDispatched = true;
  let dispatchError = null;
  try {
    await dispatchAgent(cfg, { roomName, fix });
  } catch (err) {
    agentDispatched = false;
    dispatchError = err.message;
    console.error(`[session] dispatch failed for room=${roomName}: ${err.message}`);
  }

  return {
    serverUrl: cfg.livekitUrl,
    roomName,
    identity: participantIdentity,
    token,
    agentDispatched,
    dispatchError,
  };
}
