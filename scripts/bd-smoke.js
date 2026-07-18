import { fetchAndIndexNearby } from '../src/brightdata-fetch.js';

const indexed = await fetchAndIndexNearby();
console.log(`[bd-smoke] indexed ${indexed} docs`);
