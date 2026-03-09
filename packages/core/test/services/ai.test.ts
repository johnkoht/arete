/**
 * Tests for AIService.
 *
 * Uses mocked pi-ai calls via testDeps injection pattern (no real API calls).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Type } from '@sinclair/typebox';
import { AIService, parseModelSpec } from '../../src/services/ai.js';
import type { AIServiceTestDeps, ModelSpec } from '../../src/services/ai.js';
import type { AreteConfig, AITask, AITier } from '../../src/models/workspace.js';
import type { AssistantMessage, Context, KnownProvider, Model, SimpleStreamOptions } from '@mariozechner/pi-ai';

// Mock response factory
function createMockResponse(text: string, model = 'test-model', provider = 'anthropic'): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'anthropic-messages',
    provider,
    model,
    usage: {
      input: 100,
      output: 50,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 150,
      cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  };
}

// Create mock testDeps
function createMockDeps(options?: {
  response?: AssistantMessage;
  apiKey?: string;
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
      return options?.response ?? createMockResponse('Test response');
    },
    getModel: (provider: KnownProvider, modelId: string) => {
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
      } as Model<any>;
    },
    getEnvApiKey: (provider: KnownProvider) => {
      return options?.apiKey ?? 'test-api-key';
    },
  };
}

// Create test config
function createTestConfig(aiConfig?: AreteConfig['ai']): AreteConfig {
  return {
    schema: 1,
    version: null,
    source: 'npm',
    ai: aiConfig ?? {
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

describe('parseModelSpec', () => {
  it('parses provider/model format', () => {
    const spec = parseModelSpec('anthropic/claude-sonnet-4-20250514');
    assert.equal(spec.provider, 'anthropic');
    assert.equal(spec.modelId, 'claude-sonnet-4-20250514');
  });

  it('defaults to anthropic when no provider specified', () => {
    const spec = parseModelSpec('claude-sonnet-4-20250514');
    assert.equal(spec.provider, 'anthropic');
    assert.equal(spec.modelId, 'claude-sonnet-4-20250514');
  });

  it('parses google provider', () => {
    const spec = parseModelSpec('google/gemini-2.0-flash');
    assert.equal(spec.provider, 'google');
    assert.equal(spec.modelId, 'gemini-2.0-flash');
  });
});

describe('AIService', () => {
  describe('tier and task routing', () => {
    it('returns tier for task from config', () => {
      const config = createTestConfig();
      const service = new AIService(config);

      assert.equal(service.getTierForTask('summary'), 'fast');
      assert.equal(service.getTierForTask('decision_extraction'), 'standard');
    });

    it('returns model for tier from config', () => {
      const config = createTestConfig();
      const service = new AIService(config);

      assert.equal(service.getModelForTier('fast'), 'anthropic/claude-3-haiku-20240307');
      assert.equal(service.getModelForTier('standard'), 'anthropic/claude-sonnet-4-20250514');
      assert.equal(service.getModelForTier('frontier'), 'anthropic/claude-3-opus-20240229');
    });

    it('throws descriptive error when tier not configured', () => {
      const config = createTestConfig({
        tiers: {
          fast: 'anthropic/claude-3-haiku-20240307',
          // standard not configured
        },
      });
      const service = new AIService(config);

      assert.throws(
        () => service.getModelForTier('standard'),
        /AI tier 'standard' not configured\. Set ai\.tiers\.standard in arete\.yaml/,
      );
    });

    it('throws when no tiers configured at all', () => {
      const config = createTestConfig({ tiers: undefined });
      const service = new AIService(config);

      assert.throws(
        () => service.getModelForTier('fast'),
        /AI tier 'fast' not configured/,
      );
    });

    it('returns model spec for task', () => {
      const config = createTestConfig();
      const service = new AIService(config);

      const spec = service.getModelForTask('summary');
      assert.equal(spec.provider, 'anthropic');
      assert.equal(spec.modelId, 'claude-3-haiku-20240307');
    });

    it('uses default task-tier mapping when tasks not in config', () => {
      const config = createTestConfig({
        tiers: {
          fast: 'google/gemini-2.0-flash',
          standard: 'anthropic/claude-sonnet-4-20250514',
        },
        // tasks not specified - should use defaults
      });
      const service = new AIService(config);

      // summary defaults to fast
      const spec = service.getModelForTask('summary');
      assert.equal(spec.modelId, 'gemini-2.0-flash');
    });
  });

  describe('hasTier and isConfigured', () => {
    it('returns true when tier is configured', () => {
      const config = createTestConfig();
      const service = new AIService(config);

      assert.equal(service.hasTier('fast'), true);
      assert.equal(service.hasTier('standard'), true);
      assert.equal(service.hasTier('frontier'), true);
    });

    it('returns false when tier not configured', () => {
      const config = createTestConfig({ tiers: { fast: 'model' } });
      const service = new AIService(config);

      assert.equal(service.hasTier('fast'), true);
      assert.equal(service.hasTier('standard'), false);
    });

    it('isConfigured returns true when any tier configured', () => {
      const config = createTestConfig({ tiers: { fast: 'model' } });
      const service = new AIService(config);

      assert.equal(service.isConfigured(), true);
    });

    it('isConfigured returns false when no tiers configured', () => {
      const config = createTestConfig({ tiers: {} });
      const service = new AIService(config);

      assert.equal(service.isConfigured(), false);
    });
  });

  describe('call', () => {
    it('calls pi-ai with correct model and prompt', async () => {
      const config = createTestConfig();
      const deps = createMockDeps();
      const service = new AIService(config, deps);

      const result = await service.call('summary', 'Summarize this text');

      assert.equal(deps.calls.length, 1);
      assert.equal(deps.calls[0].model.id, 'claude-3-haiku-20240307');
      assert.equal(deps.calls[0].context.messages[0].content, 'Summarize this text');
      assert.equal(result.text, 'Test response');
    });

    it('passes system prompt in context', async () => {
      const config = createTestConfig();
      const deps = createMockDeps();
      const service = new AIService(config, deps);

      await service.call('summary', 'Test', { systemPrompt: 'You are helpful' });

      assert.equal(deps.calls[0].context.systemPrompt, 'You are helpful');
    });

    it('passes temperature and maxTokens', async () => {
      const config = createTestConfig();
      const deps = createMockDeps();
      const service = new AIService(config, deps);

      await service.call('summary', 'Test', { temperature: 0.7, maxTokens: 1000 });

      assert.equal(deps.calls[0].options?.temperature, 0.7);
      assert.equal(deps.calls[0].options?.maxTokens, 1000);
    });

    it('returns usage statistics', async () => {
      const config = createTestConfig();
      const deps = createMockDeps();
      const service = new AIService(config, deps);

      const result = await service.call('summary', 'Test');

      assert.equal(result.usage.input, 100);
      assert.equal(result.usage.output, 50);
      assert.equal(result.usage.total, 150);
    });

    it('returns model and provider info', async () => {
      const response = createMockResponse('Test', 'claude-3-haiku', 'anthropic');
      const config = createTestConfig();
      const deps = createMockDeps({ response });
      const service = new AIService(config, deps);

      const result = await service.call('summary', 'Test');

      assert.equal(result.model, 'claude-3-haiku');
      assert.equal(result.provider, 'anthropic');
    });
  });

  describe('callWithModel', () => {
    it('uses specified model regardless of task routing', async () => {
      const config = createTestConfig();
      const deps = createMockDeps();
      const service = new AIService(config, deps);

      const modelSpec: ModelSpec = { provider: 'google', modelId: 'gemini-2.0-flash' };
      await service.callWithModel(modelSpec, 'Test');

      assert.equal(deps.calls[0].model.provider, 'google');
      assert.equal(deps.calls[0].model.id, 'gemini-2.0-flash');
    });
  });

  describe('callStructured', () => {
    it('returns parsed and validated JSON response', async () => {
      const schema = Type.Object({
        summary: Type.String(),
        keyPoints: Type.Array(Type.String()),
      });

      const response = createMockResponse(
        JSON.stringify({ summary: 'Test summary', keyPoints: ['point1', 'point2'] }),
      );
      const config = createTestConfig();
      const deps = createMockDeps({ response });
      const service = new AIService(config, deps);

      const result = await service.callStructured('extraction', 'Extract info', schema);

      assert.equal(result.data.summary, 'Test summary');
      assert.deepEqual(result.data.keyPoints, ['point1', 'point2']);
    });

    it('handles JSON wrapped in code blocks', async () => {
      const schema = Type.Object({ value: Type.Number() });
      const response = createMockResponse('```json\n{"value": 42}\n```');
      const config = createTestConfig();
      const deps = createMockDeps({ response });
      const service = new AIService(config, deps);

      const result = await service.callStructured('extraction', 'Get value', schema);

      assert.equal(result.data.value, 42);
    });

    it('handles JSON wrapped in generic code blocks', async () => {
      const schema = Type.Object({ value: Type.Number() });
      const response = createMockResponse('```\n{"value": 42}\n```');
      const config = createTestConfig();
      const deps = createMockDeps({ response });
      const service = new AIService(config, deps);

      const result = await service.callStructured('extraction', 'Get value', schema);

      assert.equal(result.data.value, 42);
    });

    it('throws on invalid JSON', async () => {
      const schema = Type.Object({ value: Type.Number() });
      const response = createMockResponse('not valid json');
      const config = createTestConfig();
      const deps = createMockDeps({ response });
      const service = new AIService(config, deps);

      await assert.rejects(
        () => service.callStructured('extraction', 'Get value', schema),
        /Failed to parse AI response as JSON/,
      );
    });

    it('throws on schema validation failure', async () => {
      const schema = Type.Object({
        required: Type.String(),
      });
      const response = createMockResponse(JSON.stringify({ wrong: 'field' }));
      const config = createTestConfig();
      const deps = createMockDeps({ response });
      const service = new AIService(config, deps);

      await assert.rejects(
        () => service.callStructured('extraction', 'Get value', schema),
        /AI response failed schema validation/,
      );
    });

    it('uses low temperature by default for structured output', async () => {
      const schema = Type.Object({ value: Type.String() });
      const response = createMockResponse('{"value": "test"}');
      const config = createTestConfig();
      const deps = createMockDeps({ response });
      const service = new AIService(config, deps);

      await service.callStructured('extraction', 'Get value', schema);

      assert.equal(deps.calls[0].options?.temperature, 0);
    });

    it('allows temperature override', async () => {
      const schema = Type.Object({ value: Type.String() });
      const response = createMockResponse('{"value": "test"}');
      const config = createTestConfig();
      const deps = createMockDeps({ response });
      const service = new AIService(config, deps);

      await service.callStructured('extraction', 'Get value', schema, { temperature: 0.5 });

      assert.equal(deps.calls[0].options?.temperature, 0.5);
    });
  });

  describe('API key errors', () => {
    it('throws descriptive error when no API key available', async () => {
      const config = createTestConfig();
      const deps = createMockDeps({ apiKey: '' }); // Empty = no key
      // Override getEnvApiKey to return null
      deps.getEnvApiKey = () => null;
      // Also mock getApiKey (file credential lookup) to return null
      (deps as AIServiceTestDeps & { getApiKey?: () => null }).getApiKey = () => null;
      // Also mock getOAuthApiKey to return null
      (deps as AIServiceTestDeps & { getOAuthApiKey?: () => Promise<null> }).getOAuthApiKey = async () => null;
      const service = new AIService(config, deps);

      await assert.rejects(
        () => service.call('summary', 'Test'),
        /No API key for provider 'anthropic'\. Set ANTHROPIC_API_KEY, login via 'arete credentials login anthropic', or configure via ~\/\.arete\/credentials\.yaml/,
      );
    });
  });
});
