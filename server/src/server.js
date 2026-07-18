/**
 * Local token/dispatch server. Node builtins only — no express, no dotenv.
 *
 * The route handlers are thin wrappers over createSession() so the same logic
 * lifts into a Next.js route handler later without touching the LiveKit code.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

import { loadConfig, describeConfig } from './config.js';
import { createSession } from './livekit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const MAX_BODY_BYTES = 4 * 1024; // a GPS fix is ~100 bytes; anything larger is abuse

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const err = new Error('request body too large');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const err = new Error('body must be valid JSON');
    err.statusCode = 400;
    throw err;
  }
}

/**
 * Resolve livekit-client's browser ESM bundle out of node_modules so the test
 * page can import it without a bundler and without a CDN.
 *
 * import.meta.resolve applies the package's own export map under the `import`
 * condition, so this lands on the ESM build and survives a dist rename. Reading
 * the manifest directly does not work here: livekit-client's exports map has no
 * "./package.json" entry, so require.resolve() throws ERR_PACKAGE_PATH_NOT_EXPORTED.
 */
function resolveLivekitClientBundle() {
  try {
    return fileURLToPath(import.meta.resolve('livekit-client'));
  } catch {
    return null; // not installed yet — /vendor/ 503s, the rest of the server still runs
  }
}

const LIVEKIT_CLIENT_BUNDLE = resolveLivekitClientBundle();

async function serveFile(res, absPath) {
  try {
    const data = await readFile(absPath);
    res.writeHead(200, {
      'content-type': MIME[extname(absPath)] ?? 'application/octet-stream',
      'cache-control': 'no-store', // local dev: always pick up edits
    });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'not found' });
  }
}

async function handle(req, res, cfg) {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const { pathname } = url;

  // The test page is same-origin, so CORS isn't needed for it. It is included
  // for localhost only, so the Next.js dev server can call this during the
  // frontend build-out without a proxy.
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('vary', 'origin');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (pathname === '/healthz') {
    return sendJson(res, 200, { ok: true, agentName: cfg.agentName });
  }

  if (pathname === '/session') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'use POST' });

    const body = await readJsonBody(req);
    const session = await createSession(cfg, {
      fix: { lat: body.lat, lng: body.lng, accuracy: body.accuracy },
      identity: body.identity,
    });

    console.log(
      `[session] room=${session.roomName} identity=${session.identity} ` +
        `agent=${cfg.agentName} dispatched=${session.agentDispatched}`,
    );
    return sendJson(res, 200, session);
  }

  // Vendored livekit-client ESM bundle for the bundler-free test page.
  if (pathname === '/vendor/livekit-client.mjs') {
    if (!LIVEKIT_CLIENT_BUNDLE) {
      return sendJson(res, 503, { error: 'livekit-client not installed; run npm install' });
    }
    return serveFile(res, LIVEKIT_CLIENT_BUNDLE);
  }

  // Static test client. normalize() + prefix check blocks ../ traversal.
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const abs = normalize(join(PUBLIC_DIR, rel));
  if (!abs.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'forbidden' });
  return serveFile(res, abs);
}

const cfg = loadConfig();

const server = createServer((req, res) => {
  handle(req, res, cfg).catch((err) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) console.error('[server]', err);
    // Only our own deliberate 4xx messages are echoed; 5xx stays opaque so an
    // SDK error can never leak a credential into an HTTP response body.
    sendJson(res, status, { error: status >= 500 ? 'internal error' : err.message });
  });
});

server.listen(cfg.port, () => {
  console.log('[server] config', describeConfig(cfg));
  console.log(`[server] test client: http://localhost:${cfg.port}/`);
});
