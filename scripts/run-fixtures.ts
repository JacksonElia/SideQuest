/** Run the local SideQuest fixture worker. */

import { createStore } from '../lib/server/store.ts';
import { loadFixtures } from './fixtures.ts';

const counts = await loadFixtures(createStore());

console.log(
  'fixture cycle: ' +
    `landmarks=${counts.landmarks} events=${counts.events} captions=${counts.captions}`,
);
