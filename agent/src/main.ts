/**
 * SideQuest voice guide — the agent worker.
 *
 * Registers under LIVEKIT_AGENT_NAME, which is the same name the Next app
 * already dispatches by in lib/server/livekit.ts. Nothing on the web side has to
 * know this worker exists; it simply answers the dispatches that were already
 * being sent.
 */

import { ServerOptions, cli, defineAgent, inference, voice } from '@livekit/agents';
import { RoomEvent } from '@livekit/rtc-node';

// Hackathon hardcoding: the worker must connect even when ../.env.local is
// missing (--env-file-if-exists silently skips it). Real env always wins.
process.env.LIVEKIT_URL ??= 'wss://karl-kgvkqw0n.livekit.cloud';
process.env.LIVEKIT_API_KEY ??= 'APImtah35rTu6pi';
process.env.LIVEKIT_API_SECRET ??= 'whixFSK3Z21zyfflKxCZe5OoWNl6sbghjHt7HGrOoAyA';
process.env.LIVEKIT_AGENT_NAME ??= 'travel-guide';
process.env.SIDEQUEST_API_URL ??= 'http://localhost:3000';

import { createGuideAgent } from './agent.ts';
import { fixFromAttributes, fixFromJobMetadata } from './location.ts';
import { createUserData } from './types.ts';
import type { UserData } from './types.ts';

const STT_MODEL = 'deepgram/nova-3';
// 'google/gemini-3-flash' is not a LiveKit Inference model id — every LLM call
// (including the greeting) fails with it, which presents as an agent that joins
// but never speaks. The Gemini 3 Flash id carries a -preview suffix.
const LLM_MODEL = 'google/gemini-3-flash-preview';
const TTS_MODEL = 'cartesia/sonic-3';

export default defineAgent({
  entry: async (ctx) => {
    // The dispatch metadata carries the fix taken when the traveler tapped
    // start, so the guide can answer a "what's near me" before the browser has
    // published its first live attribute update.
    const initialFix = fixFromJobMetadata(ctx.job.metadata);
    const userData: UserData = createUserData(initialFix);

    const session = new voice.AgentSession<UserData>({
      userData,
      stt: STT_MODEL,
      llm: LLM_MODEL,
      tts: process.env.SIDEQUEST_TTS_VOICE
        ? new inference.TTS({ model: TTS_MODEL, voice: process.env.SIDEQUEST_TTS_VOICE })
        : TTS_MODEL,
      // Endpointing rides on Deepgram's streaming transcript rather than
      // inference.TurnDetector. The turn detector and the default Silero VAD
      // both run through @livekit/local-inference in a forked native process;
      // when that process fails to come up the agent still greets (STT/LLM/TTS
      // are all remote) but never registers a user turn, which reads exactly
      // like a dead microphone. nova-3 already emits end-of-utterance, so this
      // path has nothing local to fail.
      vad: null,
      turnHandling: { turnDetection: 'stt' },
    });

    // The one signal that distinguishes "mic is dead" from "agent is stuck":
    // if these lines appear in the worker console, audio is reaching STT.
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
      console.log(`[stt] final=${ev.isFinal} ${ev.transcript}`);
    });
    session.on(voice.AgentSessionEventTypes.Error, (ev) => {
      console.error('[session error]', ev.error);
    });
    // State traces read as a pipeline: user listening→speaking proves audio in,
    // agent thinking that never reaches speaking means the LLM/TTS leg failed.
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      console.log(`[agent state] ${ev.oldState} -> ${ev.newState}`);
    });
    session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => {
      console.log(`[user state] ${ev.oldState} -> ${ev.newState}`);
    });

    // The traveler is walking while they talk, so their position is a moving
    // input. Folding each update into userData here is what lets findNearbyPlaces
    // stay a pure function of session state rather than reaching for the room.
    ctx.room.on(RoomEvent.ParticipantAttributesChanged, (changed, participant) => {
      if (participant.identity === ctx.room.localParticipant?.identity) return;
      const fix = fixFromAttributes({ ...participant.attributes, ...changed });
      if (fix) {
        session.userData.lastFix = fix;
      }
    });

    await session.start({
      agent: createGuideAgent(),
      room: ctx.room,
      // Typed messages from the chat box arrive on the lk.chat topic and are
      // handled exactly like speech, so text and voice share one conversation.
      inputOptions: { textEnabled: true },
    });

    await ctx.connect();

    // Seed from whatever the participant already published before we attached
    // the listener above, which is a real race on a fast connect.
    const participant = await ctx.waitForParticipant();
    const joinedFix = fixFromAttributes(participant.attributes);
    if (joinedFix) {
      session.userData.lastFix = joinedFix;
    }

    // Open the floor rather than opening an intake. The persona owns the
    // wording; what matters here is that the first turn ends in their hands.
    session.generateReply({
      instructions:
        'Greet the traveler warmly in one short sentence and invite them to ask you anything ' +
        'about the city. Do not ask them any questions about themselves or their trip.',
    });
  },
});

cli.runApp(
  new ServerOptions({
    agent: import.meta.filename,
    // Must match the name the Next app dispatches by. ServerOptions falls back
    // to LIVEKIT_AGENT_NAME on its own, but naming it here keeps the coupling
    // to lib/server/config.ts visible.
    agentName: process.env.LIVEKIT_AGENT_NAME,
  }),
);
