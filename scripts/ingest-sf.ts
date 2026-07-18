/**
 * One-shot bulk ingestion of San Francisco content via Bright Data's SERP API.
 *
 * Runs a battery of category queries (restaurants, tech, hidden gems, history,
 * attractions), treats every result as untrusted search text, and indexes the
 * survivors into the sidequest-places Moss index. Numbers and conditions stay
 * in metadata per data/SCHEMA.md; the embedded text is prose only.
 */

import { createStore } from '../lib/server/store.ts';
import type { Document } from '../lib/server/store.ts';

const INDEX_NAME = 'sidequest-places';
const REQUEST_URL = 'https://api.brightdata.com/request';
const ZONE = process.env.BRIGHTDATA_SERP_ZONE ?? 'serp_api1';
const QUERY_TIMEOUT_MS = 30_000;

// SERP results carry no coordinates, so every doc anchors to the demo area
// around 625 2nd St; retrieval radius filters still behave sensibly.
const DEFAULT_LAT = 37.7815;
const DEFAULT_LNG = -122.3927;

interface Category {
  kind: string;
  queries: string[];
}

const CATEGORIES: Category[] = [
  {
    kind: 'restaurant',
    queries: [
      'best restaurants in San Francisco',
      'best restaurants SoMa South Beach San Francisco',
      'iconic San Francisco foods and where to eat them',
      'best coffee shops downtown San Francisco',
      'best bars near Oracle Park San Francisco',
    ],
  },
  {
    kind: 'tech',
    queries: [
      'famous tech company headquarters San Francisco',
      'San Francisco tech history sites South of Market',
      'AI startup offices San Francisco SoMa',
      'tech landmarks to visit San Francisco',
    ],
  },
  {
    kind: 'hidden_gem',
    queries: [
      'site:atlasobscura.com San Francisco',
      'hidden gems San Francisco SoMa Embarcadero',
      'secret spots downtown San Francisco',
      'unusual things to see San Francisco',
    ],
  },
  {
    kind: 'history',
    queries: [
      'San Francisco Gold Rush historic sites',
      '1906 earthquake San Francisco landmarks',
      'Barbary Coast San Francisco history',
      'South Park San Francisco history',
      'historic waterfront and ships San Francisco Embarcadero',
    ],
  },
  {
    kind: 'attraction',
    queries: [
      'top attractions San Francisco Embarcadero',
      'public art San Francisco SoMa',
      'best walks and views San Francisco waterfront',
    ],
  },
];

interface OrganicResult {
  title?: unknown;
  description?: unknown;
  snippet?: unknown;
  link?: unknown;
}

function slugify(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'brightdata-result'
  );
}

function fetchedAtNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function fetchQuery(query: string, apiKey: string): Promise<OrganicResult[]> {
  const searchUrl = new URL('https://www.google.com/search');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('gl', 'us');
  searchUrl.searchParams.set('hl', 'en');
  searchUrl.searchParams.set('num', '20');
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
    throw new Error(`Bright Data returned HTTP ${response.status}: ${await response.text()}`);
  }
  const payload = (await response.json()) as { organic?: unknown };
  return Array.isArray(payload.organic) ? (payload.organic as OrganicResult[]) : [];
}

/** Build one schema-complete places doc from an organic SERP result. */
function toDoc(item: OrganicResult, kind: string, fetchedAt: string): Document | null {
  const name = typeof item.title === 'string' ? item.title.trim() : '';
  if (!name) return null;
  const description =
    typeof item.description === 'string'
      ? item.description.trim()
      : typeof item.snippet === 'string'
        ? item.snippet.trim()
        : '';

  return {
    text: [name, description].filter(Boolean).join(' — '),
    metadata: {
      place_id: slugify(name),
      name,
      lat: DEFAULT_LAT,
      lng: DEFAULT_LNG,
      kind,
      indoor: false,
      viewpoint: false,
      photogenic: false,
      wind_exposed: false,
      busyness_pct: 0,
      busyness_at: fetchedAt,
      heat_score: 1,
      open_now: true,
      event_time: null,
      lang: 'en',
      source: 'brightdata',
      fetched_at: fetchedAt,
      is_fixture: false,
    },
  };
}

/** Fetch every category, then replace this feed's docs kind-by-kind. */
async function main(): Promise<number> {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) {
    console.error('[ingest-sf] BRIGHTDATA_API_KEY is not set; add it to .env.local first.');
    return 1;
  }

  const store = createStore();
  let totalIndexed = 0;

  for (const category of CATEGORIES) {
    const settled = await Promise.allSettled(
      category.queries.map((query) => fetchQuery(query, apiKey)),
    );

    const fetchedAt = fetchedAtNow();
    const docs: Document[] = [];
    const seen = new Set<string>();
    let failed = 0;

    for (const [index, result] of settled.entries()) {
      if (result.status === 'rejected') {
        failed += 1;
        console.error(`[ingest-sf] query failed: ${category.queries[index]}`, result.reason);
        continue;
      }
      for (const item of result.value) {
        const doc = toDoc(item, category.kind, fetchedAt);
        if (!doc) continue;
        // The same place surfaces across queries in one category; keep the
        // first description seen rather than near-duplicate chunks.
        const key = String(doc.metadata.place_id);
        if (seen.has(key)) continue;
        seen.add(key);
        docs.push(doc);
      }
    }

    if (docs.length === 0) {
      console.log(`[ingest-sf] ${category.kind}: nothing fetched, existing docs left in place`);
      continue;
    }

    // Replace this feed's previous run only when there is something to replace
    // it with (fail soft: a dead scraper never empties its category). Fixtures
    // are untouched — the filter pins is_fixture to false.
    await store.deleteWhere(INDEX_NAME, {
      source: 'brightdata',
      kind: category.kind,
      is_fixture: false,
    });
    await store.addDocs(INDEX_NAME, docs);
    totalIndexed += docs.length;
    console.log(
      `[ingest-sf] ${category.kind}: indexed ${docs.length} docs` +
        (failed ? ` (${failed}/${category.queries.length} queries failed)` : ''),
    );
  }

  console.log(`[ingest-sf] done: ${totalIndexed} docs indexed into ${INDEX_NAME}`);
  return totalIndexed > 0 ? 0 : 1;
}

process.exitCode = await main();
