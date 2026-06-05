/**
 * Tests for AIService.callConcurrent (phase-10a-pre F1 mitigation).
 *
 * Covers:
 *  - Ordering: results[i] corresponds to prompts[i]
 *  - Parallelism: N concurrent calls return in ~one call's time, not N×
 *  - Mixed tiers: prompts can target different tiers in the same batch
 *  - Empty input is a no-op
 *  - First rejection propagates (Promise.all semantics)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AIService } from '../../src/services/ai.js';
import type { AIServiceTestDeps } from '../../src/services/ai.js';
import type { AreteConfig } from '../../src/models/workspace.js';
import type {
  AssistantMessage,
  Context,
  KnownProvider,
  Model,
  SimpleStreamOptions,
} from '@mariozechner/pi-ai';
import { getModel, getEnvApiKey } from '@mariozechner/pi-ai';

function mkResponse(text: string, modelId: string): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: modelId,
    usage: {
      input: 10,
      output: 10,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 20,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  };
}

/**
 * Build a deps where each call to completeSimple sleeps for `latencyMs` and
 * returns a text including the model id (so callers can assert the right
 * model was used) plus the prompt content (so callers can assert ordering).
 */
function createTimedDeps(latencyMs: number): AIServiceTestDeps & {
  calls: Array<{ model: Model<unknown>; context: Context; options?: SimpleStreamOptions }>;
  startTimes: number[];
} {
  const calls: Array<{ model: Model<unknown>; context: Context; options?: SimpleStreamOptions }> = [];
  const startTimes: number[] = [];
  return {
    calls,
    startTimes,
    completeSimple: async (model, context, opts) => {
      startTimes.push(Date.now());
      calls.push({ model, context, options: opts });
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
      // Last user message echoes back as the response — lets tests
      // assert that ordering is preserved.
      const userMsg = context.messages[context.messages.length - 1];
      const prompt =
        userMsg.role === 'user' && typeof userMsg.content === 'string'
          ? userMsg.content
          : '';
      const modelId = model.id;
      return mkResponse(`echo[${modelId}]:${prompt}`, modelId);
    },
    getModel: ((provider: KnownProvider, modelId: string) => {
      return {
        id: modelId,
        name: modelId,
        api: 'anthropic-messages',
        provider,
        baseUrl: 'https://api.anthropic.com',
        reasoning: false,
        input: ['text'],
        cost: { input: 0.003, output: 0.015, cacheRead: 0.0003, cacheWrite: 0.00375 },
        contextWindow: 200000,
        maxTokens: 8192,
      } as Model<never>;
    }) as typeof getModel,
    getEnvApiKey: (() => 'test-api-key') as typeof getEnvApiKey,
  };
}

function createConfig(): AreteConfig {
  return {
    schema: 1,
    version: null,
    source: 'npm',
    ai: {
      tiers: {
        fast: 'anthropic/claude-3-haiku-20240307',
        standard: 'anthropic/claude-sonnet-4-20250514',
        frontier: 'anthropic/claude-3-opus-20240229',
      },
      tasks: {
        summary: 'fast',
        extraction: 'fast',
        decision_extraction: 'standard',
        learning_extraction: 'standard',
        significance_analysis: 'standard',
        reconciliation: 'standard',
      },
    },
    skills: { core: [], overrides: [] },
    tools: [],
    integrations: {},
    settings: {
      memory: { decisions: { prompt_before_save: true }, learnings: { prompt_before_save: true } },
      conversations: { peopleProcessing: 'off' },
    },
  };
}

