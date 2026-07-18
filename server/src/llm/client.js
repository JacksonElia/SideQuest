/**
 * The only module that touches @openrouter/sdk. Everything else works with
 * plain objects, which keeps the SDK surface small and swappable — the same
 * containment rule src/livekit.js follows.
 *
 * Verified against @openrouter/sdk v0.13.43 typings (esm/*.d.ts), NOT the
 * README — the published README shows a flat `chat.send({model, messages})`,
 * but this version nests the payload under `chatRequest`:
 *   - new OpenRouter({apiKey, appTitle, httpReferer, timeoutMs, retryConfig})
 *   - chat.send({chatRequest: {model, messages, ...}}, {timeoutMs, retries})
 *   - non-streaming result: {id, model, choices:[{message:{content}}], usage}
 *   - usage: {promptTokens, completionTokens, totalTokens, cost?}
 * The SDK also reads OPENROUTER_API_KEY itself, but we pass it explicitly so a
 * missing key fails with our message, not a 401 from the wire.
 */

import { OpenRouter } from '@openrouter/sdk';

import { loadLlmConfig } from './config.js';
import { mapWithConcurrency } from './pool.js';

/**
 * Retries live in the SDK rather than in a loop here: it already implements
 * exponential backoff with jitter over the right status codes, and hand-rolling
 * one on top would multiply the attempts (and the spend) rather than replace
 * them.
 */
const RETRY_CONFIG = {
  strategy: 'backoff',
  backoff: {
    initialInterval: 500,
    maxInterval: 8_000,
    exponent: 2,
    // Total wall-clock ceiling across all attempts. Bounded so a batch item
    // gives up rather than retrying past the point the demo cares about.
    maxElapsedTime: 30_000,
  },
  // Connection resets mid-batch are common on flaky venue wifi and are exactly
  // the case worth retrying.
  retryConnectionErrors: true,
};

/** 408/409/429 and the 5xx family — transient by definition. Auth/400s are not retried. */
const RETRY_CODES = ['408', '409', '429', '500', '502', '503', '504'];

// Built once and reused: each client owns a connection pool, so constructing
// one per call would defeat keep-alive across a batch.
let cached = null;

/**
 * Lazily construct the shared client.
 *
 * Lazy on purpose — importing this module must not require an OpenRouter key,
 * so the LiveKit server can boot without one.
 *
 * @param {{env?:NodeJS.ProcessEnv}} [opts]
 */
export function getClient(opts = {}) {
  if (cached && !opts.env) return cached;

  const cfg = loadLlmConfig(opts.env);

  const client = new OpenRouter({
    apiKey: cfg.apiKey,
    appTitle: cfg.appTitle,
    httpReferer: cfg.httpReferer,
    timeoutMs: cfg.timeoutMs,
    retryConfig: RETRY_CONFIG,
  });

  const handle = { client, cfg };

  // A caller-supplied env is a test/one-off; don't let it poison the shared instance.
  if (!opts.env) cached = handle;

  return handle;
}

/** Drop the cached client. For tests and for picking up a rotated key. */
export function resetClient() {
  cached = null;
}

/**
 * Normalize whatever the caller passed into an OpenRouter messages array.
 *
 * Accepts a bare string for the common one-shot case. Kept deliberately general
 * — task-specific prompt shaping belongs in the modules that will specialize
 * this later, not in the transport.
 */
function toMessages(input) {
  if (typeof input === 'string') return [{ role: 'user', content: input }];

  if (Array.isArray(input) && input.length > 0) return input;

  throw new TypeError('messages must be a non-empty string or a non-empty array');
}

/**
 * Run one completion.
 *
 * Fail-soft by contract (AGENTS.md: no external API failure may break the query
 * path). Every network/provider failure — timeouts, 429s, bad model IDs, auth
 * rejections — comes back as `{ok:false, error, status}` rather than throwing,
 * matching the `{ok}` convention in src/location.js so a caller can degrade
 * rather than crash.
 *
 * Two classes of error DO throw, because both are bugs a caller cannot degrade
 * around and both fail identically on every call: a malformed `messages`
 * argument, and a missing/invalid OPENROUTER_API_KEY. Fail fast on setup,
 * fail soft on the wire.
 *
 * @param {string|Array<{role:string,content:any}>} messages
 * @param {{model?:string, system?:string, temperature?:number, maxTokens?:number,
 *          responseFormat?:object, timeoutMs?:number, signal?:AbortSignal,
 *          label?:string, env?:NodeJS.ProcessEnv}} [opts]
 * @returns {Promise<{ok:true, text:string, model:string, id:string, usage:object|null}
 *                 | {ok:false, error:string, status:number|null}>}
 */
