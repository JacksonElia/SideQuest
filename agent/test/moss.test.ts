import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lookupPlaces, resolveRadiusMin } from '../src/moss.ts';
import type { Fix, TravelProfile } from '../src/types.ts';

const FIX: Fix = { lat: 37.7804, lng: -122.3934, accuracyM: 10, ts: 1750000000000 };

const profile = (overrides: Partial<TravelProfile> = {}): TravelProfile => ({
  durationDays: 3,
  interests: ['food'],
  activityLevel: null,
  budget: null,
  ...overrides,
});

/** Build a fetch stand-in that records its request and replies with `payload`. */
function stubFetch(payload: unknown, init: { status?: number; ok?: boolean } = {}) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const impl = (async (url: string | URL, options?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(options?.body ?? '{}')),
    });
    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => payload,
    } as unknown as Response;
  }) as unknown as typeof fetch;

  return { impl, calls };
}

const chunk = (metadata: Record<string, unknown>, text = 'A pleasant spot.') => ({
  text,
  score: 0.9,
  metadata,
});

describe('resolveRadiusMin', () => {
  it('prefers an explicit radius over the profile', () => {
    assert.equal(resolveRadiusMin(40, profile({ activityLevel: 'restful' })), 40);
  });

  it('maps activity level to a walking budget', () => {
    assert.equal(resolveRadiusMin(null, profile({ activityLevel: 'spry' })), 25);
    assert.equal(resolveRadiusMin(null, profile({ activityLevel: 'moderate' })), 15);
    assert.equal(resolveRadiusMin(null, profile({ activityLevel: 'restful' })), 8);
  });

  it('defers to the query layer default when nothing is known', () => {
    assert.equal(resolveRadiusMin(null, null), null);
    assert.equal(resolveRadiusMin(null, profile()), null);
    // A nonsense radius must not become a constraint.
    assert.equal(resolveRadiusMin(0, null), null);
    assert.equal(resolveRadiusMin(Number.NaN, null), null);
  });
});

describe('lookupPlaces', () => {
  it('sends the fix, utterance, and derived constraints to /api/query', async () => {
    const { impl, calls } = stubFetch({ chunks: [], warnings: [] });

    await lookupPlaces({
      fix: FIX,
      utterance: 'a quiet cafe',
      profile: profile({ activityLevel: 'restful' }),
      indoor: true,
      maxBusyness: 30,
      baseUrl: 'http://localhost:3000',
      fetchImpl: impl,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, 'http://localhost:3000/api/query');
    assert.deepEqual(calls[0]!.body, {
      lat: 37.7804,
      lng: -122.3934,
      utterance: 'a quiet cafe',
      constraints: { radius_min: 8, indoor: true, max_busyness: 30 },
    });
  });

  it('omits constraints entirely when there is nothing to constrain', async () => {
    const { impl, calls } = stubFetch({ chunks: [], warnings: [] });

    await lookupPlaces({ fix: FIX, utterance: 'anything', fetchImpl: impl });

    assert.equal(calls[0]!.body.constraints, null);
  });

  it('truncates an over-long utterance to the cap the route enforces', async () => {
    const { impl, calls } = stubFetch({ chunks: [], warnings: [] });

    await lookupPlaces({ fix: FIX, utterance: 'x'.repeat(600), fetchImpl: impl });

    assert.equal(String(calls[0]!.body.utterance).length, 500);
  });

  it('flattens chunks and computes walking time from the metadata coordinates', async () => {
    // ~700m north of the fix, which is a shade under nine minutes at 80 m/min.
    const { impl } = stubFetch({
      chunks: [
        chunk(
          {
            name: 'Delancey Street Restaurant',
            kind: 'restaurant',
            lat: 37.7867,
            lng: -122.3934,
            indoor: true,
            busyness_pct: 40,
          },
          'A neighbourhood institution.',
        ),
      ],
      warnings: [],
    });

    const { places } = await lookupPlaces({ fix: FIX, utterance: 'dinner', fetchImpl: impl });

    assert.equal(places.length, 1);
    assert.equal(places[0]!.name, 'Delancey Street Restaurant');
    assert.equal(places[0]!.kind, 'restaurant');
    assert.equal(places[0]!.description, 'A neighbourhood institution.');
    assert.equal(places[0]!.indoor, true);
    assert.equal(places[0]!.busynessPct, 40);
    assert.equal(places[0]!.walkingMinutes, 9);
  });

  it('drops a chunk with no usable name instead of voicing a nameless place', async () => {
    const { impl } = stubFetch({
      chunks: [chunk({ lat: 37.78, lng: -122.39 }), chunk({ name: '   ' })],
      warnings: [],
    });

    const { places } = await lookupPlaces({ fix: FIX, utterance: 'anything', fetchImpl: impl });
    assert.deepEqual(places, []);
  });

  it('leaves walking time unknown when a place has no coordinates', async () => {
    const { impl } = stubFetch({ chunks: [chunk({ name: 'Somewhere' })], warnings: [] });

    const { places } = await lookupPlaces({ fix: FIX, utterance: 'anything', fetchImpl: impl });
    assert.equal(places[0]!.walkingMinutes, null);
  });

  it('passes query-layer warnings through for the guide to voice', async () => {
    const { impl } = stubFetch({
      chunks: [],
      warnings: ['Nearby places are temporarily unavailable.'],
    });

    const result = await lookupPlaces({ fix: FIX, utterance: 'coffee', fetchImpl: impl });

    assert.deepEqual(result.places, []);
    assert.deepEqual(result.warnings, ['Nearby places are temporarily unavailable.']);
  });

  it('degrades to a warning when the API returns an error status', async () => {
    const { impl } = stubFetch({}, { ok: false, status: 500 });

    const result = await lookupPlaces({ fix: FIX, utterance: 'coffee', fetchImpl: impl });

    assert.deepEqual(result.places, []);
    assert.match(result.warnings[0]!, /failed \(status 500\)/);
  });

  it('degrades to a warning when the API is unreachable', async () => {
    const impl = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const result = await lookupPlaces({ fix: FIX, utterance: 'coffee', fetchImpl: impl });

    assert.deepEqual(result.places, []);
    assert.equal(result.warnings.length, 1);
  });

  it('rethrows when the traveler interrupts, so the call is discarded not announced', async () => {
    const controller = new AbortController();
    controller.abort();

    const impl = (async () => {
      throw new Error('The operation was aborted');
    }) as unknown as typeof fetch;

    await assert.rejects(
      lookupPlaces({
        fix: FIX,
        utterance: 'coffee',
        signal: controller.signal,
        fetchImpl: impl,
      }),
    );
  });
});
