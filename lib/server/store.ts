/**
 * A small storage boundary around Moss and its in-memory test double.
 *
 * Ported from the original lib/store.py. Two things changed in the move:
 *
 *   1. The interface is async. The Python version wrapped every SDK coroutine
 *      in asyncio.run() and threw if called from inside a running event loop —
 *      a real constraint that made it unusable from an async caller. The JS SDK
 *      is async-native, so that whole bridge is gone and route handlers can
 *      simply await.
 *   2. Mutations no longer poll by hand. The JS SDK's addDocs/deleteDocs/
 *      createIndex resolve only once the server-side rebuild is complete, which
 *      is what the Python _wait_until_ready() helper was reimplementing.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import type { DocumentInfo, MossClient } from "@moss-dev/moss";

// Do not overwrite credentials that were deliberately supplied by the process.
// Node versions before loadEnvFile() must be launched with Moss credentials set.
//
// The path is assembled at runtime rather than written as
// `new URL('../../.env', import.meta.url)`: webpack statically resolves that
// form and fails the Next build with "Can't resolve '../../.env'" whenever the
// file is absent, which took down every route importing this module. Next loads
// .env.local itself, so in the app this loop finds nothing to do — it exists for
// the plain-node smoke scripts, which run from the repo root.
if (!process.env.MOSS_PROJECT_ID || !process.env.MOSS_PROJECT_KEY) {
  for (const envFile of [".env.local", ".env"]) {
    const envPath = join(process.cwd(), envFile);
    if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
      process.loadEnvFile(envPath);
      break;
    }
  }
}

export interface Document {
  text: string;
  metadata: Record<string, unknown>;
}

export interface SearchResult {
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface SearchParams {
  lat?: number | null;
  lng?: number | null;
  radiusM?: number | null;
  filters?: Record<string, unknown> | null;
  topK?: number;
}

/** Interface shared by the production and in-memory storage backends. */
export interface Store {
  /** Add documents shaped as `{text, metadata}`. */
  addDocs(indexName: string, docs: Document[]): Promise<void>;

  /** Return matching documents as text, score, and metadata. */
  search(indexName: string, queryText: string, params?: SearchParams): Promise<SearchResult[]>;

  /** Apply metadata updates to every document for `placeId`. */
  updateMetadata(
    indexName: string,
    placeId: string,
    updates: Record<string, unknown>,
  ): Promise<void>;

  /** Delete every document whose metadata exactly matches `filters`. */
  deleteWhere(indexName: string, filters: Record<string, unknown>): Promise<void>;
}

const TOKEN_PATTERN = /\b\w+\b/g;

/**
 * Build the configured backend.
 *
 * Hackathon hardcoding: defaults to `fake` so the demo runs entirely from the
 * hardcoded places database (lib/server/query.ts seeds the fake store from
 * data/landmarks.json) with no Moss credentials or network dependency. Set
 * STORE_BACKEND=moss to opt back into the real backend.
 */
export function createStore(backend?: string): Store {
  const selected = (backend ?? process.env.STORE_BACKEND ?? "fake").toLowerCase();
  if (selected === "fake") return new FakeStore();
  if (selected === "moss") return new MossStore();
  throw new Error(`Unsupported STORE_BACKEND: ${selected}`);
}

/** In-memory Store used for deterministic unit tests and local plumbing. */
export class FakeStore implements Store {
  #indexes = new Map<string, Document[]>();

  async addDocs(indexName: string, docs: Document[]): Promise<void> {
    const index = this.#indexes.get(indexName) ?? [];
    index.push(...docs.map(deepCopy));
    this.#indexes.set(indexName, index);
  }

  async search(
    indexName: string,
    queryText: string,
    params: SearchParams = {},
  ): Promise<SearchResult[]> {
    const { lat = null, lng = null, radiusM = null, filters = null, topK = 5 } = params;
    const queryTerms = tokens(queryText);
    const matches: SearchResult[] = [];

    for (const doc of this.#indexes.get(indexName) ?? []) {
      const { metadata } = doc;
      if (!matchesFilters(metadata, filters)) continue;
      if (!withinRadius(metadata, lat, lng, radiusM)) continue;

      const docTerms = tokens(doc.text);
      let score = 0;
      for (const term of queryTerms) if (docTerms.has(term)) score += 1;

      matches.push({ text: doc.text, score, metadata: deepCopy(doc).metadata });
    }

    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, topK);
  }

  async updateMetadata(
    indexName: string,
    placeId: string,
    updates: Record<string, unknown>,
  ): Promise<void> {
    for (const doc of this.#indexes.get(indexName) ?? []) {
      if (doc.metadata.place_id === placeId) {
        Object.assign(doc.metadata, structuredClone(updates));
      }
    }
  }

  async deleteWhere(indexName: string, filters: Record<string, unknown>): Promise<void> {
    const kept = (this.#indexes.get(indexName) ?? []).filter(
      (doc) => !matchesFilters(doc.metadata, filters),
    );
    this.#indexes.set(indexName, kept);
  }
}

