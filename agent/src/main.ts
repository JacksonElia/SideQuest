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

import { createGuideAgent } from './agent.ts';
import { fixFromAttributes, fixFromJobMetadata } from './location.ts';
import { createUserData } from './types.ts';
import type { TravelProfile, UserData } from './types.ts';

/** Text stream topic the browser listens on to render the settled travel plan. */
const PROFILE_TOPIC = 'sidequest.profile';

const STT_MODEL = 'deepgram/nova-3';
const LLM_MODEL = 'google/gemini-3-flash';
const TTS_MODEL = 'cartesia/sonic-3';

export default defineAgent({
  entry: async (ctx) => {
    // The dispatch metadata carries the fix taken when the traveler tapped
    // start, so the guide can answer a "what's near me" before the browser has
    // published its first live attribute update.
    const initialFix = fixFromJobMetadata(ctx.job.metadata);
    const userData: UserData = createUserData(initialFix);

    userData.publishProfile = async (profile: TravelProfile) => {
      await ctx.room.localParticipant?.sendText(JSON.stringify(profile), {
        topic: PROFILE_TOPIC,
      });
    };

    const session = new voice.AgentSession<UserData>({
      userData,
      stt: STT_MODEL,
      llm: LLM_MODEL,
      tts: process.env.SIDEQUEST_TTS_VOICE
        ? new inference.TTS({ model: TTS_MODEL, voice: process.env.SIDEQUEST_TTS_VOICE })
        : TTS_MODEL,
      turnHandling: { turnDetection: new inference.TurnDetector() },
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

    // Planning mode opens the conversation; the persona owns the wording.
    session.generateReply({
      instructions:
        'Greet the traveler warmly and briefly, then ask your first planning question about ' +
        'how long they will be traveling.',
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
