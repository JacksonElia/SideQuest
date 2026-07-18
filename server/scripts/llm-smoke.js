/**
 * Headless proof that the OpenRouter layer works end to end: config loads, the
 * key is accepted, a single completion returns, and a batch runs with bounded
 * concurrency and per-item fail-soft.
 *
 * Run:  npm run llm:smoke
 *
 * Costs a few hundred tokens on the configured model. Prints no secrets.
 */

import { complete, completeMany } from '../src/llm/index.js';
import { loadLlmConfig, describeLlmConfig } from '../src/llm/config.js';

async function main() {
  const cfg = loadLlmConfig();
  console.log('[llm:smoke] config:', describeLlmConfig(cfg));

  // 1. Single completion.
  console.log('\n[llm:smoke] --- single completion ---');
  const one = await complete('Reply with exactly the word: pong', {
    system: 'You reply with exactly what is asked, nothing more.',
    maxTokens: 16,
    label: 'ping',
  });

  if (!one.ok) {
    console.error(`[llm:smoke] single completion FAILED: ${one.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[llm:smoke] got: ${JSON.stringify(one.text.trim())}`);

  // 2. Batch, exercising the concurrency pool the way bulk summarization will.
  console.log('\n[llm:smoke] --- batch of 3 ---');
  const prompts = [
    'In one short sentence, what is a landmark?',
    'In one short sentence, what is a street festival?',
    'In one short sentence, what is a viewpoint?',
  ];

  const batch = await completeMany(prompts, { maxTokens: 60, concurrency: 2 });

  batch.results.forEach((r, i) => {
    const line = r.ok ? r.text.trim().replace(/\s+/g, ' ') : `ERROR: ${r.error}`;
    console.log(`  [${i}] ${line.slice(0, 100)}`);
  });

  console.log(
    `\n[llm:smoke] batch: ${batch.okCount} ok, ${batch.failCount} failed, ` +
      `${batch.usage.totalTokens} tokens, $${batch.usage.cost.toFixed(4)}`,
  );

  if (batch.failCount > 0) process.exitCode = 1;
  else console.log('[llm:smoke] PASS');
}

main().catch((err) => {
  // Config/programmer errors land here; API failures are fail-soft above.
  console.error(`[llm:smoke] fatal: ${err.message}`);
  process.exitCode = 1;
});
