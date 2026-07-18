/**
 * One-shot ingestion of nearby Google results through Bright Data's SERP API.
 * Results are deliberately treated as untrusted search text; only the fields
 * needed by the place index are retained.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { createStore } from './store.ts';

const store = createStore();

function buildQueries(locationLabel) {
  return [
    `best restaurants near ${locationLabel}`,
    `scenic walks near ${locationLabel}`,
    `best things to do near ${locationLabel}`,
    `history and landmarks near ${locationLabel}`,
  ];
}

const REQUEST_URL = 'https://api.brightdata.com/request';
const ZONE = 'serp_api1';
const QUERY_TIMEOUT_MS = 20_000;
// Resolved from the working directory rather than import.meta.url: webpack
// cannot bundle `new URL('.', import.meta.url)`, and both Next and the smoke
// scripts run from the repo root.
const rootEnvPath = join(process.cwd(), '.env');
const serverEnvPath = join(process.cwd(), 'lib', 'server', '.env');

// Match Moss's optional Node-native .env loading without replacing an
// intentionally supplied API key.
if (!process.env.BRIGHTDATA_API_KEY) {
  const envPath = existsSync(rootEnvPath)
    ? rootEnvPath
    : (existsSync(serverEnvPath) ? serverEnvPath : null);
  if (envPath && typeof process.loadEnvFile === 'function') process.loadEnvFile(envPath);
}

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'brightdata-result';
}

async function fetchQuery(query, apiKey) {
  const searchUrl = new URL('https://www.google.com/search');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('gl', 'us');
  searchUrl.searchParams.set('hl', 'en');
  searchUrl.searchParams.set('brd_json', '1');

  const response = await fetch(REQUEST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ zone: ZONE, url: searchUrl.toString(), format: 'raw' }),
    signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Bright Data returned HTTP ${response.status}: ${body}`);
  }
  const payload = await response.json();
  return Array.isArray(payload.organic) ? payload.organic : [];
}

/**
 * Fetch the nearby-interest queries for the given location and index all
 * successful results in one Moss batch. Failures (including a missing API key)
 * are logged and yield a zero/partial result rather than an exception.
 */
export async function fetchAndIndexNearby(locationLabel = 'downtown San Francisco', lat = 37.78, lng = -122.39) {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) {
    console.error('[brightdata] BRIGHTDATA_API_KEY is not set; skipping nearby fetch.');
    return 0;
  }

  const queries = buildQueries(locationLabel);
  const settled = await Promise.allSettled(queries.map((query) => fetchQuery(query, apiKey)));
  const fetchedAt = new Date().toISOString();
  const docs = [];

  for (const [queryIndex, result] of settled.entries()) {
    if (result.status === 'rejected') {
      console.error(`[brightdata] query failed: ${queries[queryIndex]}`, result.reason);
      continue;
    }

    for (const [resultIndex, item] of result.value.entries()) {
      const name = typeof item?.title === 'string' ? item.title.trim() : '';
      if (!name) continue;
      const description = typeof item.description === 'string'
        ? item.description.trim()
        : (typeof item.snippet === 'string' ? item.snippet.trim() : '');
      const placeId = slugify(name);

      docs.push({
        id: `brightdata:${placeId}:${slugify(locationLabel)}:${queryIndex}:${resultIndex}`,
        text: [name, description].filter(Boolean).join(' '),
        metadata: {
          place_id: placeId,
          name,
          lat,
          lng,
          kind: 'brightdata_result',
          source: 'brightdata',
          fetched_at: fetchedAt,
          is_fixture: false,
        },
      });
    }
  }

  if (docs.length === 0) return 0;

  try {
    await store.addDocs('sidequest-places', docs);
    return docs.length;
  } catch (error) {
    console.error('[brightdata] indexing failed:', error);
    return 0;
  }
}
