/**
 * Manual smoke check for the real Moss-backed Store.
 *
 * Ported from lib/store_smoke.py. Writes to its own `smoke-test` index so it
 * never touches the demo index.
 */

import { createStore } from '../lib/server/store.ts';

const INDEX_NAME = 'smoke-test';

if (!process.env.MOSS_PROJECT_ID || !process.env.MOSS_PROJECT_KEY) {
  console.error('Missing Moss credentials: set MOSS_PROJECT_ID and MOSS_PROJECT_KEY in .env.local.');
  process.exit(1);
}

const store = createStore('moss');

await store.addDocs(INDEX_NAME, [
  {
    text: 'The smoke test gallery has a quiet art exhibit.',
    metadata: { place_id: 'smoke-gallery', kind: 'gallery' },
  },
  {
    text: 'The smoke test park has a sunny lawn.',
    metadata: { place_id: 'smoke-park', kind: 'park' },
  },
  {
    text: 'The smoke test cafe serves morning coffee.',
    metadata: { place_id: 'smoke-cafe', kind: 'cafe' },
  },
]);

const results = await store.search(INDEX_NAME, 'quiet art gallery');
console.log(JSON.stringify(results, null, 2));
