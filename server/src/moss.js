/**
 * The single Moss integration point. Place metadata stays structured so callers
 * can filter and route by it without treating scraped text as instructions.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MossClient } from '@inferedge/moss';

const INDEX_NAME = 'sidequest-places';
const serverDirectory = fileURLToPath(new URL('.', import.meta.url));
const rootEnvPath = fileURLToPath(new URL('../../.env', import.meta.url));
const serverEnvPath = `${serverDirectory}.env`;

// Do not overwrite credentials that were deliberately supplied by the process
// running the server. Older supported Node 20 releases lack loadEnvFile(), so
// they must be launched with MOSS_PROJECT_ID and MOSS_PROJECT_KEY already set.
if (!process.env.MOSS_PROJECT_ID || !process.env.MOSS_PROJECT_KEY) {
  const envPath = existsSync(rootEnvPath)
    ? rootEnvPath
    : (existsSync(serverEnvPath) ? serverEnvPath : null);
  if (envPath && typeof process.loadEnvFile === 'function') process.loadEnvFile(envPath);
}

if (!process.env.MOSS_PROJECT_ID || !process.env.MOSS_PROJECT_KEY) {
  throw new Error('MOSS_PROJECT_ID and MOSS_PROJECT_KEY must be set before loading Moss.');
}

const client = new MossClient(process.env.MOSS_PROJECT_ID, process.env.MOSS_PROJECT_KEY);
await client.loadIndex(INDEX_NAME);

function parseMetadata(rawMetadata) {
  let metadata = rawMetadata;
  if (typeof rawMetadata === 'string') {
    try {
      metadata = JSON.parse(rawMetadata);
    } catch {
      metadata = {};
    }
  }

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};

  const parsed = { ...metadata };
  for (const field of ['lat', 'lng']) {
    if (typeof parsed[field] === 'string') {
      const value = Number.parseFloat(parsed[field]);
      if (Number.isFinite(value)) parsed[field] = value;
    }
  }
  return parsed;
}

function normalizeResults(docs) {
  const byPlaceId = new Map();

  for (const doc of docs) {
    const metadata = parseMetadata(doc.metadata);
    const result = { text: doc.text, score: doc.score, metadata };
    const key = metadata.place_id ?? doc.id;
    const existing = byPlaceId.get(key);
    if (!existing || result.score > existing.score) byPlaceId.set(key, result);
  }

  return [...byPlaceId.values()].sort((a, b) => b.score - a.score);
}

/** Search the loaded places index and collapse multiple chunks for one place. */
export async function searchPlaces(queryText, { topK = 5 } = {}) {
  const result = await client.query(INDEX_NAME, queryText, { topK });
  return normalizeResults(result.docs ?? []);
}

/**
 * Add/update place chunks without creating or rebuilding the index. Moss needs
 * an ID, so callers may provide one; otherwise a stable ID is derived from the
 * place ID and the chunk's position in this batch.
 */
export async function addDocs(docs) {
  const mossDocs = docs.map((doc, index) => {
    const metadata = doc.metadata ?? {};
    const id = doc.id ?? metadata.doc_id ?? (metadata.place_id && `${metadata.place_id}:${index}`);
    if (!id) throw new TypeError('Each Moss document needs id, metadata.doc_id, or metadata.place_id.');
    return { id: String(id), text: doc.text, metadata };
  });
  return client.addDocs(INDEX_NAME, mossDocs, { upsert: true });
}

const MOCK_CHUNKS = [
  ['SFMOMA', 'The San Francisco Museum of Modern Art is a seven-floor modern-art museum on Third Street, with the rooftop sculpture garden and the living wall facing Howard Street.', 'sfmoma', 37.785719, -122.40105],
  ['Yerba Buena Gardens', 'Yerba Buena Gardens is a landscaped downtown park with lawns, public art, the Martin Luther King Jr. Memorial, and room for a quiet break between museums.', 'yerba-buena-gardens', 37.784951, -122.402119],
  ['Salesforce Park', 'Salesforce Park is a four-block rooftop park above the Transit Center. Its 0.6-mile loop has gardens, a fountain, and broad views of the surrounding towers.', 'salesforce-park', 37.789803, -122.396423],
  ['The Ferry Building', 'The Ferry Building Marketplace sits on the Embarcadero waterfront. Inside are Bay Area food counters and shops; outside, the promenade looks across the Bay.', 'ferry-building', 37.795491, -122.393708],
  ['Rincon Hill', 'Rincon Hill rises just south of the Bay Bridge approach. The neighborhood mixes historic shoreline traces with high-rise views and quick access to the Embarcadero.', 'rincon-hill', 37.787108, -122.393986],
  ['Contemporary Jewish Museum', 'The Contemporary Jewish Museum is housed in the former power station at Mission and Third, a short walk from SFMOMA and Yerba Buena Gardens.', 'contemporary-jewish-museum', 37.785046, -122.402406],
].map(([name, text, place_id, lat, lng]) => ({
  text,
  score: 0,
  metadata: { place_id, name, lat, lng, city: 'San Francisco', is_fixture: true },
}));

/** Offline fixture search with the same result shape as searchPlaces. */
export function searchPlacesMock(queryText) {
  const terms = String(queryText).toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return MOCK_CHUNKS
    .map((chunk) => ({
      ...chunk,
      metadata: { ...chunk.metadata },
      score: terms.reduce((score, term) => score + (chunk.text.toLowerCase().includes(term) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score);
}
