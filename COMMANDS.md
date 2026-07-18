# COMMANDS.md

The actual commands for this repo. Use these exact commands; do not invent alternatives.

## Setup

```bash
cp .env.example .env.local     # then fill in the LiveKit values
cd server && npm install
```

Requires Node >= 20.11 (`--env-file` support). Verified on Node v24.13.0.

## Backend (server/)

Run all of these from `server/`.

| Command | What it does |
|---|---|
| `npm test` | Unit tests for pure location logic and the LLM concurrency pool. No network, no credentials needed. |
| `npm run smoke` | Headless: mints a token and dispatches the agent. Proves credentials + agent name. |
| `npm run llm:smoke` | Headless: one OpenRouter completion + a 3-item batch. Proves `OPENROUTER_API_KEY` and the batch path. Costs a few hundred tokens. |
| `npm run dev` | Starts the token server and the browser test client on http://localhost:3001 |

`npm run smoke` takes optional coordinates, since location is a runtime input:

```bash
node --env-file=../.env.local scripts/smoke.js 48.8584 2.2945
```

## Notes

- Tests use the glob form (`node --test "test/*.test.js"`) because passing a
  directory to `node --test` fails to resolve on Windows.
- Open the test client at `http://localhost:3001` specifically. Browsers block
  the Geolocation API on non-secure origins, and a LAN IP does not count as one.