/** Store backed by the real Moss SDK. */
export class MossStore implements Store {
  #clientPromise: Promise<MossClient> | null = null;
  #loadedIndexes = new Map<string, Promise<boolean>>();
  #projectId: string;
  #projectKey: string;

  constructor() {
    const projectId = process.env.MOSS_PROJECT_ID;
    const projectKey = process.env.MOSS_PROJECT_KEY;
    if (!projectId || !projectKey) {
      throw new Error("MOSS_PROJECT_ID and MOSS_PROJECT_KEY must be set before loading Moss.");
    }

    this.#projectId = projectId;
    this.#projectKey = projectKey;
  }

  /**
   * Load an existing index once so later queries stay on the hot path.
   *
   * The in-flight promise is cached, not just the completed name: concurrent
   * queries on a cold instance would otherwise both clear a has()-check and
   * both drive the native addon's loader for the same index.
   */
  loadIndex(indexName: string): Promise<boolean> {
    const inFlight = this.#loadedIndexes.get(indexName);
    if (inFlight) return inFlight;

    const pending = (async () => {
      if (!(await this.#ensureIndex(indexName))) return false;

      // cachePath lets a warm instance reuse the downloaded index instead of
      // re-fetching it. On Vercel only /tmp is writable, and it survives for the
      // life of the instance — so this pays off across requests but not across
      // cold starts. See mossCachePath().
      await (await this.#client()).loadIndex(indexName, { cachePath: mossCachePath() });
      return true;
    })();

    // Same reasoning as getStore() in query.ts: cache the success, never the
    // failure. A missing index is also uncached — bootstrap may create it after
    // this instance is already warm.
    this.#loadedIndexes.set(indexName, pending);
    const forget = () => {
      if (this.#loadedIndexes.get(indexName) === pending) {
        this.#loadedIndexes.delete(indexName);
      }
    };
    pending.then((loaded) => {
      if (!loaded) forget();
    }, forget);

    return pending;
  }

  async addDocs(indexName: string, docs: Document[]): Promise<void> {
    const mossDocs = docs.map((doc) => toMossDoc(indexName, doc));
    const existed = await this.#ensureIndex(indexName, mossDocs);
    if (mossDocs.length && existed) {
      await (await this.#client()).addDocs(indexName, mossDocs, { upsert: true });
    }
  }

  async search(
    indexName: string,
    queryText: string,
    params: SearchParams = {},
  ): Promise<SearchResult[]> {
    const { lat = null, lng = null, radiusM = null, filters = null, topK = 5 } = params;
    if (!(await this.loadIndex(indexName))) return [];

    // Metadata and radius filtering both happen client-side below, so the
    // candidate pool has to be widened first or the filters would be applied to
    // an already-truncated top-K and silently starve the result set.
    const candidateCount = filters || radiusM !== null ? Math.max(topK, 100) : topK;
    const response = await (
      await this.#client()
    ).query(indexName, queryText, {
      topK: candidateCount,
    });

    const matches: SearchResult[] = [];
    for (const doc of response.docs) {
      const metadata = decodeMetadata(doc.metadata ?? {});
      if (!matchesFilters(metadata, filters)) continue;
      if (!withinRadius(metadata, lat, lng, radiusM)) continue;
      matches.push({ text: doc.text, score: Number(doc.score), metadata });
    }

    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, topK);
  }

  async updateMetadata(
    indexName: string,
    placeId: string,
    updates: Record<string, unknown>,
  ): Promise<void> {
    if (!(await this.#ensureIndex(indexName))) return;

    const docs = await this.#matchingMossDocs(indexName, { place_id: placeId });
    const changed: DocumentInfo[] = docs.map((doc) => ({
      id: doc.id,
      text: doc.text,
      metadata: encodeMetadata({ ...decodeMetadata(doc.metadata ?? {}), ...updates }),
      payload: doc.payload,
    }));

    if (changed.length) {
      await (await this.#client()).addDocs(indexName, changed, { upsert: true });
    }
  }

  async deleteWhere(indexName: string, filters: Record<string, unknown>): Promise<void> {
    if (!(await this.#ensureIndex(indexName))) return;

    const docIds = (await this.#matchingMossDocs(indexName, filters)).map((doc) => doc.id);
    if (docIds.length) {
      await (await this.#client()).deleteDocs(indexName, docIds);
    }
  }

  /** Return whether the index exists, creating it from supplied documents if missing. */
  async #ensureIndex(indexName: string, docs?: DocumentInfo[]): Promise<boolean> {
    try {
      await (await this.#client()).getIndex(indexName);
      return true;
    } catch (error) {
      if (!/INDEX_NOT_FOUND/i.test(String(error))) throw error;
      if (!docs?.length) return false;
      // createIndex resolves only once the build is Ready, so the Python
      // _wait_until_ready() poll loop is no longer needed here.
      await (await this.#client()).createIndex(indexName, docs);
      return false;
    }
  }

  async #matchingMossDocs(
    indexName: string,
    filters: Record<string, unknown>,
  ): Promise<DocumentInfo[]> {
    const docs = await (await this.#client()).getDocs(indexName);
    return docs.filter((doc) => matchesFilters(decodeMetadata(doc.metadata ?? {}), filters));
  }

  /**
   * The native Moss binding is unsupported by Vercel's current Linux runtime.
   * Keep its import behind real Moss operations so fake-backend deployments can
   * build and serve without loading the addon.
   */
  async #client(): Promise<MossClient> {
    if (this.#clientPromise) return this.#clientPromise;

    const pending = import("@moss-dev/moss").then(
      ({ MossClient }) =>
        new MossClient(this.#projectId, this.#projectKey, { cachePath: mossCachePath() }),
    );
    this.#clientPromise = pending;
    pending.catch(() => {
      if (this.#clientPromise === pending) this.#clientPromise = null;
    });

    return pending;
  }
}

/**
 * Where Moss caches downloaded indexes and its ONNX embedding model.
 *
 * Serverless filesystems are read-only apart from /tmp, so the default
 * (~/.cache/moss-models) would fail on Vercel. MOSS_MODEL_CACHE_DIR is honored
 * first for anyone who wants to point it elsewhere.
 */
function mossCachePath(): string {
  if (process.env.MOSS_MODEL_CACHE_DIR) return process.env.MOSS_MODEL_CACHE_DIR;
  return process.env.VERCEL ? "/tmp/moss-cache" : ".moss-cache";
}

/**
 * Derive a stable document id from the index, place, and text.
 *
 * The Python version used uuid5(NAMESPACE_URL, ...) so re-running a worker
 * upserts over the previous document rather than duplicating it. That property
 * is what matters, not the exact algorithm — but the ids must stay stable
 * across runs, so this is a deterministic hash of the same input string.
 */
function toMossDoc(indexName: string, doc: Document): DocumentInfo {
  const metadata = { ...doc.metadata };
  const placeId = metadata.place_id ?? "";
  return {
    id: stableId(`${indexName}:${String(placeId)}:${doc.text}`),
    text: doc.text,
    metadata: encodeMetadata(metadata),
  };
}

/** FNV-1a over the UTF-8 bytes, rendered as a uuid-shaped string. */
function stableId(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const hex: string[] = [];

  // Four independently-seeded passes give 128 bits, which keeps collisions
  // negligible across the tens of thousands of chunks a full index holds.
  for (let seed = 0; seed < 4; seed += 1) {
    let hash = 0x811c9dc5 ^ seed;
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hex.push(hash.toString(16).padStart(8, "0"));
  }

  const joined = hex.join("");
  return [
    joined.slice(0, 8),
    joined.slice(8, 12),
    joined.slice(12, 16),
    joined.slice(16, 20),
    joined.slice(20, 32),
  ].join("-");
}

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().match(TOKEN_PATTERN) ?? []);
}

function matchesFilters(
  metadata: Record<string, unknown>,
  filters: Record<string, unknown> | null | undefined,
): boolean {
  if (!filters) return true;
  return Object.entries(filters).every(([key, value]) => metadata[key] === value);
}

/**
 * Moss metadata values are strings, so every value is JSON-encoded on the way in
 * and parsed on the way out. This is what keeps `busyness_pct: 20` a number
 * rather than the string "20" after a round-trip (AGENTS.md #3).
 */
function encodeMetadata(metadata: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, JSON.stringify(value)]),
  );
}

function decodeMetadata(metadata: Record<string, string>): Record<string, unknown> {
  const decoded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    try {
      decoded[key] = JSON.parse(value);
    } catch {
      decoded[key] = value;
    }
  }
  return decoded;
}

function withinRadius(
  metadata: Record<string, unknown>,
  lat: number | null | undefined,
  lng: number | null | undefined,
  radiusM: number | null | undefined,
): boolean {
  if (radiusM === null || radiusM === undefined) return true;
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    throw new Error("lat and lng are required when radiusM is set");
  }
  if (!("lat" in metadata) || !("lng" in metadata)) return false;
  return haversineM(lat, lng, Number(metadata.lat), Number(metadata.lng)) <= radiusM;
}

function haversineM(latA: number, lngA: number, latB: number, lngB: number): number {
  const earthRadiusM = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const latDelta = toRad(latB - latA);
  const lngDelta = toRad(lngB - lngA);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(lngDelta / 2) ** 2;

  return 2 * earthRadiusM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function deepCopy(doc: Document): Document {
  return structuredClone(doc);
}
