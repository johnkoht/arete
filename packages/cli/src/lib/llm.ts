/**
 * LLM client helper for CLI commands.
 *
 * Uses the Anthropic SDK directly with the ANTHROPIC_API_KEY env var.
 * Provides a simple interface matching the LLMCallFn type from services.
 */

import Anthropic from '@anthropic-ai/sdk';

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
export function createLLMClient(options?: CreateLLMClientOptions): LLMCallFn {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required for LLM operations. ' +
      'Set it with: export ANTHROPIC_API_KEY=your-key'
    );
  }

  const client = new Anthropic({ apiKey });
  const model = options?.model ?? 'claude-sonnet-4-20250514';
  const maxTokens = options?.maxTokens ?? 4096;

  return async (prompt: string): Promise<string> => {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    // Extract text from the response
    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    if (!textBlock) {
      throw new Error('No text response from LLM');
    }

    return textBlock.text;
  };
}
