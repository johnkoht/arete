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

/**
 * Thrown when the model response was truncated (`stopReason: 'length'`).
 *
 * single_pass W1 (S2): truncation is a FAILURE, not a success — a half-emitted
 * JSON body parses to garbage/empty and used to slip through silently. This is
 * NEVER retried (a retry would truncate identically); it surfaces loudly so the
 * caller can bump `maxTokens` or split the input.
 */
export class TruncationError extends Error {
  readonly code = 'truncation' as const;
  constructor(message = 'AI response truncated (stopReason: length)') {
    super(message);
    this.name = 'TruncationError';
  }
}

/** Max transient-retry attempts in `callWithModel` (S2). Total tries = this. */
const AI_MAX_ATTEMPTS = 3;
/** Base backoff (ms) for transient retries; grows ~exponentially, capped. */
const AI_RETRY_BASE_MS = 500;
const AI_RETRY_CAP_MS = 4000;

/**
 * Classify whether an error from the AI transport is a transient/retryable
 * transport failure (single_pass W1 / S2). RETRYABLE = overload, rate limit
 * (429), server errors (5xx), and network/connection blips. NOT retryable:
 * auth/credential errors, truncation, malformed-output/parse errors,
 * client/validation (4xx other than 429), or a deliberate empty success.
 *
 * Heuristic on message text + any numeric status, because pi-ai surfaces the
 * provider error as a plain `Error` (no typed status). Conservative: defaults
 * to NOT retryable so we never pay 3× for a non-transient failure.
 */
export function isRetryableTransportError(err: unknown): boolean {
  // TruncationError and parse failures are explicitly non-retryable.
  if (err instanceof TruncationError) return false;
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();

  // Auth / credentials — never retry (will fail identically).
  if (
    message.includes('api key') ||
    message.includes('api_key') ||
    message.includes('unauthorized') ||
    message.includes('authentication') ||
    message.includes('invalid x-api-key') ||
    message.includes('permission')
  ) {
    return false;
  }

  // Explicit retryable signals.
  if (
    message.includes('overloaded') ||
    message.includes('overload') ||
    message.includes('rate limit') ||
    message.includes('rate_limit') ||
    message.includes('too many requests') ||
    message.includes('429') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('internal server error') ||
    message.includes('bad gateway') ||
    message.includes('service unavailable') ||
    message.includes('gateway timeout') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('enetunreach') ||
    message.includes('socket hang up') ||
    message.includes('network') ||
    message.includes('fetch failed')
  ) {
    return true;
  }

  // Default: not retryable (conservative).
  return false;
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
  // Phase 11 11a — fast tier per AC3a (precision floor ≥0.95 with the
  // hybrid pre-filter doing the heavy throttling). Promote to standard only
  // if golden-set precision drops below 0.95.
  external_resolution: 'fast',
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

    // Transient-retry loop (single_pass W1 / S2). Retries only the retryable
    // transport class (overload/429/5xx/network) up to AI_MAX_ATTEMPTS with
    // capped backoff. NEVER retries: truncation (TruncationError), auth, or a
    // deliberate empty success (a successful response with empty text is
    // returned, not retried). Aborts (caller signal) are surfaced immediately.
    let lastErr: unknown;
    let response: AssistantMessage | undefined;
    for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt++) {
      try {
        const candidate = await this.deps.completeSimple(
          model,
          context,
          streamOptions,
        );

        // Truncation is a failure, not a success — surface loudly, never retry
        // (a retry would truncate identically). S2.
        if (candidate.stopReason === 'length') {
          throw new TruncationError();
        }

        // Provider/transport error reported in-band via stopReason.
        if (candidate.stopReason === 'error') {
          const errorMsg = candidate.errorMessage ?? 'Unknown AI error';
          throw new Error(`AI call failed: ${errorMsg}`);
        }

        response = candidate;
        break;
      } catch (err) {
        lastErr = err;
        // Caller-requested abort: surface immediately, never retry.
        if (options?.signal?.aborted) throw err;
        // Non-retryable (truncation, auth, client error): surface immediately.
        if (!isRetryableTransportError(err)) throw err;
        // Out of attempts: surface the last transient error.
        if (attempt >= AI_MAX_ATTEMPTS) throw err;
        // Retryable transient: back off (capped exponential) and retry.
        const delay = Math.min(AI_RETRY_BASE_MS * 2 ** (attempt - 1), AI_RETRY_CAP_MS);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    if (!response) {
      // Loop exhausted without a response (should be unreachable — the loop
      // either breaks with a response or throws). Surface the last error.
      throw lastErr instanceof Error ? lastErr : new Error('AI call failed');
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
   * Run N independent AI calls concurrently, returning their text responses
   * in the same order as the input.
   *
   * Phase 10 plan §10a-pre + pre-mortem F1 mitigation. The Phase 10b-min
   * dedup pipeline needs to evaluate K candidate pairs per extract; running
   * them serially against `fast` tier blows AC13's ≤5s/extract gate
   * (5 candidates × ~600ms serial ≈ 3s, then 10 staged items × 3s = 30s).
   * Promise.all gets the cluster to ~one call's latency for independent
   * pairs.
   *
   * This is a deliberately thin wrapper around `call()` — it does NOT do
   * prompt-level batching (joining N pairs into one prompt and parsing an
   * array response). That higher-level batching can be built on top of
   * `callConcurrent` when N is large enough that per-call overhead
   * dominates; until then the parallel-Promise.all path covers the
   * dedup-cross-check shape.
   *
   * Properties:
   *  - **Ordering preserved**: result[i] corresponds to prompts[i].
   *  - **All-or-throw**: if any call rejects, `callConcurrent` rejects with
   *    the first rejection (Promise.all semantics). Callers that need
   *    partial-success handling can wrap individual prompts with their own
   *    try/catch or use `Promise.allSettled` at the call site instead.
   *  - **Independent tiers**: each prompt carries its own tier, so a batch
   *    can mix `fast`/`standard` calls (e.g., a confidence-tier promotion
   *    pass).
   *  - **No batching of provider tokens** — N concurrent HTTP requests
   *    against the upstream API. Respect provider rate limits.
   *
   * @param prompts - Array of {tier, prompt} pairs to run in parallel.
   * @param options - Shared call options applied to every prompt.
   * @returns Array of response text strings, indexed parallel to input.
   */
  async callConcurrent(
    prompts: { tier: AITier; prompt: string }[],
    options?: AICallOptions,
  ): Promise<string[]> {
    if (prompts.length === 0) return [];
    const results = await Promise.all(
      prompts.map(async ({ tier, prompt }) => {
        const modelString = this.getModelForTier(tier);
        const modelSpec = parseModelSpec(modelString);
        const result = await this.callWithModel(modelSpec, prompt, options);
        return result.text;
      }),
    );
    return results;
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
