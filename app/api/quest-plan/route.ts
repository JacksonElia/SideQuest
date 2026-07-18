/**
 * Quest planning is disabled for the demo.
 *
 * This used to call OpenRouter twice (quest-planner + quest-generator) and fan
 * out three Moss queries. The demo is voice-only: the LiveKit guide answers
 * from the hardcoded places database via POST /api/query, and nothing should be
 * able to reach OpenRouter — so this route deliberately imports none of
 * lib/server/quest-planner, quest-generator, or llm/*. The file stays so the
 * path returns a clean 410 instead of a confusing 404.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Quest planning is disabled for this demo.", queries: [], places: [], quests: [], warnings: [] },
    { status: 410 },
  );
}
