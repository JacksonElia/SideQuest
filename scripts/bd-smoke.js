import { fetchAndIndexNearby } from '../lib/server/brightdata-fetch.js';

// Optional: pass a location label as the first argument to smoke a specific area.
const indexed = process.argv[2]
  ? await fetchAndIndexNearby(process.argv[2])
  : await fetchAndIndexNearby();
console.log(`[bd-smoke] indexed ${indexed} docs`);
