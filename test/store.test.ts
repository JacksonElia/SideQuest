/** Ported from tests/test_store.py. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FakeStore, createStore, MossStore } from '../lib/server/store.ts';

async function seededStore(): Promise<FakeStore> {
  const fake = new FakeStore();
  await fake.addDocs('places', [
    {
      text: 'South Park has sunny lawns and coffee nearby.',
      metadata: { place_id: 'south-park', lat: 37.78, lng: -122.393, indoor: false },
    },
    {
      text: 'A quiet indoor gallery has contemporary art.',
      metadata: { place_id: 'gallery', lat: 37.781, lng: -122.394, indoor: true },
    },
    {
      text: 'Oracle Park hosts baseball games.',
      metadata: { place_id: 'oracle-park', lat: 37.778, lng: -122.389, indoor: false },
    },
  ]);
  return fake;
}

const placeIds = (results: Array<{ metadata: Record<string, unknown> }>) =>
  results.map((result) => result.metadata.place_id);

describe('FakeStore', () => {
  test('search ranks keyword overlap', async () => {
    const store = await seededStore();
    const results = await store.search('places', 'quiet art gallery');

    assert.deepEqual(placeIds(results), ['gallery', 'south-park', 'oracle-park']);
    assert.ok(results[0].score > results[1].score);
  });

  test('search applies radius and exact metadata filters', async () => {
    const store = await seededStore();
    const results = await store.search('places', 'park gallery', {
      lat: 37.78,
      lng: -122.393,
      radiusM: 150,
      filters: { indoor: true },
    });

    assert.deepEqual(placeIds(results), ['gallery']);
  });

  test('updateMetadata and deleteWhere', async () => {
    const store = await seededStore();
    await store.updateMetadata('places', 'south-park', { busyness_pct: 35 });

    const updated = await store.search('places', 'south park', {
      filters: { busyness_pct: 35 },
    });
    assert.equal(updated[0].metadata.place_id, 'south-park');

    await store.deleteWhere('places', { indoor: true });
    assert.deepEqual(placeIds(await store.search('places', 'gallery')), [
      'south-park',
      'oracle-park',
    ]);
  });

  test('addDocs copies input so later mutation of the caller’s object is not shared', async () => {
    const store = new FakeStore();
    const doc = { text: 'a place', metadata: { place_id: 'p', busyness_pct: 10 } };
    await store.addDocs('places', [doc]);

    doc.metadata.busyness_pct = 99;

    const [result] = await store.search('places', 'place');
    assert.equal(result.metadata.busyness_pct, 10);
  });
});

describe('createStore', () => {
  // Inverted from the Python original (test_factory_defaults_to_fake). The
  // default moved from "fake" to "moss" so an unset STORE_BACKEND can no longer
  // serve in-memory results from the real query path.
  test('defaults to moss', () => {
    const previous = process.env.STORE_BACKEND;
    const previousId = process.env.MOSS_PROJECT_ID;
    const previousKey = process.env.MOSS_PROJECT_KEY;

    delete process.env.STORE_BACKEND;
    process.env.MOSS_PROJECT_ID = 'test-project';
    process.env.MOSS_PROJECT_KEY = 'test-key';

    try {
      assert.ok(createStore() instanceof MossStore);
    } finally {
      if (previous === undefined) delete process.env.STORE_BACKEND;
      else process.env.STORE_BACKEND = previous;
      if (previousId === undefined) delete process.env.MOSS_PROJECT_ID;
      else process.env.MOSS_PROJECT_ID = previousId;
      if (previousKey === undefined) delete process.env.MOSS_PROJECT_KEY;
      else process.env.MOSS_PROJECT_KEY = previousKey;
    }
  });

  test('honors an explicit fake backend', () => {
    assert.ok(createStore('fake') instanceof FakeStore);
  });

  test('rejects an unknown backend', () => {
    assert.throws(() => createStore('redis'), /Unsupported STORE_BACKEND: redis/);
  });

  // The Python MossStore raised on missing credentials; keeping that here is
  // what makes the new "moss" default fail loudly instead of silently.
  test('moss backend requires credentials', () => {
    const previousId = process.env.MOSS_PROJECT_ID;
    const previousKey = process.env.MOSS_PROJECT_KEY;
    delete process.env.MOSS_PROJECT_ID;
    delete process.env.MOSS_PROJECT_KEY;

    try {
      assert.throws(() => createStore('moss'), /MOSS_PROJECT_ID and MOSS_PROJECT_KEY/);
    } finally {
      if (previousId !== undefined) process.env.MOSS_PROJECT_ID = previousId;
      if (previousKey !== undefined) process.env.MOSS_PROJECT_KEY = previousKey;
    }
  });
});
