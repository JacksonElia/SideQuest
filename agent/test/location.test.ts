import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fixFromAttributes, fixFromJobMetadata } from '../src/location.ts';

describe('fixFromAttributes', () => {
  it('decodes the attributes the browser publishes', () => {
    const fix = fixFromAttributes({
      'sidequest.lat': '37.7804',
      'sidequest.lng': '-122.3934',
      'sidequest.accuracy_m': '12.5',
      'sidequest.fix_ts': '1750000000000',
    });

    assert.deepEqual(fix, {
      lat: 37.7804,
      lng: -122.3934,
      accuracyM: 12.5,
      ts: 1750000000000,
    });
  });

  it('keeps a fix whose optional fields are absent', () => {
    const fix = fixFromAttributes({ 'sidequest.lat': '0', 'sidequest.lng': '0' });
    assert.deepEqual(fix, { lat: 0, lng: 0, accuracyM: null, ts: null });
  });

  it('returns null rather than throwing on junk from an untrusted client', () => {
    assert.equal(fixFromAttributes(undefined), null);
    assert.equal(fixFromAttributes({}), null);
    assert.equal(fixFromAttributes({ 'sidequest.lat': '37.78' }), null);
    assert.equal(fixFromAttributes({ 'sidequest.lat': 'north', 'sidequest.lng': '-122' }), null);
  });

  it('rejects an empty coordinate instead of reading it as zero', () => {
    // Number('') is 0, which would silently place the traveler in the Atlantic.
    assert.equal(fixFromAttributes({ 'sidequest.lat': '', 'sidequest.lng': '' }), null);
  });

  it('rejects out-of-range coordinates', () => {
    assert.equal(fixFromAttributes({ 'sidequest.lat': '91', 'sidequest.lng': '0' }), null);
    assert.equal(fixFromAttributes({ 'sidequest.lat': '0', 'sidequest.lng': '181' }), null);
  });
});

describe('fixFromJobMetadata', () => {
  const metadata = (location: unknown) =>
    JSON.stringify({ schema: 'sidequest.location.v1', location });

  it('decodes the fix seeded at dispatch', () => {
    const fix = fixFromJobMetadata(
      metadata({ lat: 37.7804, lng: -122.3934, accuracy_m: 8, fix_ts: 1750000000000 }),
    );

    assert.deepEqual(fix, { lat: 37.7804, lng: -122.3934, accuracyM: 8, ts: 1750000000000 });
  });

  it('handles a dispatch that carried no location', () => {
    assert.equal(fixFromJobMetadata(metadata(null)), null);
  });

  it('ignores metadata from an unrecognised schema', () => {
    const other = JSON.stringify({ schema: 'something.else.v9', location: { lat: 1, lng: 2 } });
    assert.equal(fixFromJobMetadata(other), null);
  });

  it('returns null for malformed or missing metadata', () => {
    assert.equal(fixFromJobMetadata(undefined), null);
    assert.equal(fixFromJobMetadata(''), null);
    assert.equal(fixFromJobMetadata('not json'), null);
    assert.equal(fixFromJobMetadata(metadata({ lat: '37.78', lng: '-122.39' })), null);
  });
});
