/** Ported from server/test/location.test.js. */

import test from "node:test";
import assert from "node:assert/strict";

import { validateFix, haversineMeters } from "../lib/server/location.ts";

// --- validateFix -----------------------------------------------------------
// Coordinates arrive from an untrusted client. Anything that is not a finite
// number in range is rejected before it reaches dispatch metadata.

test("validateFix accepts a well-formed fix anywhere on Earth", () => {
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

test("validateFix carries through a non-negative accuracy", () => {
  const r = validateFix({ lat: 37.78, lng: -122.39, accuracy: 12.5 });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.value.accuracy, 12.5);
});

test("validateFix rejects out-of-range, non-finite, and non-numeric input", () => {
  // Deliberately ill-typed values: this is the untrusted-client boundary, so
  // the runtime guards must hold regardless of what the types promise.
  const bad: unknown[] = [
    { lat: 91, lng: 0 },
    { lat: -91, lng: 0 },
    { lat: 0, lng: 181 },
    { lat: 0, lng: -181 },
    { lat: NaN, lng: 0 },
    { lat: Infinity, lng: 0 },
    { lat: "37.78", lng: -122.39 }, // strings are not coerced
    { lat: null, lng: 0 },
    { lat: 37.78 }, // missing lng
    {},
    null,
    undefined,
  ];

  for (const value of bad) {
    const r = validateFix(value);
    assert.equal(r.ok, false, `expected rejection for ${JSON.stringify(value)}`);
    assert.equal(typeof (r.ok === false && r.error), "string");
  }
});

test("validateFix rejects a negative accuracy but tolerates it missing", () => {
  assert.equal(validateFix({ lat: 1, lng: 1, accuracy: -5 }).ok, false);
  assert.equal(validateFix({ lat: 1, lng: 1, accuracy: undefined }).ok, true);
});

// --- haversineMeters -------------------------------------------------------

test("haversineMeters is zero for identical points", () => {
  assert.equal(haversineMeters({ lat: 37.78, lng: -122.39 }, { lat: 37.78, lng: -122.39 }), 0);
});

test("haversineMeters matches a known distance", () => {
  // Ferry Building -> Oracle Park, ~1.9 km apart.
  const d = haversineMeters({ lat: 37.7955, lng: -122.3937 }, { lat: 37.7786, lng: -122.3893 });
  assert.ok(d > 1800 && d < 2000, `expected ~1900m, got ${d}`);
});

test("haversineMeters is symmetric and works across the antimeridian", () => {
  const a = { lat: 0, lng: 179.999 };
  const b = { lat: 0, lng: -179.999 };
  assert.equal(Math.round(haversineMeters(a, b)), Math.round(haversineMeters(b, a)));
  // 0.002 degrees of longitude at the equator is ~222m, NOT ~40000km.
  assert.ok(haversineMeters(a, b) < 500, "antimeridian wrap must not blow up the distance");
});
