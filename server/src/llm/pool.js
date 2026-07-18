/**
 * Pure concurrency control. No I/O, no SDK imports — this is the layer under
 * test. Everything here works on plain functions, so the batch behaviour can be
 * verified without spending a single token.
 */

/**
 * Run `worker` over every item with at most `limit` in flight.
 *
 * Results come back in INPUT order regardless of completion order, so callers
 * can zip them against the input array by index. That ordering guarantee is the
 * whole reason this exists rather than a chunked `Promise.all` loop — chunking
 * also stalls the whole batch on the slowest item of each chunk, which is
 * exactly the behaviour we don't want when one scraped page is huge.
 *
 * Never rejects: a worker that throws yields `{ok:false, error}` in that slot
 * and the rest of the batch continues (AGENTS.md fail-soft). A single bad
 * document cannot sink a summarization run.
 *
 * @template T, R
 * @param {T[]} items
 * @param {(item:T, index:number) => Promise<R>} worker
 * @param {{concurrency?:number, signal?:AbortSignal}} [opts]
 * @returns {Promise<Array<{ok:true, value:R}|{ok:false, error:string}>>}
 */
export async function mapWithConcurrency(items, worker, opts = {}) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  if (typeof worker !== 'function') throw new TypeError('worker must be a function');

  const limit = opts.concurrency ?? 4;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError(`concurrency must be a positive integer (got ${limit})`);
  }

  const results = new Array(items.length);

  // Shared cursor: each runner takes the next unclaimed index. This keeps all
  // runners saturated — a runner that finishes a short item immediately picks
  // up more work instead of idling behind a slow sibling.
  let cursor = 0;

  const runner = async () => {
    while (cursor < items.length) {
      const index = cursor++;

      if (opts.signal?.aborted) {
        results[index] = { ok: false, error: 'aborted' };
        continue;
      }

      try {
        results[index] = { ok: true, value: await worker(items[index], index) };
      } catch (err) {
        results[index] = { ok: false, error: err?.message ?? String(err) };
      }
    }
  };

  // Never spawn more runners than there is work for.
  const runners = Array.from({ length: Math.min(limit, items.length) }, runner);
  await Promise.all(runners);

  return results;
}

/**
 * Split settled results into the values that succeeded and the failures, each
 * keeping its original index so a caller can report *which* document failed.
 *
 * @template R
 * @param {Array<{ok:true, value:R}|{ok:false, error:string}>} results
 */
export function partitionResults(results) {
  const succeeded = [];
  const failed = [];

  results.forEach((r, index) => {
    if (r.ok) succeeded.push({ index, value: r.value });
    else failed.push({ index, error: r.error });
  });

  return { succeeded, failed };
}
