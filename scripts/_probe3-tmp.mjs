const base = 'https://service.usemoss.dev';
const id = process.env.MOSS_PROJECT_ID, key = process.env.MOSS_PROJECT_KEY;
const headerSets = [
  { 'x-project-id': id, 'x-project-key': key },
  { Authorization: `Bearer ${key}`, 'x-project-id': id },
  { 'project-id': id, 'project-key': key },
];
for (const headers of headerSets) {
  const res = await fetch(`${base}/index/sidequest-places/docs`, { headers });
  console.log(Object.keys(headers).join(','), '->', res.status);
  if (res.ok) {
    const text = await res.text();
    console.log('BODY length:', text.length);
    try {
      const parsed = JSON.parse(text);
      const docs = Array.isArray(parsed) ? parsed : parsed.docs ?? parsed.documents ?? [];
      console.log('docs:', docs.length);
      // find docs whose metadata values are not strings
      let bad = 0; let sample = null;
      for (const d of docs) {
        const meta = d.metadata ?? {};
        for (const v of Object.values(meta)) {
          if (typeof v !== 'string') { bad++; sample = sample ?? d; break; }
        }
        for (const [k, v] of Object.entries(d)) {
          if (v === null) { bad++; sample = sample ?? d; break; }
        }
      }
      console.log('docs with non-string metadata or null fields:', bad);
      if (sample) console.log('sample bad doc:', JSON.stringify(sample).slice(0, 400));
      else console.log('sample doc:', JSON.stringify(docs[0]).slice(0, 400));
    } catch (e) { console.log('body not JSON:', text.slice(0, 200)); }
    break;
  }
}
