/**
 * AIService - Unified AI integration wrapping pi-ai.
 *
 * Provides task-based model routing, credential loading, and structured output support.
 * Uses DI pattern: config passed at construction, testDeps for mocking pi-ai calls.
 */

import { Type, type TSchema, type Static } from '@sinclair/typebox';
import { Ajv } from 'ajv';
import type { AreteConfig, AITask, AITier } from '../models/workspace.js';
import {
  getApiKey,
  getEnvVarName,
  loadCredentialsIntoEnv,
  getOAuthApiKeyForProvider,
} from '../credentials.js';

// pi-ai imports
import type {
  Context,
  AssistantMessage,
  KnownProvider,
  Model,
  Api,
  SimpleStreamOptions,
} from '@mariozechner/pi-ai';
import { getModel, completeSimple, getEnvApiKey } from '@mariozechner/pi-ai';

/** Options for AI completion calls */
export interface AICallOptions {
  /** System prompt for the conversation */
  systemPrompt?: string;
  /** Temperature for response generation (0-1) */
  temperature?: number;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/** Result of an AI completion call */
export interface AICallResult {
  /** The text response from the model */
  text: string;
  /** Token usage statistics */
  usage: {
    input: number;
    output: number;
    total: number;
  };
  /** Model used for the call */
  model: string;
  /** Provider used */
  provider: string;
}

/** Result of a structured output call */
export interface AIStructuredResult<T> extends AICallResult {
  /** The parsed and validated data */
  data: T;
}

/** Dependency injection for testing */
export interface AIServiceTestDeps {
  completeSimple: typeof completeSimple;
  getModel: typeof getModel;
  getEnvApiKey: typeof getEnvApiKey;
  /** Optional: mock getApiKey for file credential lookup */
  getApiKey?: typeof getApiKey;
  /** Optional: mock getOAuthApiKey for OAuth credential lookup */
  getOAuthApiKey?: typeof getOAuthApiKeyForProvider;
}

/** Model specification: provider/model format */
export interface ModelSpec {
  provider: KnownProvider;
  modelId: string;
}

/** Default task-to-tier mappings */
const DEFAULT_TASK_TIERS: Record<AITask, AITier> = {
  summary: 'fast',
  extraction: 'fast',
  decision_extraction: 'standard',
  learning_extraction: 'standard',
  significance_analysis: 'standard',
  reconciliation: 'standard',
  synthesis: 'standard',
  brief: 'standard',
};

/**
 * Parse a model string into provider and model ID.
 * Format: "provider/model-id" or just "model-id" (defaults to anthropic)
 */
export function parseModelSpec(modelString: string): ModelSpec {
  const parts = modelString.split('/');
  if (parts.length === 2) {
    return {
      provider: parts[0] as KnownProvider,
      modelId: parts[1],
    };
  }
  // Default to anthropic if no provider specified
  return {
    provider: 'anthropic',
    modelId: modelString,
  };
}

/**
 * AIService - Wraps pi-ai with task-based routing and structured output support.
 *
 * Configuration:
 * - Tier models defined in config.ai.tiers (fast, standard, frontier)
 * - Task-to-tier routing in config.ai.tasks
 * - Credentials loaded from ~/.arete/credentials.yaml or env vars
 */
export class AIService {
  private config: AreteConfig;
  private deps: AIServiceTestDeps;
  private ajv: InstanceType<typeof Ajv>;
  private credentialsLoaded = false;

  constructor(config: AreteConfig, testDeps?: AIServiceTestDeps) {
    this.config = config;
    this.deps = testDeps ?? {
      completeSimple,
      getModel,
      getEnvApiKey,
    };
    this.ajv = new Ajv({ strict: false, allErrors: true });
  }

  /**
   * Ensure credentials are loaded into environment.
   * Called lazily on first API call.
   */
  private ensureCredentials(): void {
    if (!this.credentialsLoaded) {
      loadCredentialsIntoEnv();
      this.credentialsLoaded = true;
    }
  }

  /**
   * Get the model for a task based on tier routing.
   *
   * @throws Error if tier not configured or no model for tier
   */
  getTierForTask(task: AITask): AITier {
    const taskTiers = this.config.ai?.tasks ?? DEFAULT_TASK_TIERS;
    const tier = taskTiers[task] ?? DEFAULT_TASK_TIERS[task];
    return tier;
  }

  /**
   * Get the model ID for a tier.
   *
   * @throws Error if tier not configured
   */
  getModelForTier(tier: AITier): string {
    const tiers = this.config.ai?.tiers;
    if (!tiers) {
      throw new Error(
        `AI tier '${tier}' not configured. Set ai.tiers.${tier} in arete.yaml`,
      );
    }

    const modelId = tiers[tier];
    if (!modelId) {
      throw new Error(
        `AI tier '${tier}' not configured. Set ai.tiers.${tier} in arete.yaml`,
      );
    }

    return modelId;
  }

  /**
   * Get the model specification for a task.
   *
   * @throws Error if tier not configured
   */
  getModelForTask(task: AITask): ModelSpec {
    const tier = this.getTierForTask(task);
    const modelString = this.getModelForTier(tier);
    return parseModelSpec(modelString);
  }

