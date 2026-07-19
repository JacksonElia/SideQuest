/**
 * summarizeForContext — turn a QueryResult into one short prose line suitable
 * for dropping into the Realtime session as an injected conversation item.
 *
 * The voice guide reaches for live facts via `findNearbyPlaces` when it
 * decides to. The proactive context path is the inverse: every time the user
 * finishes a turn, the browser fires /api/context with the user's utterance,
 * the server runs the same retrieval, and the result is appended here so the
 * model already has the lay of the land before the next user turn lands.
 *
 * Security: per AGENTS.md rule #2, the chunks' `text` is untrusted scraped
 * input. This summary therefore composes only from metadata. The current
 * QueryResult type keeps `text` on each chunk; we deliberately do not read
 * it. If that contract ever loosens, this function must not be the leak.
 *
 * Length budget: the line is read aloud in spirit, so keep it under ~300
 * characters and avoid punctuation that a TTS engine would read.
 */

import type { QueryResult } from "./query.ts";

const MAX_PLACES_NAMED = 5;

interface PlaceLike {
  name?: unknown;
  kind?: unknown;
  indoor?: unknown;
}

/**
 * Build one short, voice-friendly summary of the query result.
 *
 * Returns the empty string when nothing is named (so the caller can skip the
 * conversation item entirely instead of injecting "[context] Nothing
 * relevant.").
 */
export function summarizeForContext(result: QueryResult): string {
  if (!result.chunks.length) return "";

  const named = result.chunks
    .map((chunk) => chunk.metadata as PlaceLike)
    .filter(
      (meta): meta is { name: string; kind?: unknown; indoor?: unknown } =>
        typeof meta?.name === "string" && meta.name.trim().length > 0,
    )
    .slice(0, MAX_PLACES_NAMED);

  if (named.length === 0) return "";

  const phrases = named.map(formatPhrase);

  let body: string;
  if (phrases.length === 1) {
    body = phrases[0];
  } else if (phrases.length === 2) {
    body = `${phrases[0]} and ${phrases[1]}`;
  } else {
    body = `${phrases.slice(0, -1).join(", ")}, and ${phrases.at(-1)}`;
  }

  return `[Updated background context, not a question from the traveler.] Near you now: ${body}. Use these to make your reply specific when relevant.`;
}

function formatPhrase(place: { name: string; kind?: unknown; indoor?: unknown }): string {
  const kind =
    typeof place.kind === "string" && place.kind.trim().length > 0
      ? place.kind.toLowerCase()
      : null;

  let phrase: string;
  if (kind) {
    phrase = `${place.name}, a ${kind}`;
  } else {
    phrase = place.name;
  }

  if (place.indoor === true) {
    phrase += " (indoor)";
  } else if (place.indoor === false) {
    phrase += " (outdoor)";
  }

  return phrase;
}
