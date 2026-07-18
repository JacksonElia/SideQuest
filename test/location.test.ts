/** Ported from server/test/location.test.js. */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateFix,
  haversineMeters,
  shouldPublishFix,
  encodeLocationAttributes,
  MIN_PUBLISH_INTERVAL_MS,
  MIN_PUBLISH_DISTANCE_M,
} from '../lib/server/location.ts';

// --- validateFix -----------------------------------------------------------
// Coordinates arrive from an untrusted client. Anything that is not a finite
// number in range is rejected before it reaches dispatch metadata.

test('validateFix accepts a well-formed fix anywhere on Earth', () => {
  for (const fix of [
    { lat: 37.7818, lng: -122.3927 }, // SF
    { lat: -33.8688, lng: 151.2093 }, // Sydney
    { lat: 0, lng: 0 }, // null island — valid, must not be falsy-rejected
    { lat: 90, lng: 180 }, // bounds are inclusive
    { lat: -90, lng: -180 },
  ]) {
    assert.deepEqual(validateFix(fix), { ok: true, value: { ...fix, accuracy: null } });
  }
});

test('validateFix carries through a non-negative accuracy', () => {
  const r = validateFix({ lat: 37.78, lng: -122.39, accuracy: 12.5 });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.value.accuracy, 12.5);
});

test('validateFix rejects out-of-range, non-finite, and non-numeric input', () => {
  // Deliberately ill-typed values: this is the untrusted-client boundary, so
  // the runtime guards must hold regardless of what the types promise.
  const bad: unknown[] = [
    { lat: 91, lng: 0 },
    { lat: -91, lng: 0 },
    { lat: 0, lng: 181 },
    { lat: 0, lng: -181 },
    { lat: NaN, lng: 0 },
    { lat: Infinity, lng: 0 },
    { lat: '37.78', lng: -122.39 }, // strings are not coerced
    { lat: null, lng: 0 },
    { lat: 37.78 }, // missing lng
    {},
    null,
    undefined,
  ];

  for (const value of bad) {
    const r = validateFix(value);
    assert.equal(r.ok, false, `expected rejection for ${JSON.stringify(value)}`);
    assert.equal(typeof (r.ok === false && r.error), 'string');
  }
});

test('validateFix rejects a negative accuracy but tolerates it missing', () => {
  assert.equal(validateFix({ lat: 1, lng: 1, accuracy: -5 }).ok, false);
  assert.equal(validateFix({ lat: 1, lng: 1, accuracy: undefined }).ok, true);
});

// --- haversineMeters -------------------------------------------------------

test('haversineMeters is zero for identical points', () => {
  assert.equal(haversineMeters({ lat: 37.78, lng: -122.39 }, { lat: 37.78, lng: -122.39 }), 0);
});

test('haversineMeters matches a known distance', () => {
  // Ferry Building -> Oracle Park, ~1.9 km apart.
  const d = haversineMeters({ lat: 37.7955, lng: -122.3937 }, { lat: 37.7786, lng: -122.3893 });
  assert.ok(d > 1800 && d < 2000, `expected ~1900m, got ${d}`);
});

test('haversineMeters is symmetric and works across the antimeridian', () => {
  const a = { lat: 0, lng: 179.999 };
  const b = { lat: 0, lng: -179.999 };
  assert.equal(Math.round(haversineMeters(a, b)), Math.round(haversineMeters(b, a)));
  // 0.002 degrees of longitude at the equator is ~222m, NOT ~40000km.
  assert.ok(haversineMeters(a, b) < 500, 'antimeridian wrap must not blow up the distance');
});

// --- shouldPublishFix ------------------------------------------------------
// LiveKit docs warn attributes are unsuitable for updates more than once every
// few seconds, so movement is gated on both time and distance.

test('shouldPublishFix always publishes the first fix', () => {
  assert.equal(shouldPublishFix(null, { lat: 37.78, lng: -122.39, ts: 1000 }), true);
});

test('shouldPublishFix suppresses updates inside the time window', () => {
  const prev = { lat: 37.78, lng: -122.39, ts: 1000 };
  const moved = { lat: 37.9, lng: -122.5, ts: 1000 + MIN_PUBLISH_INTERVAL_MS - 1 };
  assert.equal(shouldPublishFix(prev, moved), false, 'far movement still waits out the interval');
});

test('shouldPublishFix suppresses GPS jitter once the interval has passed', () => {
  const prev = { lat: 37.78, lng: -122.39, ts: 1000 };
  const jitter = { lat: 37.780005, lng: -122.390005, ts: 1000 + MIN_PUBLISH_INTERVAL_MS + 1 };
  assert.ok(haversineMeters(prev, jitter) < MIN_PUBLISH_DISTANCE_M);
  assert.equal(shouldPublishFix(prev, jitter), false);
});

test('shouldPublishFix publishes real movement after the interval', () => {
  const prev = { lat: 37.78, lng: -122.39, ts: 1000 };
  const walked = { lat: 37.7818, lng: -122.3927, ts: 1000 + MIN_PUBLISH_INTERVAL_MS + 1 };
  assert.ok(haversineMeters(prev, walked) > MIN_PUBLISH_DISTANCE_M);
  assert.equal(shouldPublishFix(prev, walked), true);
});

// --- encodeLocationAttributes ---------------------------------------------
// LiveKit participant attributes are a Record<string, string>. Numbers must be
// stringified explicitly, and coordinates must never be folded into prose.

test('encodeLocationAttributes returns only string values', () => {
  const attrs = encodeLocationAttributes({
    lat: 37.7818,
    lng: -122.3927,
    accuracy: 12.5,
    ts: 1720000000000,
  });
  for (const [k, v] of Object.entries(attrs)) {
    assert.equal(typeof v, 'string', `${k} must be a string, got ${typeof v}`);
  }
});

test('encodeLocationAttributes keeps discrete numeric fields, not a sentence', () => {
  const attrs = encodeLocationAttributes({
    lat: 37.7818,
    lng: -122.3927,
    accuracy: 12.5,
    ts: 1720000000000,
  });
  assert.equal(attrs['sidequest.lat'], '37.7818');
  assert.equal(attrs['sidequest.lng'], '-122.3927');
  assert.equal(attrs['sidequest.accuracy_m'], '12.5');
  assert.equal(attrs['sidequest.fix_ts'], '1720000000000');
  const joined = Object.values(attrs).join(' ');
  assert.ok(
    !/\b(near|at|you are|located)\b/i.test(joined),
    'coordinates must not be embedded in prose',
  );
});

test('encodeLocationAttributes rounds to ~1m precision', () => {
  const attrs = encodeLocationAttributes({ lat: 37.78180123456, lng: -122.39270987654, ts: 1 });
  assert.equal(attrs['sidequest.lat'], '37.7818');
  assert.equal(attrs['sidequest.lng'], '-122.39271');
});

test('encodeLocationAttributes omits accuracy when unknown rather than writing "null"', () => {
  const attrs = encodeLocationAttributes({ lat: 1, lng: 2, accuracy: null, ts: 1 });
  assert.equal('sidequest.accuracy_m' in attrs, false);
});

test('encodeLocationAttributes rejects an invalid fix instead of emitting garbage', () => {
  assert.throws(() => encodeLocationAttributes({ lat: 999, lng: 0, ts: 1 }));
});
