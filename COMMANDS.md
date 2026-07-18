# COMMANDS.md

The actual commands for this repo. Use these exact commands; do not invent alternatives.

There is one package: the Next.js app at the repo root. The voice guide runs
as OpenAI Realtime in the browser — there is no separate worker process.

## Setup

```bash
cp .env.example .env.local     # then fill in OpenAI + Moss values
npm install
```

Requires Node >= 22.6 — the scripts and tests are TypeScript and rely on Node's
native type stripping, so there is no build step for them. Verified on v24.13.0.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the app and the API routes on http://localhost:3000 |
| `npm test` | Unit tests: location logic, the Store, the query path, the LLM pool. No network, no credentials needed. |
| `npm run typecheck` | `tsc --noEmit` over the whole repo. |
| `npm run build` | Production build. |
| `npm run smoke` | Headless: mints an OpenAI Realtime ephemeral client secret. Proves `OPENAI_API_KEY` and `OPENAI_REALTIME_MODEL`. |
| `npm run llm:smoke` | Headless: one OpenRouter completion + a 3-item batch. Proves `OPENROUTER_API_KEY`. Costs a few hundred tokens. |
| `npm run moss:smoke` | Headless: writes and queries a throwaway `smoke-test` index. Proves Moss credentials. |
| `npm run fixtures` | Replaces the fixture feed in the places index. |
| `npm run bootstrap` | Fetches Wikipedia extracts for every landmark and reindexes them. |
| `npm run ingest:sf` | Bulk SF ingestion via Bright Data SERP: restaurants, tech, hidden gems, history, attractions → `sidequest-places`. Needs `BRIGHTDATA_API_KEY`. Replaces the previous `brightdata` feed per category; never touches fixtures. |

`npm run smoke` takes optional coordinates, since location is a runtime input:

```bash
npm run smoke -- 48.8584 2.2945
```

## API routes

| Route | What it does |
|---|---|
| `GET /api/healthz` | Reports whether the OpenAI config loads. 503 if a variable is missing. |
| `POST /api/session` | Mints an OpenAI Realtime ephemeral client secret. Body: `{lat, lng, accuracy?}` |
| `POST /api/query` | Nearby-places retrieval. Body: `{lat, lng, utterance, constraints?, place_id?}` |
| `POST /api/tool` | Server-side execution of a model-issued tool call (currently only `findNearbyPlaces`). Body: `{name, call_id, arguments, lat, lng, accuracy?}`. Browser is the caller; Moss stays server-side. |
| `POST /api/context` | Proactive Moss → Realtime retrieval. The browser fires this on every user turn with the just-finished transcript and the traveler's coordinates; the server returns a single voice-friendly prose line. Body: `{lat, lng, utterance}`. |

```bash
curl -X POST http://localhost:3000/api/query \
  -H 'content-type: application/json' \
  -d '{"lat":37.7793,"lng":-122.3931,"utterance":"somewhere quiet to sit outside"}'
```

```bash
curl -X POST http://localhost:3000/api/session \
  -H 'content-type: application/json' \
  -d '{"lat":37.7793,"lng":-122.3931,"accuracy":12}'
```

## The voice guide

The browser opens a WebRTC peer connection straight to OpenAI's Realtime API.
Audio flows over the peer connection; session control and tool calls flow over
an `oai-events` data channel. `POST /api/session` mints the short-lived
`ek_...` token that authenticates the SDP exchange; the main `OPENAI_API_KEY`
never reaches the browser.

The guide is one model with one system prompt (`lib/server/prompt.ts`) and one
tool (`findNearbyPlaces`). The browser installs both via `session.update`
immediately after the data channel opens. When the model emits a tool call,
the browser POSTs the arguments to `/api/tool`; the server runs the lookup
against Moss, returns the result, and the browser feeds it back as a
`function_call_output` conversation item.

On every user turn the browser also fires `POST /api/context` with the
finished transcript. The server hits the same `query()` path the tool uses,
summarizes the result into one short prose line (`lib/server/context-summary.ts`),
and the browser appends it to the conversation as a user-role item with a
"[Updated background context, not a question from the traveler]" prefix.
Net effect: the model has the lay of the land around the traveler before its
NEXT response, so the proactive retrieval feeds context back into the
Realtime session without waiting for the model to call the tool.

Location reaches the guide once at session start (seeded into the session mint)
and can be re-sent on every tool call by the browser. The browser is the
single source of truth for coordinates during a session.

```bash
npm run dev
```

Open the app in a browser, tap to talk. To prove the chain without a browser,
run the smoke test (which mints an ephemeral secret but does not exercise the
WebRTC handshake):

```bash
npm run smoke
```

## Layout

| Concern | Lives in |
|---|---|
| OpenAI ephemeral session mint | `lib/server/openai.ts` |
| Realtime tool schema (function definitions) | `lib/server/realtime-tools.ts` |
| System prompt / persona | `lib/server/prompt.ts` |
| Tool execution (server-side Moss lookup) | `app/api/tool/route.ts` |
| Proactive Moss → Realtime context | `app/api/context/route.ts`, `lib/server/context-summary.ts` |
| Browser WebRTC + data channel | `hooks/useVoiceSession.ts` |

## Notes

- Tests use the glob form (`node --test "test/*.test.ts"`) because passing a
  directory to `node --test` fails to resolve on Windows.
- Modules under `lib/server/` import each other with explicit `.ts` extensions.
  Node's ESM resolver does no extension guessing, and this is what lets the same
  files run unbundled under `node --test` and bundled by Next.js.
- The first `/api/query` on a cold process downloads the Moss index and its
  embedding model (~2s). Later queries on the same process are in-memory.
- `STORE_BACKEND` defaults to `moss`. The Python original defaulted to `fake`,
  which meant an unset variable silently served in-memory results from the real
  query path.