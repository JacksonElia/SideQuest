/**
 * Tests for the pure parts of the LLM layer: config validation and the
 * concurrency pool. No network, no credentials, no tokens spent.
 *
 * The transport itself (client.js) is covered by scripts/llm-smoke.js against
 * the real API — per AGENTS.md a smoke run is sufficient there, and mocking the
 * SDK would only test the mock.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  loadLlmConfig,
  describeLlmConfig,
  DEFAULT_MODEL,
} from '../src/llm/config.js';
import { mapWithConcurrency, partitionResults } from '../src/llm/pool.js';

const baseEnv = { OPENROUTER_API_KEY: 'sk-or-v1-testkeyvalue' };

describe('loadLlmConfig', () => {
  it('throws a readable error when the key is missing', () => {
    assert.throws(() => loadLlmConfig({}), /OPENROUTER_API_KEY/);
  });

  it('applies defaults when only the key is set', () => {
    const cfg = loadLlmConfig(baseEnv);
    assert.equal(cfg.model, DEFAULT_MODEL);
    assert.equal(cfg.timeoutMs, 60_000);
    assert.equal(cfg.concurrency, 4);
    assert.equal(cfg.httpReferer, undefined);
  });

  it('lets env override the model', () => {
    const cfg = loadLlmConfig({ ...baseEnv, OPENROUTER_MODEL: 'openai/gpt-5' });
    assert.equal(cfg.model, 'openai/gpt-5');
  });

  it('rejects a non-numeric timeout rather than silently defaulting', () => {
    assert.throws(
      () => loadLlmConfig({ ...baseEnv, OPENROUTER_TIMEOUT_MS: 'soon' }),
      /OPENROUTER_TIMEOUT_MS/,
    );
  });

  it('rejects a zero or negative concurrency', () => {
    assert.throws(
      () => loadLlmConfig({ ...baseEnv, OPENROUTER_CONCURRENCY: '0' }),
      /OPENROUTER_CONCURRENCY/,
    );
  });
});

describe('describeLlmConfig', () => {
  it('never exposes the full key', () => {
    const described = describeLlmConfig(loadLlmConfig(baseEnv));
    const serialized = JSON.stringify(described);
    assert.ok(!serialized.includes('sk-or-v1-testkeyvalue'), 'full key leaked');
    assert.ok(described.apiKey.endsWith('…'));
  });
});

describe('mapWithConcurrency', () => {
  it('returns results in input order regardless of completion order', async () => {
    // Deliberately inverted: the first item is the slowest, so a naive
    // push-on-resolve implementation would come back reversed.
    const delays = [30, 20, 10, 0];

    const results = await mapWithConcurrency(
      delays,
      async (ms, i) => {
        await new Promise((r) => setTimeout(r, ms));
        return i;
      },
      { concurrency: 4 },
    );

    assert.deepEqual(
      results.map((r) => r.value),
      [0, 1, 2, 3],
    );
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
      },
      { concurrency: 3 },
    );

    assert.ok(peak <= 3, `peak concurrency was ${peak}, expected <= 3`);
  });

  it('isolates a thrown worker error to its own slot', async () => {
    const results = await mapWithConcurrency(
      [1, 2, 3],
      async (n) => {
        if (n === 2) throw new Error('bad doc');
        return n * 10;
      },
      { concurrency: 2 },
    );

    assert.deepEqual(results[0], { ok: true, value: 10 });
    assert.deepEqual(results[1], { ok: false, error: 'bad doc' });
    assert.deepEqual(results[2], { ok: true, value: 30 });
  });

  it('handles an empty input without spawning runners', async () => {
    const results = await mapWithConcurrency([], async () => 'never', { concurrency: 4 });
    assert.deepEqual(results, []);
  });

  it('marks remaining items aborted when the signal fires', async () => {
    const controller = new AbortController();

    const results = await mapWithConcurrency(
      [1, 2, 3, 4],
      async (n) => {
        if (n === 1) controller.abort();
        return n;
      },
      { concurrency: 1, signal: controller.signal },
    );

    assert.equal(results[0].ok, true);
    assert.deepEqual(results[3], { ok: false, error: 'aborted' });
  });

  it('rejects an invalid concurrency as a programmer error', async () => {
    await assert.rejects(
      () => mapWithConcurrency([1], async () => 1, { concurrency: 0 }),
      /concurrency must be a positive integer/,
    );
  });
});

describe('partitionResults', () => {
  it('keeps original indices so failures are identifiable', () => {
    const { succeeded, failed } = partitionResults([
      { ok: true, value: 'a' },
      { ok: false, error: 'boom' },
      { ok: true, value: 'c' },
    ]);

    assert.deepEqual(succeeded, [
      { index: 0, value: 'a' },
      { index: 2, value: 'c' },
    ]);
    assert.deepEqual(failed, [{ index: 1, error: 'boom' }]);
  });
});
