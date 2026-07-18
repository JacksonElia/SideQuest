import { MossClient } from '@moss-dev/moss';
const client = new MossClient(process.env.MOSS_PROJECT_ID, process.env.MOSS_PROJECT_KEY, { cachePath: '.moss-cache' });
try {
  const idx = await client.getIndex('sidequest-places');
  console.log('INDEX:', JSON.stringify(idx).slice(0, 400));
} catch (e) { console.error('getIndex failed:', String(e)); }
try {
  const docs = await client.getDocs('sidequest-places');
  console.log('DOCS:', docs.length);
  console.log('first doc:', JSON.stringify(docs[0]).slice(0, 300));
} catch (e) { console.error('getDocs failed:', String(e)); }
try {
  await client.loadIndex('sidequest-places', { cachePath: '.moss-cache' });
  const res = await client.query('sidequest-places', 'history landmarks', { topK: 2 });
  console.log('QUERY OK:', res.docs?.length);
} catch (e) { console.error('query failed:', String(e)); }
