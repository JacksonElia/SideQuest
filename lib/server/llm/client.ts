/**
 * The only module that touches @openrouter/sdk. Everything else works with
 * plain objects, which keeps the SDK surface small and swappable — the same
 * containment rule the server integration follows.
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

import { OpenRouter } from "@openrouter/sdk";
import type { SDKOptions } from "@openrouter/sdk";
import type { ChatMessages, ChatRequest } from "@openrouter/sdk/models";

import { loadLlmConfig } from "./config.ts";
import type { LlmConfig, LlmEnv } from "./config.ts";
import { mapWithConcurrency } from "./pool.ts";

/** The SDK's retry policy shape, reached through the option that consumes it. */
type RetryConfig = NonNullable<SDKOptions["retryConfig"]>;

/**
 * Retries live in the SDK rather than in a loop here: it already implements
 * exponential backoff with jitter over the right status codes, and hand-rolling
 * one on top would multiply the attempts (and the spend) rather than replace
 * them.
 */
const RETRY_CONFIG: RetryConfig = {
  strategy: "backoff",
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
const RETRY_CODES = ["408", "409", "429", "500", "502", "503", "504"];

/** A message in OpenRouter's role-discriminated shape. Re-exported so callers need not import the SDK. */
export type LlmMessage = ChatMessages;

/** What `complete()` accepts: a bare string for the one-shot case, or a full message array. */
export type LlmMessagesInput = string | LlmMessage[];

/**
 * Token accounting as returned by the provider. Every field is optional because
 * not every provider reports every number, and `cost` is absent on free models.
 */
export interface LlmUsage {
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  cost?: number | null;
}

/** Summed usage across a batch. Always present, zeroed when nothing reported. */
export interface LlmUsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
}

/** The shared client plus the config it was built from. */
export interface LlmClientHandle {
  client: OpenRouter;
  cfg: LlmConfig;
}

export interface GetClientOptions {
  env?: LlmEnv;
}

export interface CompleteOptions {
  model?: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: ChatRequest["responseFormat"];
  timeoutMs?: number;
  signal?: AbortSignal;
  label?: string;
  env?: LlmEnv;
}

export interface CompleteOk {
  ok: true;
  text: string;
  model: string;
  id: string | null;
  usage: LlmUsage | null;
}

export interface CompleteFailure {
  ok: false;
  error: string;
  status: number | null;
}

/**
 * Discriminated on `ok`: narrow with `if (r.ok)` and the compiler hands you
 * `text`, otherwise `error`/`status`. Modelling the fail-soft contract in the
 * type is the point — a caller cannot read `text` without handling failure.
 */
export type CompleteResult = CompleteOk | CompleteFailure;

export interface CompleteManyOptions extends CompleteOptions {
  concurrency?: number;
}

export interface CompleteManyResult {
  /** Index-aligned with the `inputs` array. */
  results: CompleteResult[];
  okCount: number;
  failCount: number;
  usage: LlmUsageTotals;
}

/**
 * The non-streaming send payload. `stream: false` is a literal, not a boolean,
 * so the SDK's overload resolves to the plain `ChatResult` return rather than
 * an EventStream.
 */
type NonStreamingChatRequest = ChatRequest & { stream: false };

// Built once and reused: each client owns a connection pool, so constructing
// one per call would defeat keep-alive across a batch.
let cached: LlmClientHandle | null = null;

/**
 * Lazily construct the shared client.
 *
 * Lazy on purpose — importing this module must not require an OpenRouter key,
 * so unrelated server routes can boot without one.
 */
export function getClient(opts: GetClientOptions = {}): LlmClientHandle {
  if (cached && !opts.env) return cached;

  const cfg = loadLlmConfig(opts.env);

  const client = new OpenRouter({
    apiKey: cfg.apiKey,
    appTitle: cfg.appTitle,
    httpReferer: cfg.httpReferer,
    timeoutMs: cfg.timeoutMs,
    retryConfig: RETRY_CONFIG,
  });

  const handle: LlmClientHandle = { client, cfg };

  // A caller-supplied env is a test/one-off; don't let it poison the shared instance.
  if (!opts.env) cached = handle;

  return handle;
}

/** Drop the cached client. For tests and for picking up a rotated key. */
export function resetClient(): void {
  cached = null;
}

/**
 * Normalize whatever the caller passed into an OpenRouter messages array.
 *
 * Accepts a bare string for the common one-shot case. Kept deliberately general
 * — task-specific prompt shaping belongs in the modules that will specialize
 * this later, not in the transport.
 */
