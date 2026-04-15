/**
 * Tests for IntelligenceService.synthesizeBriefing().
 *
 * Uses mocked AIService via testDeps injection pattern.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IntelligenceService } from '../../src/services/intelligence.js';
import { AIService } from '../../src/services/ai.js';
import type { AIServiceTestDeps } from '../../src/services/ai.js';
import type { PrimitiveBriefing } from '../../src/models/intelligence.js';
import type { AreteConfig } from '../../src/models/workspace.js';
import type { AssistantMessage, Context, KnownProvider, Model, SimpleStreamOptions } from '@mariozechner/pi-ai';
import { getModel, getEnvApiKey } from '@mariozechner/pi-ai';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockResponse(text: string): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'test-model',
    usage: {
      input: 200,
      output: 100,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 300,
      cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  };
}

function createMockAIDeps(options?: {
  response?: AssistantMessage;
  shouldThrow?: boolean;
  errorMessage?: string;
}): AIServiceTestDeps & { calls: Array<{ model: Model<any>; context: Context; options?: SimpleStreamOptions }> } {
  const calls: Array<{ model: Model<any>; context: Context; options?: SimpleStreamOptions }> = [];

  return {
    calls,
    completeSimple: async (model, context, opts) => {
      if (options?.shouldThrow) {
        throw new Error(options.errorMessage ?? 'API error');
      }
      calls.push({ model, context, options: opts });
      return options?.response ?? createMockResponse('## Current Status\n- Project is on track');
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
    getEnvApiKey: ((provider: KnownProvider | string) => {
      return 'test-api-key';
    }) as typeof getEnvApiKey,
  };
}

function createTestConfig(): AreteConfig {
  return {
    schema: 1,
    version: null,
    source: 'npm',
    ai: {
      tiers: {
        fast: 'anthropic/claude-3-haiku-20240307',
        standard: 'anthropic/claude-sonnet-4-20250514',
      },
      tasks: {},
    },
  };
}

function createMockBriefing(markdownLength?: number): PrimitiveBriefing {
  const markdown = markdownLength
    ? 'A'.repeat(markdownLength)
    : '## Primitive Briefing: Test topic\n\n### Context\n- Some context file\n\n### Memory\n- Some memory item\n';

  return {
    task: 'test topic',
    assembledAt: new Date().toISOString(),
    confidence: 'High',
    context: {
      primitives: ['Problem'],
      confidence: 'High',
      files: [],
      gaps: [],
    },
    memory: { total: 0, results: [] },
    entities: [],
    relationships: [],
    markdown,
  };
}

// Minimal mock services — synthesizeBriefing only needs the class instance
function createMockContextService(): any {
  return {
    getRelevantContext: async () => ({ primitives: [], confidence: 'High', files: [], gaps: [] }),
    getContextInventory: async () => ({}),
    listProjectSubdirs: async () => [],
    listProjectFiles: async () => [],
    readFile: async () => null,
  };
}

function createMockMemoryService(): any {
  return {
    search: async () => ({ total: 0, results: [] }),
    getTimeline: async () => ({ query: '', dateRange: {}, themes: [], items: [] }),
  };
}

function createMockEntityService(): any {
  return {
    resolve: async () => null,
    resolveAll: async () => [],
    getRelationships: async () => [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IntelligenceService.synthesizeBriefing', () => {
  let intelligence: IntelligenceService;

  beforeEach(() => {
    intelligence = new IntelligenceService(
      createMockContextService(),
      createMockMemoryService(),
      createMockEntityService(),
    );
  });

  it('returns synthesis from AI call', async () => {
    const synthesisText = '## Current Status\n- Project is on track\n\n## Key Decisions\n- Use React for frontend';
    const mockDeps = createMockAIDeps({
      response: createMockResponse(synthesisText),
    });
    const aiService = new AIService(createTestConfig(), mockDeps);
    const briefing = createMockBriefing();

    const result = await intelligence.synthesizeBriefing(briefing, 'test topic', aiService);

    assert.ok(result, 'Result should not be null');
    assert.equal(result.synthesis, synthesisText);
    assert.equal(result.truncated, false);
    assert.equal(result.usage.input, 200);
    assert.equal(result.usage.output, 100);
  });

  it('sends correct prompt with topic and context', async () => {
    const mockDeps = createMockAIDeps();
    const aiService = new AIService(createTestConfig(), mockDeps);
    const briefing = createMockBriefing();

    await intelligence.synthesizeBriefing(briefing, 'email templates project', aiService);

    assert.equal(mockDeps.calls.length, 1);
    const sentPrompt = mockDeps.calls[0].context.messages[0];
    assert.ok(sentPrompt.content);
    const promptText = typeof sentPrompt.content === 'string' ? sentPrompt.content : '';
    assert.ok(promptText.includes('email templates project'), 'Prompt should include the topic');
    assert.ok(promptText.includes('Current Status'), 'Prompt should include synthesis instructions');
    assert.ok(promptText.includes('Key Decisions'), 'Prompt should include Key Decisions section');
  });

  it('truncates long context and sets truncated flag', async () => {
    const mockDeps = createMockAIDeps();
    const aiService = new AIService(createTestConfig(), mockDeps);
    // Create a briefing with markdown longer than 12000 chars
    const briefing = createMockBriefing(15000);

    const result = await intelligence.synthesizeBriefing(briefing, 'test', aiService);

    assert.ok(result, 'Result should not be null');
    assert.equal(result.truncated, true);

    // Verify the sent context was truncated
    const sentPrompt = mockDeps.calls[0].context.messages[0];
    const promptText = typeof sentPrompt.content === 'string' ? sentPrompt.content : '';
    assert.ok(promptText.includes('[...context truncated]'), 'Should include truncation marker');
    // The total prompt will be longer than 12000 due to system prompt, but the context portion should be truncated
    assert.ok(!promptText.includes('A'.repeat(15000)), 'Full 15000-char content should not appear');
  });

  it('does not truncate short context', async () => {
    const mockDeps = createMockAIDeps();
    const aiService = new AIService(createTestConfig(), mockDeps);
    const briefing = createMockBriefing(100);

    const result = await intelligence.synthesizeBriefing(briefing, 'test', aiService);

    assert.ok(result, 'Result should not be null');
    assert.equal(result.truncated, false);

    const sentPrompt = mockDeps.calls[0].context.messages[0];
    const promptText = typeof sentPrompt.content === 'string' ? sentPrompt.content : '';
    assert.ok(!promptText.includes('[...context truncated]'), 'Should not have truncation marker');
  });

  it('returns null when AI call fails', async () => {
    const mockDeps = createMockAIDeps({ shouldThrow: true, errorMessage: 'Rate limited' });
    const aiService = new AIService(createTestConfig(), mockDeps);
    const briefing = createMockBriefing();

    const result = await intelligence.synthesizeBriefing(briefing, 'test', aiService);

    assert.equal(result, null, 'Should return null on AI failure');
  });

  it('returns null when AI call returns error stop reason', async () => {
    const errorResponse = createMockResponse('');
    errorResponse.stopReason = 'error';
    errorResponse.errorMessage = 'Model overloaded';
    const mockDeps = createMockAIDeps({ response: errorResponse });
    const aiService = new AIService(createTestConfig(), mockDeps);
    const briefing = createMockBriefing();

    // AIService.call() throws on error stop reason, synthesizeBriefing catches it
    const result = await intelligence.synthesizeBriefing(briefing, 'test', aiService);

    assert.equal(result, null, 'Should return null on AI error response');
  });

  it('uses brief AITask for model routing', async () => {
    const config = createTestConfig();
    const mockDeps = createMockAIDeps();
    const aiService = new AIService(config, mockDeps);
    const briefing = createMockBriefing();

    // Verify the 'brief' task routes to 'standard' tier
    const tier = aiService.getTierForTask('brief');
    assert.equal(tier, 'standard', 'brief task should route to standard tier');

    await intelligence.synthesizeBriefing(briefing, 'test', aiService);

    // The model used should be the standard tier model
    assert.equal(mockDeps.calls.length, 1);
    const usedModel = mockDeps.calls[0].model;
    assert.ok(usedModel, 'A model should have been used');
  });
});
