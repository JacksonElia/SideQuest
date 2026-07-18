/**
 * Context conditioning — the rules that turn ambient conditions into query
 * constraints ("rain expected" → indoor: true, and so on).
 *
 * This is a passthrough stub. The real rules belong to a sibling track and land
 * here later; until then every constraint is used exactly as the caller supplied
 * it and no warnings are raised.
 *
 * The Python original made this optional via a soft `ModuleNotFoundError` catch
 * on `agent.context`. That does not translate cleanly — TypeScript cannot resolve
 * a module that may not exist, and a bundler cannot code-split on one either. A
 * real file with the identity implementation gives the same behavior, keeps the
 * call site honest, and means the context track can fill this in without
 * touching query.ts.
 */

import type { Constraints } from './query.ts';

/**
 * @returns the possibly-adjusted constraints, plus user-facing warnings
 *   explaining any adjustment that was made.
 */
export function applyContext(constraints: Constraints): [Constraints, string[]] {
  return [constraints, []];
}
