import assert from 'node:assert/strict';
import test from 'node:test';

import { INSTRUCTIONS } from '../lib/server/prompt.ts';

test('the guide is grounded in San Francisco and English', () => {
  assert.match(INSTRUCTIONS, /San Francisco, California/);
  assert.match(INSTRUCTIONS, /Speak English by default/);
  assert.match(INSTRUCTIONS, /Do not switch languages unless the traveler explicitly asks/);
});

test('the guide waits for the next user turn after one answer', () => {
  assert.match(INSTRUCTIONS, /at most one response to each user turn/);
  assert.match(INSTRUCTIONS, /wait silently for the next user turn/);
  assert.match(INSTRUCTIONS, /Do not react to your own words or transcript/);
});
