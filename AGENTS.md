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

## Git
- One task = one commit, imperative message, milestone-tagged ("M5: add busyness worker fixture swap").
- One feature branch per track (`track-a-voice`, `track-b-data`, `track-c-query`); never commit directly to main. Merges happen at the named checkpoints.
- Use the `gh` CLI for GitHub operations. Never force-push, never rewrite published history, never delete branches you didn't create.
- **[Calibrated for hackathon]** Full PR review ceremony is suspended until after the event, EXCEPT at the two checkpoint merges, where the merging human skims the diff before merging. When responding to any review comment: fix what you agree with, say why when you disagree — never silently comply or silently skip.
message.txt
5 KB