describe('AIService.callConcurrent — F1 mitigation', () => {
  it('returns [] when prompts is empty', async () => {
    const deps = createTimedDeps(0);
    const service = new AIService(createConfig(), deps);
    const result = await service.callConcurrent([]);
    assert.deepEqual(result, []);
    assert.equal(deps.calls.length, 0);
  });

  it('preserves ordering: result[i] corresponds to prompts[i]', async () => {
    const deps = createTimedDeps(20);
    const service = new AIService(createConfig(), deps);
    const prompts = [
      { tier: 'fast' as const,     prompt: 'PROMPT_ONE' },
      { tier: 'fast' as const,     prompt: 'PROMPT_TWO' },
      { tier: 'standard' as const, prompt: 'PROMPT_THREE' },
      { tier: 'fast' as const,     prompt: 'PROMPT_FOUR' },
      { tier: 'fast' as const,     prompt: 'PROMPT_FIVE' },
    ];

    const results = await service.callConcurrent(prompts);
    assert.equal(results.length, prompts.length);
    for (let i = 0; i < prompts.length; i++) {
      assert.ok(
        results[i].includes(prompts[i].prompt),
        `result[${i}] should include prompt[${i}] (${prompts[i].prompt}); got "${results[i]}"`,
      );
    }
  });

  it('runs N=5 calls concurrently in roughly one call\'s time (parallelism gate)', async () => {
    // Pick a latency big enough to overwhelm scheduling noise but small
    // enough to keep the test fast. 100ms × 5 serial would be 500ms; the
    // parallel target is ~120ms (one latency + scheduling slack).
    const latencyMs = 100;
    const deps = createTimedDeps(latencyMs);
    const service = new AIService(createConfig(), deps);
    const prompts = Array.from({ length: 5 }, (_, i) => ({
      tier: 'fast' as const,
      prompt: `p${i}`,
    }));

    const t0 = Date.now();
    const results = await service.callConcurrent(prompts);
    const elapsed = Date.now() - t0;

    assert.equal(results.length, 5);
    // Parallel-execution proof: total elapsed must be MUCH less than
    // serial (5 × 100ms = 500ms). Generous ceiling = 2.5x single-call
    // latency to absorb scheduling jitter on busy CI.
    assert.ok(
      elapsed < latencyMs * 2.5,
      `expected parallel elapsed < ${latencyMs * 2.5}ms; got ${elapsed}ms`,
    );

    // All 5 calls must have started before the first finished — proves
    // they were dispatched concurrently rather than awaited serially.
    const earliest = Math.min(...deps.startTimes);
    const latest = Math.max(...deps.startTimes);
    assert.ok(
      latest - earliest < latencyMs,
      `all 5 calls should have started within one latency window; spread was ${latest - earliest}ms`,
    );
  });

  it('routes each prompt through the requested tier model id', async () => {
    const deps = createTimedDeps(5);
    const service = new AIService(createConfig(), deps);
    const prompts = [
      { tier: 'fast' as const,     prompt: 'fast-1' },
      { tier: 'standard' as const, prompt: 'std-1' },
      { tier: 'frontier' as const, prompt: 'front-1' },
    ];

    const results = await service.callConcurrent(prompts);
    // Echo format from mock: `echo[<modelId>]:<prompt>`
    assert.match(results[0], /claude-3-haiku/);
    assert.match(results[1], /claude-sonnet/);
    assert.match(results[2], /claude-3-opus/);
  });

  it('rejects with the first error when any prompt fails', async () => {
    // Build a deps where the SECOND call throws.
    let callCount = 0;
    const deps: AIServiceTestDeps = {
      completeSimple: async (_model, _context, _opts) => {
        callCount += 1;
        if (callCount === 2) throw new Error('synthetic-failure');
        await new Promise((resolve) => setTimeout(resolve, 5));
        return mkResponse('ok', 'm');
      },
      getModel: ((provider: KnownProvider, modelId: string) =>
        ({
          id: modelId,
          name: modelId,
          api: 'anthropic-messages',
          provider,
          baseUrl: '',
          reasoning: false,
          input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 0,
          maxTokens: 0,
        }) as Model<never>) as typeof getModel,
      getEnvApiKey: (() => 'k') as typeof getEnvApiKey,
    };
    const service = new AIService(createConfig(), deps);
    await assert.rejects(
      service.callConcurrent([
        { tier: 'fast', prompt: 'a' },
        { tier: 'fast', prompt: 'b' },
        { tier: 'fast', prompt: 'c' },
      ]),
      /synthetic-failure/,
    );
  });
});
