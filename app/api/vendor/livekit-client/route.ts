/**
 * Serve livekit-client's browser ESM bundle out of node_modules so the static
 * test page at /livekit-test.html can import it without a bundler and without
 * a CDN.
 *
 * Carried over from the standalone server's /vendor/livekit-client.mjs route,
 * but resolved differently. Node's resolver is not usable from inside a bundled
 * route handler: import.meta.resolve() gets rewritten by webpack to a path
 * under .next/, and createRequire() with any computed argument fails to compile
 * at all ("module.createRequire failed parsing argument"), leaving `require`
 * undefined at runtime.
 *
 * So the manifest is read straight off disk instead. The `import` condition is
 * taken from it rather than hardcoded, so a dist rename in a future version is
 * followed. Reading it through the resolver would not work regardless —
 * livekit-client's exports map has no "./package.json" entry, so that throws
 * ERR_PACKAGE_PATH_NOT_EXPORTED.
 *
 * This exists only for the bundler-free test client, which is why anchoring to
 * process.cwd() is good enough. The Next.js app itself imports livekit-client
 * normally.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';

// Without this the parameterless GET is prerendered at build time, so the
// node_modules read happens during `next build` and its result — including a
// 503 from a failed resolve — is frozen into the output for good.
export const dynamic = 'force-dynamic';

interface PackageManifest {
  exports?: { '.'?: { import?: string } };
  module?: string;
}

const PACKAGE_DIR = ['node_modules', 'livekit-client'];

async function resolveEsmBundle(): Promise<string | null> {
  const packageRoot = join(process.cwd(), ...PACKAGE_DIR);

  let manifest: PackageManifest;
  try {
    manifest = JSON.parse(
      await readFile(join(packageRoot, 'package.json'), 'utf-8'),
    ) as PackageManifest;
  } catch {
    return null; // not installed
  }

  const relative = manifest.exports?.['.']?.import ?? manifest.module;
  return relative ? join(packageRoot, relative) : null;
}

export async function GET() {
  const bundlePath = await resolveEsmBundle();
  if (!bundlePath) {
    return Response.json(
      { error: 'livekit-client ESM build not found; run npm install' },
      { status: 503 },
    );
  }

  try {
    const bundle = await readFile(bundlePath);
    return new Response(bundle, {
      headers: {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-store', // local dev: always pick up edits
      },
    });
  } catch {
    return Response.json({ error: 'not found' }, { status: 404 });
  }
}
