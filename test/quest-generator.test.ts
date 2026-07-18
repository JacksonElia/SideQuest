import test from "node:test";
import assert from "node:assert/strict";

import { parseQuests } from "../lib/server/quest-generator.ts";

const quest = (name: string) => ({
  name,
  description: `A walk called ${name}.`,
  stops: ["Stop A", "Stop B"],
});

test("parseQuests accepts three valid quests", () => {
  const result = parseQuests(
    JSON.stringify({ quests: [quest("One"), quest("Two"), quest("Three")] }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.length, 3);
  assert.deepEqual(
    result.value.map((q) => q.name),
    ["One", "Two", "Three"],
  );
  assert.deepEqual(result.value[0].stops, ["Stop A", "Stop B"]);
});

test("parseQuests accepts a single valid quest", () => {
  const result = parseQuests(JSON.stringify({ quests: [quest("Solo")] }));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.length, 1);
  assert.equal(result.value[0].name, "Solo");
});

test("parseQuests slices five quests down to three", () => {
  const result = parseQuests(
    JSON.stringify({ quests: ["1", "2", "3", "4", "5"].map(quest) }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.length, 3);
  assert.deepEqual(
    result.value.map((q) => q.name),
    ["1", "2", "3"],
  );
});

test("parseQuests rejects when no quest is valid", () => {
  const result = parseQuests(
    JSON.stringify({ quests: [{ name: "" }, { name: 7 }, "not a quest"] }),
  );

  assert.equal(result.ok, false);
});

test("parseQuests rejects non-JSON", () => {
  const result = parseQuests("Here are your quests!");

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /valid JSON/);
});

test("parseQuests coerces a missing description to the empty string", () => {
  const result = parseQuests(
    JSON.stringify({ quests: [{ name: "No Blurb", stops: ["Stop A", "", 3] }] }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value[0].description, "");
  // Non-string and empty stops are filtered, not fatal.
  assert.deepEqual(result.value[0].stops, ["Stop A"]);
});
