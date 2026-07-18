/**
 * Public surface of the LLM layer.
 *
 * General-purpose by design: this is the out-of-band path for work that happens
 * outside the live conversation — summarizing scraped batches, condensing feeds,
 * prepping context for agents. The realtime voice path does NOT go through here.
 *
 * Server-only: it reads OPENROUTER_API_KEY and must never be imported from a
 * Client Component. Hence lib/server/.
 *
 * Specialized helpers (structured extraction, untrusted-input wrapping per
 * AGENTS.md #2, per-task prompts) get layered on top of `complete()` later
 * rather than baked into it.
 *
 * Usage:
 *   import { complete, completeMany } from '@/lib/server/llm';
 *
 *   const r = await complete('Summarize this.', { system: 'Be terse.' });
 *   if (r.ok) console.log(r.text);
 *
 *   const batch = await completeMany(docs.map((d) => `Summarize:\n${d}`));
 *   console.log(`${batch.okCount}/${batch.results.length}`);
 */

export { complete, completeMany, getClient, resetClient } from './client.ts';
export type {
  CompleteFailure,
  CompleteManyOptions,
  CompleteManyResult,
  CompleteOk,
  CompleteOptions,
  CompleteResult,
  GetClientOptions,
  LlmClientHandle,
  LlmMessage,
  LlmMessagesInput,
  LlmUsage,
  LlmUsageTotals,
} from './client.ts';

export { loadLlmConfig, describeLlmConfig, DEFAULT_MODEL } from './config.ts';
export { DEFAULT_CONCURRENCY, DEFAULT_TIMEOUT_MS } from './config.ts';
export type { DescribedLlmConfig, LlmConfig, LlmEnv } from './config.ts';

export { mapWithConcurrency, partitionResults } from './pool.ts';
export type {
  IndexedFailure,
  IndexedValue,
  MapWithConcurrencyOptions,
  PartitionedResults,
  SettledResult,
} from './pool.ts';
