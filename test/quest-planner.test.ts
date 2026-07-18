import test from "node:test";
import assert from "node:assert/strict";

import {
  buildQuestQueryPrompt,
  parseQuestQueryPlan,
  QUEST_PLANNER_MODEL,
} from "../lib/server/quest-planner.ts";

const validPlan = JSON.stringify({
  queries: [
    "Best moderately priced local restaurant in San Francisco's North Beach within a 1.5-mile walk for a 5-hour outing",
    "Historic site or museum in San Francisco's North Beach within a 1.5-mile walk for a 5-hour outing",
    "Historic walking landmark in San Francisco's North Beach within a 1.5-mile walk for a 5-hour outing",
  ],
});

test("buildQuestQueryPrompt includes the fixed discovery answers and runtime location context", () => {
  const prompt = buildQuestQueryPrompt({
    locationLabel: "Downtown",
    latitude: 37.7793,
    longitude: -122.4192,
  });

  assert.equal(QUEST_PLANNER_MODEL, "google/gemini-3.1-flash-lite-preview");
  assert.match(prompt, /Just about 5 hours today/);
  assert.match(prompt, /Some local food and some historic sites would be cool/);
  assert.match(prompt, /I just want to walk around today/);
  assert.match(prompt, /I can spend a bit of money here and there/);
  assert.match(prompt, /"label":"Downtown"/);
  assert.match(prompt, /"latitude":37.7793/);
  assert.match(prompt, /"longitude":-122.4192/);
  assert.match(prompt, /San Francisco/);
  assert.match(prompt, /1.5-mile walk/);
  assert.match(prompt, /Return exactly 3 concise query strings/);
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
