/**
 * Load Wikipedia summaries for landmarks into the SideQuest places index.
 *
 * Ported from workers/bootstrap.py. httpx became fetch; the retry/timeout
 * behavior is reproduced with AbortSignal.timeout since fetch has no built-in
 * equivalent.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createStore } from '../lib/server/store.ts';
import type { Document } from '../lib/server/store.ts';

const INDEX_NAME = 'sidequest-places';
const CHUNK_SIZE_TOKENS = 300;
const REQUEST_TIMEOUT_MS = 15_000;

const USER_AGENT = 'SideQuest/1.0 (hackathon project; contact: dongm5858@gmail.com)';

const LANDMARKS_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'landmarks.json');

interface Landmark {
  place_id: string;
  name: string;
  lat: number;
  lng: number;
  kind: string;
  indoor: boolean;
  viewpoint: boolean;
  photogenic: boolean;
  wind_exposed: boolean;
}

function wikipediaUrl(title: string): string {
  return (
    'https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1' +
    `&format=json&redirects=1&titles=${encodeURIComponent(title)}`
  );
}

/** Split text into word-based chunks of approximately `chunkSize` tokens. */
function chunkText(text: string, chunkSize: number = CHUNK_SIZE_TOKENS): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let start = 0; start < words.length; start += chunkSize) {
    chunks.push(words.slice(start, start + chunkSize).join(' '));
  }
  return chunks;
}

function fetchedAtNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Build the complete SideQuest metadata record for a Wikipedia chunk. */
function buildMetadata(place: Landmark, fetchedAt: string): Record<string, unknown> {
  return {
    place_id: place.place_id,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    kind: place.kind,
    indoor: place.indoor,
    viewpoint: place.viewpoint,
    photogenic: place.photogenic,
    wind_exposed: place.wind_exposed,
    busyness_pct: 0,
    busyness_at: fetchedAt,
    heat_score: 1,
    open_now: true,
    event_time: null,
    lang: 'en',
    source: 'wikipedia',
    fetched_at: fetchedAt,
    is_fixture: false,
  };
}

/** Fetch, replace, and index one Wikipedia summary per configured landmark. */
async function main(): Promise<number> {
  const places = JSON.parse(await readFile(LANDMARKS_PATH, 'utf-8')) as Landmark[];
  const store = createStore();

  for (const place of places) {
    try {
      const response = await fetch(wikipediaUrl(place.name), {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.status === 404) {
        console.log(`${place.place_id}: skipped (Wikipedia page not found)`);
        continue;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as {
        query?: { pages?: Record<string, { extract?: string }> };
      };
      const pages = Object.values(payload.query?.pages ?? {});
      const extract = (pages[0]?.extract ?? '').trim();

      const chunks = chunkText(extract);
      if (!chunks.length) {
        console.log(`${place.place_id}: skipped (Wikipedia extract was empty)`);
        continue;
      }

      const fetchedAt = fetchedAtNow();
      const docs: Document[] = chunks.map((chunk) => ({
        text: chunk,
        metadata: buildMetadata(place, fetchedAt),
      }));

      await store.deleteWhere(INDEX_NAME, {
        place_id: place.place_id,
        source: 'wikipedia',
        is_fixture: false,
      });
      await store.addDocs(INDEX_NAME, docs);
      console.log(`${place.place_id}: indexed ${docs.length} Wikipedia chunk(s)`);
    } catch (error) {
      // Fail soft per landmark (AGENTS.md): one bad page must not abort the run.
      const name = error instanceof Error ? error.name : 'Error';
      console.error(`${place.place_id ?? 'unknown'}: skipped (${name})`);
    }
  }

  return 0;
}

process.exitCode = await main();
