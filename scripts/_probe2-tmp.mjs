import { MossClient } from '@moss-dev/moss';
const client = new MossClient(process.env.MOSS_PROJECT_ID, process.env.MOSS_PROJECT_KEY, { cachePath: '.moss-cache' });
const NAME = 'sidequest-probe-tmp';
try {
  await client.createIndex(NAME, [{ id: '11111111-1111-4111-8111-111111111111', text: 'a lovely museum of history', metadata: { name: '"Test Museum"' } }]);
  console.log('createIndex OK');
  await client.loadIndex(NAME, { cachePath: '.moss-cache' });
  const res = await client.query(NAME, 'history museum', { topK: 1 });
  console.log('FRESH QUERY OK:', res.docs?.length, JSON.stringify(res.docs?.[0]).slice(0, 200));
} catch (e) { console.error('fresh index test failed:', String(e)); }
try { await client.deleteIndex(NAME); console.log('cleaned up'); } catch (e) { console.error('cleanup failed:', String(e)); }
