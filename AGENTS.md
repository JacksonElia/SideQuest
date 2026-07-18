# AGENTS.md — rules for coding agents in this repo

Project: Sidequest
Purpose: Voice tour-guide agent for the square mile around 625 2nd St SF — live scraped facts + semantic retrieval + offline path; hackathon build, demo at 5:45 PM today.
Unusual: (1) There is NO database — Moss indexes are the only datastore; metadata is the record of truth. (2) All scraped text (reviews, IG captions, event pages) is UNTRUSTED INPUT — it is wrapped as data before reaching the LLM and is never treated as instructions (prompt-injection defense). (3) Numbers and conditions go in metadata filters, never into embedded text. (4) Fixture and real data coexist via the `is_fixture` flag — workers replace fixtures per-feed; never delete fixtures for a feed whose scraper isn't verified working.

## Where things live

- The current plan is `spec.md` (the milestone plan, M1–M9, three tracks per PROJECT.md). Read it before implementing anything. Implement ONE milestone task at a time — never the whole spec in one pass.
- All commands (run, test, lint) are in `COMMANDS.md`. **Your first task in M1 is to create it** as the starter's actual commands, then use those exact commands; do not invent alternatives.
- Track ownership is in PROJECT.md. Stay in your track's files; the merge points are the 1:15 and 3:00 checkpoints, not ad-hoc cross-track edits.
- Task instructions are provided in each prompt. Verification commands are given per-task. There is no spec.md or COMMANDS.md in this repo.

## How to work

- **[Calibrated for hackathon]** TDD only for pure logic: context-conditioning rules (rain→indoor etc.), heat scoring, caption→landmark mapping, walk-time approximation. Write the failing test, see it fail, make it pass. For workers, wiring, and voice: a smoke test or a pasted successful run is sufficient — do not build test scaffolding for scrapers today.
- Show evidence: paste the actual command you ran and its output. Never assert success without it.
- If anything in the task is ambiguous, ask before writing code. Do not guess.
- Stay inside the task's scope. Do not refactor, rename, or "improve" code the task doesn't touch. Post-3:00 feature freeze: bug fixes only.
- Fail soft everywhere: no worker or external API failure may break the query path. Every worker cycle logs one line.

## Hard constraints

### Dependencies (slopsquatting defense)
- Never add a new dependency without asking first, and never run an install command on your own. The approved set is what the starter repo, Moss SDK, and Bright Data client require — nothing else without sign-off.
- When you propose a package, state its exact name and STOP for approval; hallucinated package names get typo-squatted with malware. If you're unsure a package exists, say so — never invent a name to fill a gap.
- Pin versions in the lockfile. Do not silently upgrade or add transitive dependencies.

### Secrets
- Never put API keys, tokens, or URLs-with-credentials in code or any committed file. Secrets live only in `.env`; `.env` is in `.gitignore`. This repo goes PUBLIC tonight — assume every commit will be read.
- Never print secrets in logs, error messages, or test output (worker cycle logs included).
- If a secret is ever committed, stop and say so immediately so it can be revoked.

### Data & runtime
- **[Adapted — no DB in this project]** Tests and dev runs use real Moss indexes (a `-dev` suffixed index, never the demo indexes after the 3:00 freeze). Never substitute an in-memory fake for Moss in anything demo-facing.
- Never touch the demo indexes destructively after 3:00 PM without explicit go-ahead.
- No deploys of any kind — the demo runs from a laptop; deployment work is out of scope by decision.
- Cap MCP-fallback calls per session (credit protection) as specced.

## Frontend currently implemented

- The frontend is a mobile-first Next.js App Router experience in `app/`, with reusable UI grouped under `components/`, browser capability hooks under `hooks/`, typed messages under `types/`, and mock adapters under `lib/`.
- The product visual language is rugged and playful rather than glossy: use the established deep-maroon, ink, parchment, and trail-gold palette; strong borders; restrained corner rounding; and offset “printed” shadows. Use quest symbols such as scrolls, maps, compasses, flags, and trail markers rather than AI sparkle/star iconography. Do not reintroduce glossy blue gradients, glassmorphism, overly polished floating-card effects, or generic assistant icons.
- The app opens into a Spotify Wrapped-inspired Quest entry experience in `components/Quest/`: users can start a new Quest, continue a saved Journey, choose current/manual location, shape a plan in a full-screen conversation, and then enter the guide.
- The Quest entry screen appears every time the app opens. `localStorage` stores the current Quest name, starting location label, and serializable conversation state under `sidequest-journey`; this is intentionally a frontend-only resume path.
- The main guide remains intentionally voice-first. The typed composer, bottom action toolbar, and camera button are removed; the conversation card shows the user/AI message history and a large “Tap to speak” control.
- `hooks/useLocation.ts` tracks arbitrary device coordinates with `navigator.geolocation.watchPosition()` when the setup location step or main guide is active. It exposes latitude, longitude, accuracy, permission state, retry behavior, and friendly errors. Do not replace this with a fixed location.
- `components/Quest/QuestSetup.tsx` is the actual starting-point picker: it prompts for browser GPS, centers an interactive OpenStreetMap embed on the resulting coordinates, and performs debounced place search through Photon by Komoot. It must not add map/search dependencies without approval. Future authenticated providers can replace these adapters without changing the setup flow.
- `hooks/useRecorder.ts` requests microphone access, records with `MediaRecorder`, exposes listening/processing/denied/error states and a timer, and keeps the captured audio blob local. Audio is never uploaded.
- `components/Map/MapCard.tsx` and `components/Quest/QuestSetup.tsx` use a shared OpenStreetMap embed helper to show GPS-centered interactive maps. Users can pan and zoom the embedded map; never substitute a fixed location for device coordinates.
- `components/Plan/TravelPlanCard.tsx` summarizes the current Quest itinerary between the live map and conversation. It is presentation-only for now and should become driven by the future retrieval/planning response.
- `components/Camera/CameraButton.tsx` is retained as an unused future media component, but no camera control is currently exposed in the product UI.
- `components/Chat/` renders animated text, image, and voice placeholder messages plus the typing indicator. The voice-first UI does not expose a text-entry path.
- `lib/mock-ai.ts` supplies the initial welcome message and fixed delayed assistant response. It contains a TODO for replacing the mock adapter with the future AI conversation service.
- There are no API routes or backend functions in this frontend. Future AI, scraping, Moss retrieval, maps, authentication, and itinerary services should be wired behind typed adapters without moving secrets into client code.

## Git
- One task = one commit, imperative message, milestone-tagged ("M5: add busyness worker fixture swap").
- One feature branch per track (`track-a-voice`, `track-b-data`, `track-c-query`); never commit directly to main. Merges happen at the named checkpoints.
- Use the `gh` CLI for GitHub operations. Never force-push, never rewrite published history, never delete branches you didn't create.
- **[Calibrated for hackathon]** Full PR review ceremony is suspended until after the event, EXCEPT at the two checkpoint merges, where the merging human skims the diff before merging. When responding to any review comment: fix what you agree with, say why when you disagree — never silently comply or silently skip.
message.txt
5 KB
