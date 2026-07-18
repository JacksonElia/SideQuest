import test from "node:test";
import assert from "node:assert/strict";

import {
  buildQuestQueryPrompt,
  parseQuestQueryPlan,
  radiusMinutesForProfile,
  QUEST_PLANNER_MODEL,
} from "../lib/server/quest-planner.ts";
import type { TravelProfile } from "../types/message.ts";

const CONTEXT = {
  locationLabel: "Downtown",
  latitude: 37.7793,
  longitude: -122.4192,
};

const FULL_PROFILE: TravelProfile = {
  durationDays: 1,
  interests: ["local food", "historic sites"],
  activityLevel: "moderate",
  budget: "moderate",
};

const validPlan = JSON.stringify({
  queries: [
    "Best moderately priced local restaurant in San Francisco's North Beach within a 0.7-mile walk",
    "Historic site or museum in San Francisco's North Beach within a 0.7-mile walk",
    "Historic walking landmark in San Francisco's North Beach within a 0.7-mile walk",
  ],
});

test("buildQuestQueryPrompt renders the saved profile and runtime location context", () => {
  const prompt = buildQuestQueryPrompt(CONTEXT, FULL_PROFILE);

  assert.equal(QUEST_PLANNER_MODEL, "google/gemini-3.1-flash-lite-preview");
  // The answers come from the typed planning profile.
  assert.match(prompt, /Just a single day out/);
  assert.match(prompt, /local food, historic sites/);
  assert.match(prompt, /wants a comfortable amount of walking/);
  assert.match(prompt, /happy to spend a bit here and there/);
  assert.match(prompt, /"label":"Downtown"/);
  assert.match(prompt, /"latitude":37.7793/);
  assert.match(prompt, /"longitude":-122.4192/);
  assert.match(prompt, /San Francisco/);
  assert.match(prompt, /Return exactly 3 concise query strings/);
});

test("buildQuestQueryPrompt derives walking distance from the activity level", () => {
  // 15 min * 80 m/min = 1200 m = 0.7 mi.
  assert.match(buildQuestQueryPrompt(CONTEXT, FULL_PROFILE), /"0\.7-mile walk"/);
  // 25 min * 80 = 2000 m = 1.2 mi; 8 min * 80 = 640 m = 0.4 mi.
  assert.match(
    buildQuestQueryPrompt(CONTEXT, { ...FULL_PROFILE, activityLevel: "spry" }),
    /"1\.2-mile walk"/,
  );
  assert.match(
    buildQuestQueryPrompt(CONTEXT, { ...FULL_PROFILE, activityLevel: "restful" }),
    /"0\.4-mile walk"/,
  );
});

test("radiusMinutesForProfile mirrors the agent's radius-by-activity table", () => {
  assert.equal(radiusMinutesForProfile({ ...FULL_PROFILE, activityLevel: "spry" }), 25);
  assert.equal(radiusMinutesForProfile({ ...FULL_PROFILE, activityLevel: "moderate" }), 15);
  assert.equal(radiusMinutesForProfile({ ...FULL_PROFILE, activityLevel: "restful" }), 8);
  // Skipped question falls back to the same default query.ts uses.
  assert.equal(radiusMinutesForProfile({ ...FULL_PROFILE, activityLevel: null }), 15);
});

test("buildQuestQueryPrompt omits questions the traveler skipped", () => {
  const prompt = buildQuestQueryPrompt(CONTEXT, {
    durationDays: null,
    interests: [],
    activityLevel: null,
    budget: null,
  });

  // The traveler skipped everything, so no answers may be invented for them.
  assert.match(prompt, /The traveler skipped every planning question/);
  assert.doesNotMatch(prompt, /Question: How long/);
  assert.doesNotMatch(prompt, /Question: What are they drawn to/);
  assert.match(prompt, /The visitor named no interests/);
  assert.match(prompt, /Do not invent answers/);
});

test("buildQuestQueryPrompt renders a multi-day trip and only the answered questions", () => {
  const prompt = buildQuestQueryPrompt(CONTEXT, {
    durationDays: 4,
    interests: ["street art"],
    activityLevel: null,
    budget: "frugal",
  });

  assert.match(prompt, /About 4 days/);
  assert.match(prompt, /street art/);
  assert.match(prompt, /traveling frugally/);
  assert.doesNotMatch(prompt, /Question: How active/);
  // No activity level means the default radius, same as query.ts.
  assert.match(prompt, /"0\.7-mile walk"/);
});

test("parseQuestQueryPlan accepts exactly three query strings", () => {
  assert.deepEqual(parseQuestQueryPlan(validPlan), {
    ok: true,
    value: JSON.parse(validPlan),
  });
});

test("parseQuestQueryPlan rejects malformed JSON, wrong query counts, and empty strings", () => {
  assert.deepEqual(parseQuestQueryPlan("not json"), {
    ok: false,
    error: "model response must be valid JSON",
  });

  assert.deepEqual(parseQuestQueryPlan('{"queries":[]}'), {
    ok: false,
    error: "model response must contain exactly 3 queries",
  });

  assert.deepEqual(
    parseQuestQueryPlan(
      JSON.stringify({
        queries: ["A", "B", ""],
      }),
    ),
    {
      ok: false,
      error: "queries[2] must be a non-empty string",
    },
  );
});