export async function complete(messages, opts = {}) {
  const { client, cfg } = getClient(opts.env ? { env: opts.env } : {});

  const body = toMessages(messages);

  // A system prompt is prepended rather than merged, so callers can pass a
  // plain user string and still get steering.
  const finalMessages = opts.system
    ? [{ role: 'system', content: opts.system }, ...body]
    : body;

  const chatRequest = {
    model: opts.model || cfg.model,
    messages: finalMessages,
    stream: false, // this layer is batch/offline; the voice path streams elsewhere
  };

  if (opts.temperature !== undefined) chatRequest.temperature = opts.temperature;
  if (opts.maxTokens !== undefined) chatRequest.maxTokens = opts.maxTokens;
  if (opts.responseFormat !== undefined) chatRequest.responseFormat = opts.responseFormat;

  const started = Date.now();

  try {
    const result = await client.chat.send(
      { chatRequest },
      {
        timeoutMs: opts.timeoutMs ?? cfg.timeoutMs,
        retries: RETRY_CONFIG,
        retryCodes: RETRY_CODES,
        signal: opts.signal,
      },
    );

    const text = result?.choices?.[0]?.message?.content ?? '';
    const usage = result?.usage ?? null;

    logCycle({
      label: opts.label,
      model: result?.model ?? chatRequest.model,
      ms: Date.now() - started,
      usage,
      ok: true,
    });

    return {
      ok: true,
      text: typeof text === 'string' ? text : JSON.stringify(text),
      model: result?.model ?? chatRequest.model,
      id: result?.id ?? null,
      usage,
    };
  } catch (err) {
    // Error message only. SDK errors can carry the request body, which for us
    // may contain scraped content — and never the key, which we must not log.
    const message = err?.message ?? String(err);
    const status = typeof err?.statusCode === 'number' ? err.statusCode : null;

    logCycle({
      label: opts.label,
      model: chatRequest.model,
      ms: Date.now() - started,
      usage: null,
      ok: false,
      error: message,
    });

    return { ok: false, error: message, status };
  }
}

/**
 * Run many completions with bounded concurrency.
 *
 * Results are index-aligned with `inputs` and each carries its own ok/error, so
 * one failed document never sinks the batch.
 *
 * @param {Array<string|Array<object>>} inputs
 * @param {object} [opts] same as complete(), plus {concurrency, env}
 * @returns {Promise<{results:Array<object>, okCount:number, failCount:number, usage:object}>}
 */
export async function completeMany(inputs, opts = {}) {
  const { cfg } = getClient(opts.env ? { env: opts.env } : {});

  const settled = await mapWithConcurrency(
    inputs,
    (input, index) => complete(input, { ...opts, label: opts.label ?? `batch[${index}]` }),
    { concurrency: opts.concurrency ?? cfg.concurrency, signal: opts.signal },
  );

  // mapWithConcurrency wraps in its own {ok}; complete() already fail-softs, so
  // the outer layer only ever trips on a programmer error (bad messages arg).
  // Flatten to one level so callers see a single, uniform shape.
  const results = settled.map((r) =>
    r.ok ? r.value : { ok: false, error: r.error, status: null },
  );

  const totals = { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 };
  for (const r of results) {
    if (!r.ok || !r.usage) continue;
    totals.promptTokens += r.usage.promptTokens ?? 0;
    totals.completionTokens += r.usage.completionTokens ?? 0;
    totals.totalTokens += r.usage.totalTokens ?? 0;
    totals.cost += r.usage.cost ?? 0;
  }

  const okCount = results.filter((r) => r.ok).length;

  console.log(
    `[llm] batch complete: ${okCount}/${results.length} ok, ` +
      `${totals.totalTokens} tokens, $${totals.cost.toFixed(4)}`,
  );

  return { results, okCount, failCount: results.length - okCount, usage: totals };
}

/** One line per call (AGENTS.md). Never includes prompt or completion text. */
function logCycle({ label, model, ms, usage, ok, error }) {
  const tag = label ? `[llm:${label}]` : '[llm]';
  const tokens = usage ? `${usage.totalTokens ?? '?'}tok` : 'no-usage';
  const cost = usage?.cost != null ? ` $${usage.cost.toFixed(4)}` : '';

  if (ok) {
    console.log(`${tag} ok model=${model} ${ms}ms ${tokens}${cost}`);
  } else {
    console.error(`${tag} FAILED model=${model} ${ms}ms: ${error}`);
  }
}
