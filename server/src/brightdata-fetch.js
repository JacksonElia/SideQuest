/**
 * One-shot ingestion of nearby Google results through Bright Data's SERP API.
 * Results are deliberately treated as untrusted search text; only the fields
 * needed by the place index are retained.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { addDocs } from './moss.js';

const QUERIES = [
  'best restaurants SoMa San Francisco',
  'walks along the Embarcadero',
  'things to do South Beach SF',
  'nature spots downtown San Francisco',
];

const REQUEST_URL = 'https://api.brightdata.com/request';
const ZONE = 'serp_api1';
const QUERY_TIMEOUT_MS = 20_000;
const serverDirectory = fileURLToPath(new URL('.', import.meta.url));
const rootEnvPath = fileURLToPath(new URL('../../.env', import.meta.url));
const serverEnvPath = `${serverDirectory}.env`;

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
 * Fetch the fixed nearby-interest queries and index all successful results in
 * one Moss batch. Failures (including a missing API key) are logged and yield
 * a zero/partial result rather than an exception.
 */
export async function fetchAndIndexNearby() {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) {
    console.error('[brightdata] BRIGHTDATA_API_KEY is not set; skipping nearby fetch.');
    return 0;
  }

  const settled = await Promise.allSettled(QUERIES.map((query) => fetchQuery(query, apiKey)));
  const fetchedAt = new Date().toISOString();
  const docs = [];

  for (const [queryIndex, result] of settled.entries()) {
    if (result.status === 'rejected') {
      console.error(`[brightdata] query failed: ${QUERIES[queryIndex]}`, result.reason);
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
        id: `brightdata:${placeId}:${queryIndex}:${resultIndex}`,
        text: [name, description].filter(Boolean).join(' '),
        metadata: {
          place_id: placeId,
          name,
          lat: 37.78,
          lng: -122.39,
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
    await addDocs(docs);
    return docs.length;
  } catch (error) {
    console.error('[brightdata] indexing failed:', error);
    return 0;
  }
}
