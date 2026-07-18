/** Ported from tests/test_query.py. */

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { FakeStore } from '../lib/server/store.ts';
import { query, setStore, setContextHook, INDEX_NAME } from '../lib/server/query.ts';

afterEach(() => {
  setStore(null);
  setContextHook(null);
});

const NEARBY = { lat: 37.78, lng: -122.393 };

async function seededStore(): Promise<FakeStore> {
  const store = new FakeStore();
  await store.addDocs(INDEX_NAME, [
    {
      text: 'quiet park with a garden',
      metadata: { place_id: 'park', ...NEARBY, indoor: false, lang: 'en', busyness_pct: 20 },
    },
    {
      text: 'quiet park',
      metadata: { place_id: 'park', ...NEARBY, indoor: false, lang: 'en', busyness_pct: 20 },
    },
    {
      text: 'quiet park with crowds',
      // Deliberately a string: metadata round-trips through JSON and a
      // stringified number must still be compared numerically.
      metadata: {
        place_id: 'crowded-park',
        ...NEARBY,
        indoor: false,
        lang: 'en',
        busyness_pct: '90',
      },
    },
    {
      text: 'quiet park far away',
      metadata: {
        place_id: 'far-park',
        lat: 37.8,
        lng: -122.393,
        indoor: false,
        lang: 'en',
        busyness_pct: 10,
      },
    },
  ]);
  return store;
}

describe('query', () => {
  test('applies context filters, radius, and deduplicates by place', async () => {
    setStore(await seededStore());
    setContextHook((constraints) => [{ ...constraints, max_busyness: 50 }, ['rain expected']]);

    const result = await query(NEARBY.lat, NEARBY.lng, 'quiet park', {
      radius_min: 1,
      indoor: false,
      lang: 'en',
    });

    assert.deepEqual(
      result.chunks.map((chunk) => chunk.metadata.place_id),
      ['park'],
    );
    assert.equal(result.chunks[0].text, 'quiet park with a garden');
    assert.deepEqual(result.warnings, ['rain expected']);
    assert.ok(result.latency_ms >= 0);
  });

  test('excludes places whose busyness_pct is missing rather than admitting them', async () => {
    const store = new FakeStore();
    await store.addDocs(INDEX_NAME, [
      { text: 'quiet park', metadata: { place_id: 'unknown-busyness', ...NEARBY } },
    ]);
    setStore(store);
    setContextHook((constraints) => [{ ...constraints, max_busyness: 50 }, []]);

    const result = await query(NEARBY.lat, NEARBY.lng, 'quiet park', { radius_min: 1 });

    assert.deepEqual(result.chunks, []);
  });

  test('fails soft when the store throws', async () => {
    setStore({
      addDocs: async () => {},
      search: async () => {
        throw new Error('moss is down');
      },
      updateMetadata: async () => {},
      deleteWhere: async () => {},
    });

    const result = await query(NEARBY.lat, NEARBY.lng, 'quiet park');

    assert.deepEqual(result.chunks, []);
    assert.deepEqual(result.warnings, ['Nearby places are temporarily unavailable.']);
  });

  test('filters to a single place when place_id is supplied', async () => {
    setStore(await seededStore());

    const result = await query(
      NEARBY.lat,
      NEARBY.lng,
      'quiet park',
      { radius_min: 1 },
      'crowded-park',
    );

    assert.deepEqual(
      result.chunks.map((chunk) => chunk.metadata.place_id),
      ['crowded-park'],
    );
  });
});
