# spec-track-data.md — Michael's lane: data in, index, query out

## Why
The voice and frontend lanes are consumers. Everything they demo flows through this lane's two products: the Moss indexes (filled by ingestion) and `query()` (the one retrieval call). If this lane works against fixtures by 1:15, the team cannot fail hard; every scraper that lands after that only makes the demo better.

## What (concrete behavior)
- Two functions, signatures never changed after their first commit:
  `query(user_lat: float, user_lng: float, utterance: str, constraints: dict | None = None, place_id: str | None = None) -> dict`
  Returns: `{"chunks": [{"text": str, "score": float, "metadata": {...}}], "latency_ms": float, "warnings": [str], "user_facts": [str]}` — max 5 chunks, sorted by score desc.
  `gather(user_id: str, answers: dict) -> dict` — onboarding: called ONCE after the voice agent's deterministic questions (max 3: time available, interests, walking tolerance). Returns `{"summary": str, "constraints": dict}`.
- **Flow (per team decision):** "Explore where I am" → voice asks the 3 questions → `gather()` (fast: memory writes + preference boosts + context fetch + small targeted event fetch — NEVER blocks on a full scrape; the corpus is pre-indexed before doors) → tour mode: every question is `query()`, camera passes `place_id`.
- **Hybrid gather rule:** the square mile is pre-indexed (T2–T4) regardless of onboarding. `gather()` personalizes over the warm cache; it may fire small targeted fetches (today's events for stated interests) but the demo's critical path must never contain a multi-minute scrape behind a loading screen.
- `constraints` keys (all optional): `radius_min` (walking minutes, default 15), `indoor` (bool), `max_busyness` (int 0–100), `lang` ("en"/"es").
- Two Moss indexes: `sidequest-places` (all prose chunks + metadata) and `sidequest-memory` (user facts).
- Chunk metadata (frozen): `place_id, name, lat, lng, kind, indoor, viewpoint, photogenic, wind_exposed, busyness_pct, busyness_at, heat_score, open_now, event_time (nullable), lang, source, fetched_at, is_fixture`.
- Every scraped/fixture doc carries `source` + `fetched_at` (ISO 8601 UTC). Fixture data: `is_fixture: true`; real data replaces fixtures per-feed, never mixed within a feed.
- Fail soft: any worker crash or missing feed leaves `query()` fully functional.

## Constraints (what NOT to do)
- No new dependencies beyond: moss SDK, requests, python-dotenv (agent must ask before anything else — AGENTS.md rules apply).
- No database, no queues, no Docker, no deploy. Workers are `python -m workers.<name>`.
- Do not touch `track-voice` or `track-frontend` files. The only shared surface is `agent/query.py`'s signature and `data/SCHEMA.md`.
- Numbers/conditions → metadata. Never embedded in chunk text.
- Scraped text is untrusted: it is data for retrieval, never instructions.
- Out of scope for this lane: TTS/STT, UI, Vercel, camera, Uber links, MCP fallback (only if every task below is done).

## Tasks — one task = one Codex prompt = one commit. Verify before committing, every time.

**T1 — Stub query (UNBLOCKS THE TEAM — do first)**
Build: `agent/query.py` with the exact signature above, returning 3 hardcoded realistic chunks (South Park, Oracle Park, a fake gallery event) and `latency_ms: 8.0`. `__main__` block: `python -m agent.query "something fun nearby"` prints JSON.
Files: `agent/__init__.py`, `agent/query.py`.
Verify: run the CLI, see 3 chunks. Commit "T1: stub query". **Ping team: stub is live.**

**T2 — Schema doc + landmarks**
Build: `data/SCHEMA.md` (the metadata table above, with types and one example chunk) and `data/landmarks.json` — 30 places near 625 2nd St (SoMa/South Park/Embarcadero/Oracle Park), each `{place_id (slug), name, lat, lng, kind, indoor, viewpoint, photogenic, wind_exposed}`.
Verify: YOU read all 30 names and fix Codex's picks — this is judgment, not code. `python -c "import json; print(len(json.load(open('data/landmarks.json'))))"` → 30. Commit "T2: schema + landmarks".

**T3 — Wikipedia bootstrap**
Build: `workers/bootstrap.py`: per landmark, GET `https://en.wikipedia.org/api/rest_v1/page/summary/{title}` (fallback: skip + log), chunk extract to ~300 tokens, index into `sidequest-places` with full metadata, `is_fixture: false`, `source: "wikipedia"`. Idempotent (re-run = replace, not duplicate). One log line per landmark.
Files: `workers/__init__.py`, `workers/bootstrap.py`.
Verify: run it; log shows ≥25 indexed; Moss dashboard doc count > 0. Commit "T3: wikipedia bootstrap".

**T4 — Fixtures**
Build: `workers/fixtures.py`: per landmark, one busyness metadata update (random 20–90%, `busyness_at` = now); 5 event docs (`kind: "event"`, tonight's `event_time`); 12 IG-style caption docs spread over photogenic places, `heat_score` 1–10. All `is_fixture: true`. Idempotent.
Verify: run; then `python -m agent.query` still stubbed (fine); check Moss doc count grew by ~17. Commit "T4: fixtures".

**T5 — Real query (THE PRODUCT — 1:15 deliverable)**
Build: replace stub internals: Moss search with semantic on utterance + `$near` on (user_lat, user_lng) with radius from `constraints.radius_min` (minutes × 80 meters) + metadata filters (`indoor` if set, `busyness_pct <= max_busyness` if set, `lang` if set, `place_id` if given). Same signature, same return shape, real `latency_ms` measured around the Moss call.
Verify: 5 different CLI questions — "something weird nearby", "quiet spot outside", "what's happening tonight" (should surface a fixture event), "photogenic spot" (should surface captions), "tell me about South Park" (should hit Wikipedia). Answers must differ sensibly. Commit "T5: real query". **Tell voice lane to swap. This is the merge.**

**T6 — Memory (moved up: onboarding depends on it)**
Build: `agent/memory.py`: `remember_fact(user_id, fact)` → doc in `sidequest-memory` with `{user_id, fact, created_at}`; `recall_facts(user_id)` → list via metadata filter. Wire into `query()`: recalled facts returned as `user_facts`; places the user said they've done (name-keyword match) are excluded from retrieval.
Verify: remember "we already did the waterfront"; CLI "what should we do" no longer top-ranks Embarcadero chunks. Commit "T6: memory".

**T7 — gather() onboarding (the team's flow)**
Build: `agent/gather.py`: `gather(user_id, answers)` where answers = `{"time_available_min": int, "interests": [str], "walking": "low"|"medium"|"high"}`. It: (1) writes each answer as a memory fact; (2) derives constraints — time → `radius_min` cap (e.g. 180 min available → radius_min 15; 60 min → 8), "photography" in interests → post-retrieval boost on `photogenic`, walking low → radius_min 6; (3) calls `agent/context.py` fetch (stub the context call until T9 exists — return empty warnings); (4) OPTIONALLY fires one fast targeted fetch (tonight's fixture/indexed events matching interests) — hard timeout 3 s, skip on failure; (5) returns `{"summary": "<one spoken sentence>", "constraints": {...}}`.
Must NOT: trigger any full scrape, block >3 s total, or write anything except memory facts.
Verify: `python -m agent.gather` test call with photographer/3h/high → summary sentence mentions photo spots; constraints show radius_min 15 and photogenic boost. Commit "T7: gather onboarding". **Tell voice lane: onboarding calls gather() once, everything after is query().**

**T8 — Reddit one-shot**
Build: YOU first fill `data/reddit_threads.json` with 12–18 thread URLs (r/AskSF-type: hidden gems, tourist traps, SoMa/Embarcadero tips) — 10 minutes of your judgment. Then `workers/reddit.py`: per URL, fetch via Bright Data API, extract comment text (top-level comments, >80 chars), chunk, index with `source: "reddit"`, map to a landmark by name keyword when possible else `place_id: "area-general"` with venue-center lat/lng.
Verify: run; CLI "what do locals say is a tourist trap" surfaces a reddit chunk. Commit "T8: reddit corpus".

**T9 — Busyness worker (the must-be-real live feed)**
Build: `workers/busyness.py`: loop every 20 min over landmarks; fetch Google Maps popular-times + live busyness (LivePopularTimes routed through Bright Data proxy, or Bright Data fetch of the place page); update each place's chunks' `busyness_pct`/`busyness_at` in place, `is_fixture: false` for that field's provenance; missing live value → keep historical histogram value + log "fallback". One log line per cycle. Ctrl+C safe.
Verify: run one cycle; pick one landmark, confirm its `busyness_at` is from the last few minutes; kill and restart cleanly. Leave it RUNNING. Commit "T9: busyness worker".

**T10 — Context conditioning**
Build: `agent/context.py`: fetch Open-Meteo (temp, rain, wind), sunset time, MLB Giants home-game end estimate; cache 15 min in memory. `apply_context(constraints) -> constraints`: rain→`indoor: true`; wind>20mph→add exclusion of `wind_exposed`; golden hour within 90 min→boost viewpoints (implement as post-retrieval score bump ×1.3); game end within 60 min→attach `warnings: ["ballpark crowd ~4:30"]` to the query result dict.
Verify: fake the weather values in a test call; same utterance returns different chunks/warnings. Also un-stub the context call inside `gather()`. Commit "T10: context conditioning".

**T11 (only if T1–T10 all green) — Instagram heat**
Build: `workers/social.py`: Bright Data IG hashtag scraper for `#soma #southparksf #embarcadero`, last-72h posts; keyword-map captions to landmarks; captions → docs (`source: "instagram"`), counts → `heat_score` update; replace T4's caption fixtures for mapped places. Runs once, then every 4 h. Slow/async is fine.
Verify: one real caption retrievable via CLI "what's trending around here". Commit "T11: instagram heat".

## Definition of done for this lane
T5 swapped in and voice answering from real retrieval; T7 gather() wired into the onboarding flow; T9 running with at least one fixture→real busyness swap visible; every remaining fixture honestly labeled. Anything past that is bonus.

## Task order recap
T0 store wrapper → T1 stub → T2 schema+landmarks → then waves (see below) → T5 real query (1:15 merge) → T7 gather (onboarding merge).

## T0 — Store wrapper (enables all parallelism — Wave 0, serial)
Build: `lib/store.py` with class `Store` exposing EXACTLY: `add_docs(index_name, docs: list[dict])` (doc = `{"text": str, "metadata": dict}`), `search(index_name, query_text, lat=None, lng=None, radius_m=None, filters: dict | None = None, top_k=5) -> list[{"text","score","metadata"}]`, `update_metadata(index_name, place_id, updates: dict)`, `delete_where(index_name, filters)`. Two implementations, same interface: `MossStore` (real SDK, creds from .env) and `FakeStore` (in-memory: keyword-overlap scoring, haversine for radius, plain dict-match filters). `Store.create(backend="fake"|"moss")` factory; env var `STORE_BACKEND` default "fake". Unit tests for FakeStore (TDD — this is pure logic).
Rule: NOTHING in this repo calls the Moss SDK directly except MossStore. All tasks code against Store.
Verify: pytest green on FakeStore; one smoke script adds 3 docs to real Moss and searches them. Commit "T0: store wrapper".

## Parallel execution plan (worktrees + waves)
- Max 3 agents at once — the human verify step is the bottleneck, not code generation.
- `agent/query.py` is a thin orchestrator; parallel tasks build modules (`agent/retrieval.py`, `agent/memory.py`, `agent/context.py`, workers/*); ONLY the human commits wiring changes to query.py, serially.
- One worktree + branch per task: `git worktree add ..\sq-tN -b task/tN`. Agent works only in its worktree. Human verifies in the worktree, merges to `track-data`, removes the worktree.
- All tasks develop and test against `FakeStore` with small inline fixture docs; flipping `STORE_BACKEND=moss` is the integration step, done at merge time by the human. FakeStore proves plumbing, not relevance — T5's answer QUALITY is always re-verified against real Moss with the indexed corpus.
- **Waves:** W0 (serial): T0, T1, T2. W1 (parallel): T3 wikipedia, T4 fixtures, T10 context. W2 (parallel): T5 retrieval, T6 memory, T9 busyness. W3: T7 gather, T8 reddit (human picks threads first), T11 instagram.
- Merge discipline: one task = one branch = one merge by the human after its verify command passes. Never merge two tasks in one commit. If two waves' outputs disagree with SCHEMA.md, SCHEMA.md wins — fix the code.