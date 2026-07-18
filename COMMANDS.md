# COMMANDS.md

The actual commands for this repo. Use these exact commands; do not invent alternatives.

There are two packages: the Next.js app at the repo root, and the voice agent
worker in `agent/`. Everything is driven from the root — the `agent:*` scripts
delegate. The separate `server/` package and the Python backend were merged into
the Next.js app; see "Layout" below for where each piece landed.

Running the full experience takes **two processes**: `npm run dev` and
`npm run agent:dev`. The web app alone mints tokens and creates rooms, but
nobody joins them to talk.

## Setup

```bash
cp .env.example .env.local     # then fill in LiveKit + Moss values
npm install
npm run agent:install          # installs agent/ deps
```

Requires Node >= 22.6 — the scripts and tests are TypeScript and rely on Node's
native type stripping, so there is no build step for them. Verified on v24.13.0.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the app, the API routes, and the browser test client on http://localhost:3000 |
| `npm test` | Unit tests: location logic, the Store, the query path, the LLM pool. No network, no credentials needed. |
| `npm run typecheck` | `tsc --noEmit` over the whole repo. |
| `npm run build` | Production build. |
| `npm run smoke` | Headless: mints a token and dispatches the agent. Proves LiveKit credentials + agent name. |
| `npm run llm:smoke` | Headless: one OpenRouter completion + a 3-item batch. Proves `OPENROUTER_API_KEY`. Costs a few hundred tokens. |
| `npm run moss:smoke` | Headless: writes and queries a throwaway `smoke-test` index. Proves Moss credentials. |
| `npm run fixtures` | Replaces the fixture feed in the places index. |
| `npm run bootstrap` | Fetches Wikipedia extracts for every landmark and reindexes them. |
| `npm run agent:install` | Installs the agent worker's dependencies. |
| `npm run agent:dev` | Runs the voice agent worker in dev mode. Needs `npm run dev` alongside it for Moss lookups. |
| `npm run agent:start` | Runs the worker in production mode. |
| `npm run agent:test` | Agent unit tests: location decoding and the Moss bridge. No network. |

`npm run smoke` takes optional coordinates, since location is a runtime input:

```bash
npm run smoke -- 48.8584 2.2945
```

## API routes

| Route | What it does |
|---|---|
| `GET /api/healthz` | Reports whether the LiveKit config loads. 503 if a variable is missing. |
| `POST /api/session` | Mints a LiveKit token and dispatches the agent. Body: `{lat, lng, accuracy?, identity?}` |
| `POST /api/query` | Nearby-places retrieval. Body: `{lat, lng, utterance, constraints?, place_id?}` |

```bash
curl -X POST http://localhost:3000/api/query \
  -H 'content-type: application/json' \
  -d '{"lat":37.7793,"lng":-122.3931,"utterance":"somewhere quiet to sit outside"}'
```

## The voice agent

`agent/` is a LiveKit Agents worker. It registers under `LIVEKIT_AGENT_NAME` —
the same name `POST /api/session` already dispatches by — so the web app needs
no knowledge of it.

One agent covers the whole experience via one system prompt (`src/prompt.ts`)
with two modes:

- **Planning mode** asks the four scoping questions, then calls
  `saveTravelProfile`. That tool call *is* the mode switch, and the browser
  advances from the scoping screen when the profile arrives on the
  `sidequest.profile` text stream.
- **Active mode** guides, calling `findNearbyPlaces` — which POSTs to
  `/api/query` at `SIDEQUEST_API_URL`. Retrieval goes over HTTP rather than
  importing `lib/server/query.ts` so the route keeps owning validation and the
  fail-soft contract, and the Moss native addon stays out of the job processes.

Location reaches the agent twice: seeded into the dispatch metadata at job
start, then republished as participant attributes as the traveler walks.

```bash
npm run dev        # terminal one
npm run agent:dev  # terminal two
```

To prove the whole chain without a browser or a microphone, join a real room as
a headless traveler and hold the scoping conversation over text:

```bash
cd agent && node --env-file=../.env.local test/e2e-manual.ts
```

It prints the guide's transcript turn by turn and the `sidequest.profile`
payload when planning completes. It costs inference, so it is deliberately not
part of `npm test` (which globs `test/*.test.ts` only).

If a dashboard-hosted agent shares `LIVEKIT_AGENT_NAME`, it competes with the
local worker for the same jobs — disable it while developing.

## Layout

| Was | Is now |
|---|---|
| `lib/store.py` | `lib/server/store.ts` |
| `agent/query.py` | `lib/server/query.ts` (+ `POST /api/query`) |
| `agent/context` (never existed) | `lib/server/context.ts` — passthrough stub for the context track |
| `workers/bootstrap.py` | `scripts/bootstrap.ts` |
| `workers/fixtures.py`, `run_fixtures.py` | `scripts/fixtures.ts`, `scripts/run-fixtures.ts` |
| `lib/store_smoke.py` | `scripts/moss-smoke.ts` |
| `server/src/server.js` | `app/api/{healthz,session,query}/route.ts` |
| `server/src/{config,livekit,location}.js` | `lib/server/{config,livekit,location}.ts` |
| `server/src/llm/*` | `lib/server/llm/*` |
| `server/public/index.html` | `public/livekit-test.html` |
| `tests/*.py`, `server/test/*` | `test/*.test.ts` |

## Notes

- Tests use the glob form (`node --test "test/*.test.ts"`) because passing a
  directory to `node --test` fails to resolve on Windows.
- Modules under `lib/server/` import each other with explicit `.ts` extensions.
  Node's ESM resolver does no extension guessing, and this is what lets the same
  files run unbundled under `node --test` and bundled by Next.js.
- Open the test client at `http://localhost:3000/livekit-test.html`
  specifically. Browsers block the Geolocation API on non-secure origins, and a
  LAN IP does not count as one.
- The first `/api/query` on a cold process downloads the Moss index and its
  embedding model (~2s). Later queries on the same process are in-memory.
- `STORE_BACKEND` defaults to `moss`. The Python original defaulted to `fake`,
  which meant an unset variable silently served in-memory results from the real
  query path.
