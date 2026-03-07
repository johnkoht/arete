/**
 * LLM client helper for CLI commands.
 *
 * Uses the Anthropic SDK directly with the ANTHROPIC_API_KEY env var.
 * Provides a simple interface matching the LLMCallFn type from services.
 */
/**
 * Function signature for the LLM call.
 * Accepts a prompt string and returns the LLM's text response.
 */
export type LLMCallFn = (prompt: string) => Promise<string>;
/**
 * Options for creating an LLM client.
 */
export type CreateLLMClientOptions = {
    /** Override the model (default: claude-sonnet-4-20250514) */
    model?: string;
    /** Max tokens to generate (default: 4096) */
    maxTokens?: number;
};
/**
 * Create an LLM client that uses the Anthropic API.
 *
 * @throws Error if ANTHROPIC_API_KEY environment variable is not set
 * @returns Function that accepts a prompt and returns the LLM response
 */
export declare function createLLMClient(options?: CreateLLMClientOptions): LLMCallFn;
//# sourceMappingURL=llm.d.ts.map