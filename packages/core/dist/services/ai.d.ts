/**
 * AIService - Unified AI integration wrapping pi-ai.
 *
 * Provides task-based model routing, credential loading, and structured output support.
 * Uses DI pattern: config passed at construction, testDeps for mocking pi-ai calls.
 */
import { type TSchema, type Static } from '@sinclair/typebox';
import type { AreteConfig, AITask, AITier } from '../models/workspace.js';
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
/** Dependency injection for testing */
export interface AIServiceTestDeps {
    completeSimple: typeof completeSimple;
    getModel: typeof getModel;
    getEnvApiKey: typeof getEnvApiKey;
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
     * Get API key for a provider, checking env vars and credentials file.
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