  /**
   * Get API key for a provider, checking env vars, OAuth, and credentials file.
   * Priority: env vars > OAuth > credentials file
   *
   * @throws Error if no API key configured
   */
  private async getApiKeyOrThrow(provider: string): Promise<string> {
    this.ensureCredentials();

    // First check env var (which may have been populated by loadCredentialsIntoEnv)
    const apiKey = this.deps.getEnvApiKey(provider as KnownProvider);
    if (apiKey) {
      return apiKey;
    }

    // Check OAuth credentials (with automatic token refresh)
    const getOAuthApiKeyFn = this.deps.getOAuthApiKey ?? getOAuthApiKeyForProvider;
    try {
      const oauthResult = await getOAuthApiKeyFn(provider);
      if (oauthResult?.apiKey) {
        return oauthResult.apiKey;
      }
    } catch (err) {
      // OAuth refresh failed - continue to check other sources
      // but log the error for debugging
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`OAuth token refresh failed for ${provider}: ${errMsg}`);
    }

    // Try our own getApiKey as fallback (use mocked version if provided)
    const getApiKeyFn = this.deps.getApiKey ?? getApiKey;
    const fileKey = getApiKeyFn(provider);
    if (fileKey) {
      return fileKey;
    }

    const envVarName = getEnvVarName(provider) ?? `${provider.toUpperCase()}_API_KEY`;
    throw new Error(
      `No API key for provider '${provider}'. Set ${envVarName}, login via 'arete credentials login ${provider}', or configure via ~/.arete/credentials.yaml`,
    );
  }

  /**
   * Call the AI with a task-based model routing.
   *
   * @param task - The task type for model selection
   * @param prompt - The user prompt to send
   * @param options - Optional configuration
   * @returns The AI response with text and metadata
   */
  async call(
    task: AITask,
    prompt: string,
    options?: AICallOptions,
  ): Promise<AICallResult> {
    const modelSpec = this.getModelForTask(task);
    return this.callWithModel(modelSpec, prompt, options);
  }

  /**
   * Call the AI with a specific model.
   *
   * @param modelSpec - The provider/model to use
   * @param prompt - The user prompt to send
   * @param options - Optional configuration
   * @returns The AI response with text and metadata
   */
  async callWithModel(
    modelSpec: ModelSpec,
    prompt: string,
    options?: AICallOptions,
  ): Promise<AICallResult> {
    const apiKey = await this.getApiKeyOrThrow(modelSpec.provider);

    // Get the model from pi-ai
    // Use type assertion since we don't have the full model registry types
    const model = this.deps.getModel(
      modelSpec.provider,
      modelSpec.modelId as never,
    );

    const context: Context = {
      systemPrompt: options?.systemPrompt,
      messages: [
        {
          role: 'user',
          content: prompt,
          timestamp: Date.now(),
        },
      ],
    };

    const streamOptions: SimpleStreamOptions = {
      apiKey,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      signal: options?.signal,
    };

    const response = await this.deps.completeSimple(
      model,
      context,
      streamOptions,
    );

    // Check for errors in the response
    if (response.stopReason === 'error') {
      const errorMsg = response.errorMessage ?? 'Unknown AI error';
      throw new Error(`AI call failed: ${errorMsg}`);
    }

    // Extract text from response
    const textContent = response.content.find((c) => c.type === 'text');
    const text = textContent?.type === 'text' ? textContent.text : '';

    return {
      text,
      usage: {
        input: response.usage.input,
        output: response.usage.output,
        total: response.usage.totalTokens,
      },
      model: response.model,
      provider: response.provider,
    };
  }

  /**
   * Call the AI and parse the response as structured JSON.
   *
   * Uses JSON prompt + validation approach:
   * 1. Includes schema instructions in the prompt
   * 2. Parses response as JSON
   * 3. Validates against TypeBox schema
   *
   * @param task - The task type for model selection
   * @param prompt - The user prompt (schema instructions will be appended)
   * @param schema - TypeBox schema for validation
   * @param options - Optional configuration
   * @returns The validated data with AI metadata
   */
  async callStructured<T extends TSchema>(
    task: AITask,
    prompt: string,
    schema: T,
    options?: AICallOptions,
  ): Promise<AIStructuredResult<Static<T>>> {
    // Build enhanced prompt with JSON schema instructions
    const schemaJson = JSON.stringify(schema, null, 2);
    const enhancedPrompt = `${prompt}

Respond with valid JSON matching this schema:
\`\`\`json
${schemaJson}
\`\`\`

Return ONLY valid JSON, no other text.`;

    const result = await this.call(task, enhancedPrompt, {
      ...options,
      temperature: options?.temperature ?? 0, // Use low temp for structured output
    });

    // Parse JSON from response
    let parsed: unknown;
    try {
      // Try to extract JSON from the response (handle markdown code blocks)
      let jsonText = result.text.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.slice(7);
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.slice(3);
      }
      if (jsonText.endsWith('```')) {
        jsonText = jsonText.slice(0, -3);
      }
      jsonText = jsonText.trim();

      parsed = JSON.parse(jsonText);
    } catch (e) {
      throw new Error(
        `Failed to parse AI response as JSON: ${e instanceof Error ? e.message : String(e)}\nResponse: ${result.text}`,
      );
    }

    // Validate against schema
    const validate = this.ajv.compile(schema);
    if (!validate(parsed)) {
      const errors = validate.errors
        ?.map((err: { instancePath?: string; message?: string }) => `${err.instancePath}: ${err.message}`)
        .join(', ');
      throw new Error(`AI response failed schema validation: ${errors}`);
    }

    return {
      ...result,
      data: parsed as Static<T>,
    };
  }

  /**
   * Check if a specific tier is configured.
   */
  hasTier(tier: AITier): boolean {
    const tiers = this.config.ai?.tiers;
    if (!tiers) return false;
    return !!tiers[tier];
  }

  /**
   * Check if any AI configuration is available.
   */
  isConfigured(): boolean {
    return this.hasTier('fast') || this.hasTier('standard') || this.hasTier('frontier');
  }
}
