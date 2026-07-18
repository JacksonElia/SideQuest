import { fetchAndIndexNearby } from '../lib/server/brightdata-fetch.js';

const indexed = await fetchAndIndexNearby();
console.log(`[bd-smoke] indexed ${indexed} docs`);
