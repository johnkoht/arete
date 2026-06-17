/**
 * AIService - Unified AI integration wrapping pi-ai.
 *
 * Provides task-based model routing, credential loading, and structured output support.
 * Uses DI pattern: config passed at construction, testDeps for mocking pi-ai calls.
 */
import { type TSchema, type Static } from '@sinclair/typebox';
import type { AreteConfig, AITask, AITier } from '../models/workspace.js';
import { getApiKey, getOAuthApiKeyForProvider } from '../credentials.js';
import type { KnownProvider } from '@mariozechner/pi-ai';
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
export declare class TruncationError extends Error {
    readonly code: "truncation";
    constructor(message?: string);
}
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
export declare function isRetryableTransportError(err: unknown): boolean;
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
/**
 * Parse a model string into provider and model ID.
 * Format: "provider/model-id" or just "model-id" (defaults to anthropic)
 */
export declare function parseModelSpec(modelString: string): ModelSpec;
/**
 * AIService - Wraps pi-ai with task-based routing and structured output support.
 *
 * Configuration:
 * - Tier models defined in config.ai.tiers (fast, standard, frontier)
 * - Task-to-tier routing in config.ai.tasks
 * - Credentials loaded from ~/.arete/credentials.yaml or env vars
 */
export declare class AIService {
    private config;
    private deps;
    private ajv;
    private credentialsLoaded;
    constructor(config: AreteConfig, testDeps?: AIServiceTestDeps);
    /**
     * Ensure credentials are loaded into environment.
     * Called lazily on first API call.
     */
    private ensureCredentials;
    /**
     * Get the model for a task based on tier routing.
     *
     * @throws Error if tier not configured or no model for tier
     */
    getTierForTask(task: AITask): AITier;
    /**
     * Get the model ID for a tier.
     *
     * @throws Error if tier not configured
     */
    getModelForTier(tier: AITier): string;
    /**
     * Get the model specification for a task.
     *
     * @throws Error if tier not configured
     */
    getModelForTask(task: AITask): ModelSpec;
    /**
     * Get API key for a provider, checking env vars, OAuth, and credentials file.
     * Priority: env vars > OAuth > credentials file
     *
     * @throws Error if no API key configured
     */
    private getApiKeyOrThrow;
    /**
     * Call the AI with a task-based model routing.
     *
     * @param task - The task type for model selection
     * @param prompt - The user prompt to send
     * @param options - Optional configuration
     * @returns The AI response with text and metadata
     */
    call(task: AITask, prompt: string, options?: AICallOptions): Promise<AICallResult>;
    /**
     * Call the AI with a specific model.
     *
     * @param modelSpec - The provider/model to use
     * @param prompt - The user prompt to send
     * @param options - Optional configuration
     * @returns The AI response with text and metadata
     */
    callWithModel(modelSpec: ModelSpec, prompt: string, options?: AICallOptions): Promise<AICallResult>;
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
    callConcurrent(prompts: {
        tier: AITier;
        prompt: string;
    }[], options?: AICallOptions): Promise<string[]>;
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
    callStructured<T extends TSchema>(task: AITask, prompt: string, schema: T, options?: AICallOptions): Promise<AIStructuredResult<Static<T>>>;
    /**
     * Check if a specific tier is configured.
     */
    hasTier(tier: AITier): boolean;
    /**
     * Check if any AI configuration is available.
     */
    isConfigured(): boolean;
}
//# sourceMappingURL=ai.d.ts.map