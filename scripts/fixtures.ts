/**
 * Populate the development index with repeatable SideQuest fixture content.
 *
 * Ported from workers/fixtures.py.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type { Document, Store } from '../lib/server/store.ts';

export const INDEX_NAME = 'sidequest-places';
export const FIXTURE_FILTER = { source: 'fixture', is_fixture: true };

const LANDMARKS_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'landmarks.json');

/**
 * The fixture date is the July hackathon date, when San Francisco observes PDT.
 * A fixed offset avoids requiring the uninstalled Windows time-zone database.
 */
const SAN_FRANCISCO_UTC_OFFSET_HOURS = -7;

const EVENTS: ReadonlyArray<readonly [string, number, string]> = [
  ['Waterfront sunset walk', 18, 'A guided waterfront walk begins near {name}.'],
  ['Neighborhood trivia night', 19, 'A casual neighborhood trivia night is happening at {name}.'],
  ['Bay-view photo meetup', 19, 'A photo meetup gathers at {name} for bay views.'],
  ['Local makers pop-up', 20, 'A small local makers pop-up is on tonight at {name}.'],
  ['Evening art conversation', 21, 'An informal art conversation is scheduled at {name}.'],
] as const;

const CAPTIONS = [
  'Golden-hour colors made this stop worth the walk.',
  'A favorite little city view from today.',
  'Found a calm moment between the downtown rush.',
  'Waterfront light and a breezy afternoon.',
  'Saving this perspective for the next visit.',
  'A quick detour with a surprisingly great backdrop.',
  'City textures, open sky, and a good long walk.',
  'One of those corners that photographs itself.',
  'A pause here made the whole route better.',
  'The view was even better in person.',
  'An easy place to linger with a camera.',
  "Tonight's walk came with a postcard-worthy scene.",
] as const;

export interface Landmark {
  place_id: string;
  name: string;
  lat: number;
  lng: number;
  photogenic: boolean;
  [key: string]: unknown;
}

export interface FixtureCounts {
  landmarks: number;
  events: number;
  captions: number;
}

/** Replace the complete fixture feed and return counts written to `store`. */
export async function loadFixtures(store: Store, now?: Date): Promise<FixtureCounts> {
  const fetchedAt = asUtc(now ?? new Date());
  const landmarks = await loadLandmarks();

  const busynessByPlace = new Map<string, number>(
    landmarks.map((landmark) => [landmark.place_id, randomInt(20, 90)]),
  );

  // FakeStore has no upsert behavior. Replacing this worker's complete fixture
  // feed before adding records keeps both supported Store backends idempotent.
  await store.deleteWhere(INDEX_NAME, FIXTURE_FILTER);

  const landmarkDocs = landmarks.map((landmark) =>
    landmarkDoc(landmark, fetchedAt, busynessByPlace.get(landmark.place_id)!),
  );
  await store.addDocs(INDEX_NAME, landmarkDocs);

  for (const [placeId, busynessPct] of busynessByPlace) {
    await store.updateMetadata(INDEX_NAME, placeId, {
      busyness_pct: busynessPct,
      busyness_at: fetchedAt,
    });
  }

  const photogenic = landmarks.filter((landmark) => landmark.photogenic);
  const eventDocs = buildEventDocs(photogenic, fetchedAt, busynessByPlace);
  const captionDocs = buildCaptionDocs(photogenic, fetchedAt, busynessByPlace);
  await store.addDocs(INDEX_NAME, [...eventDocs, ...captionDocs]);

  return {
    landmarks: landmarkDocs.length,
    events: eventDocs.length,
    captions: captionDocs.length,
  };
}

async function loadLandmarks(): Promise<Landmark[]> {
  return JSON.parse(await readFile(LANDMARKS_PATH, 'utf-8')) as Landmark[];
}

/** Inclusive on both bounds, matching Python's random.randint. */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function landmarkDoc(landmark: Landmark, fetchedAt: string, busynessPct: number): Document {
  return {
    text: `${landmark.name} is a SideQuest stop in San Francisco.`,
    metadata: buildMetadata(landmark, fetchedAt, busynessPct),
  };
}

function buildEventDocs(
  photogenic: Landmark[],
  fetchedAt: string,
  busynessByPlace: Map<string, number>,
): Document[] {
  const docs: Document[] = [];

  EVENTS.forEach(([title, hour, description], eventNumber) => {
    const landmark = photogenic[eventNumber];
    if (!landmark) return;

    const metadata = buildMetadata(landmark, fetchedAt, busynessByPlace.get(landmark.place_id)!);
    metadata.kind = 'event';
    metadata.event_time = eventTimeUtc(fetchedAt, hour);
    metadata.heat_score = 6;

    docs.push({
      text: `Event: ${title}. ${description.replace('{name}', landmark.name)}`,
      metadata,
    });
  });

  return docs;
}

function buildCaptionDocs(
  photogenic: Landmark[],
  fetchedAt: string,
  busynessByPlace: Map<string, number>,
): Document[] {
  if (!photogenic.length) return [];

  return CAPTIONS.map((caption, captionNumber) => {
    const landmark = photogenic[captionNumber % photogenic.length];
    const metadata = buildMetadata(landmark, fetchedAt, busynessByPlace.get(landmark.place_id)!);
    metadata.kind = 'caption';
    metadata.heat_score = (captionNumber % 10) + 1;

    return {
      text: `Instagram-style caption about ${landmark.name}: ${caption}`,
      metadata,
    };
  });
}

/**
 * The local calendar date in San Francisco at `fetchedAt`, combined with `hour`
 * local time, expressed back in UTC.
 */
function eventTimeUtc(fetchedAt: string, hour: number): string {
  const offsetMs = SAN_FRANCISCO_UTC_OFFSET_HOURS * 60 * 60 * 1000;

  // Shifting into local time lets the UTC getters read off local calendar
  // fields, which is how the tonight-in-SF date is derived without tzdata.
  const local = new Date(new Date(fetchedAt).getTime() + offsetMs);
  const localMidnightUtc = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );

  return asUtc(new Date(localMidnightUtc + hour * 60 * 60 * 1000 - offsetMs));
}

function buildMetadata(
  landmark: Landmark,
  fetchedAt: string,
  busynessPct: number,
): Record<string, unknown> {
  return {
    ...landmark,
    busyness_pct: busynessPct,
    busyness_at: fetchedAt,
    heat_score: 1,
    open_now: true,
    event_time: null,
    lang: 'en',
    source: 'fixture',
    fetched_at: fetchedAt,
    is_fixture: true,
  };
}

function asUtc(value: Date): string {
  return value.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