function toMessages(input: LlmMessagesInput): LlmMessage[] {
  if (typeof input === "string") return [{ role: "user", content: input }];

  if (Array.isArray(input) && input.length > 0) return input;

  throw new TypeError("messages must be a non-empty string or a non-empty array");
}

/**
 * Run one completion.
 *
 * Fail-soft by contract (AGENTS.md: no external API failure may break the query
 * path). Every network/provider failure — timeouts, 429s, bad model IDs, auth
 * rejections — comes back as `{ok:false, error, status}` rather than throwing,
 * matching the `{ok}` convention in the location module so a caller can degrade
 * rather than crash.
 *
 * Two classes of error DO throw, because both are bugs a caller cannot degrade
 * around and both fail identically on every call: a malformed `messages`
 * argument, and a missing/invalid OPENROUTER_API_KEY. Fail fast on setup,
 * fail soft on the wire.
 */
export async function complete(
  messages: LlmMessagesInput,
  opts: CompleteOptions = {},
): Promise<CompleteResult> {
  const { client, cfg } = getClient(opts.env ? { env: opts.env } : {});

  const body = toMessages(messages);

  // A system prompt is prepended rather than merged, so callers can pass a
  // plain user string and still get steering.
  const finalMessages: LlmMessage[] = opts.system
    ? [{ role: "system", content: opts.system }, ...body]
    : body;

  // Hoisted out of the request because `ChatRequest['model']` is optional in the
  // SDK typings; the logging and result paths below want a definite string.
  const model = opts.model || cfg.model;

  const chatRequest: NonStreamingChatRequest = {
    model,
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

    const text = result?.choices?.[0]?.message?.content ?? "";
    const usage: LlmUsage | null = result?.usage ?? null;

    logCycle({
      label: opts.label,
      model: result?.model ?? model,
      ms: Date.now() - started,
      usage,
      ok: true,
    });

    return {
      ok: true,
      text: typeof text === "string" ? text : JSON.stringify(text),
      model: result?.model ?? model,
      id: result?.id ?? null,
      usage,
    };
  } catch (err) {
    // Error message only. SDK errors can carry the request body, which for us
    // may contain scraped content — and never the key, which we must not log.
    const message = errorMessage(err);
    const status = errorStatus(err);

    logCycle({
      label: opts.label,
      model,
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
 */
export async function completeMany(
  inputs: LlmMessagesInput[],
  opts: CompleteManyOptions = {},
): Promise<CompleteManyResult> {
  const { cfg } = getClient(opts.env ? { env: opts.env } : {});

  const settled = await mapWithConcurrency(
    inputs,
    (input, index) => complete(input, { ...opts, label: opts.label ?? `batch[${index}]` }),
    { concurrency: opts.concurrency ?? cfg.concurrency, signal: opts.signal },
  );

  // mapWithConcurrency wraps in its own {ok}; complete() already fail-softs, so
  // the outer layer only ever trips on a programmer error (bad messages arg).
  // Flatten to one level so callers see a single, uniform shape.
  const results: CompleteResult[] = settled.map((r) =>
    r.ok ? r.value : { ok: false, error: r.error, status: null },
  );

  const totals: LlmUsageTotals = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cost: 0,
  };
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

interface LogCycleArgs {
  label?: string;
  model: string;
  ms: number;
  usage: LlmUsage | null;
  ok: boolean;
  error?: string;
}

/** One line per call (AGENTS.md). Never includes prompt or completion text. */
function logCycle({ label, model, ms, usage, ok, error }: LogCycleArgs): void {
  const tag = label ? `[llm:${label}]` : "[llm]";
  const tokens = usage ? `${usage.totalTokens ?? "?"}tok` : "no-usage";
  const cost = usage?.cost != null ? ` $${usage.cost.toFixed(4)}` : "";

  if (ok) {
    console.log(`${tag} ok model=${model} ${ms}ms ${tokens}${cost}`);
  } else {
    console.error(`${tag} FAILED model=${model} ${ms}ms: ${error}`);
  }
}

/**
 * `catch` binds `unknown` under strict TS, so the JS original's
 * `err?.message ?? String(err)` and `typeof err?.statusCode === 'number'` need
 * explicit narrows. Behaviour is unchanged.
 */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;

  if (typeof err === "object" && err !== null && "message" in err) {
    const { message } = err as { message?: unknown };
    if (typeof message === "string") return message;
  }

  return String(err);
}

/** Status code off an SDK error, or null when the throwable does not carry one. */
function errorStatus(err: unknown): number | null {
  if (typeof err === "object" && err !== null && "statusCode" in err) {
    const { statusCode } = err as { statusCode?: unknown };
    if (typeof statusCode === "number") return statusCode;
  }

  return null;
}
