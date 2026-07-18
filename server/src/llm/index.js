/**
 * Public surface of the LLM layer.
 *
 * General-purpose by design: this is the out-of-band path for work that happens
 * outside the live conversation — summarizing scraped batches, condensing feeds,
 * prepping context for agents. The realtime voice path does NOT go through here.
 *
 * Specialized helpers (structured extraction, untrusted-input wrapping per
 * AGENTS.md #2, per-task prompts) get layered on top of `complete()` later
 * rather than baked into it.
 *
 * Usage:
 *   import { complete, completeMany } from './llm/index.js';
 *
 *   const r = await complete('Summarize this.', { system: 'Be terse.' });
 *   if (r.ok) console.log(r.text);
 *
 *   const batch = await completeMany(docs.map((d) => `Summarize:\n${d}`));
 *   console.log(`${batch.okCount}/${batch.results.length}`);
 */

export { complete, completeMany, getClient, resetClient } from './client.js';
export { loadLlmConfig, describeLlmConfig, DEFAULT_MODEL } from './config.js';
export { mapWithConcurrency, partitionResults } from './pool.js';
