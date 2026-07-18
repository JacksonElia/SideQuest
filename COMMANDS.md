# Commands

Run commands from the repository root.

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

`npm run dev` starts the text-only Next.js experience at `http://localhost:3000`.

| Command              | What it does                                                          |
| -------------------- | --------------------------------------------------------------------- |
| `npm run dev`        | Starts the app and API routes.                                        |
| `npm test`           | Runs unit tests.                                                      |
| `npm run typecheck`  | Type-checks the app.                                                  |
| `npm run build`      | Builds the production app.                                            |
| `npm run llm:smoke`  | Sends an OpenRouter completion. Requires `OPENROUTER_API_KEY`.        |
| `npm run moss:smoke` | Writes and queries a throwaway Moss index. Requires Moss credentials. |
| `npm run fixtures`   | Replaces fixture content in the places index.                         |
| `npm run bootstrap`  | Fetches landmark extracts and reindexes them.                         |
| `npm run ingest:sf`  | Ingests San Francisco places through Bright Data.                     |

## API routes

| Route                    | What it does                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `POST /api/quest-plan`   | Generates three OpenRouter query strings from the typed profile and runs them against Moss. |
| `POST /api/query`        | Retrieves nearby places from Moss.                                                          |
| `POST /api/guide-answer` | Retrieves nearby Moss records and uses OpenRouter to answer the typed guide question.       |

The first Moss request on a cold process can download the index and embedding model. Later requests reuse the loaded index.
