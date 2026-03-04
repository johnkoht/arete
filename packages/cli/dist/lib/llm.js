/**
 * LLM client helper for CLI commands.
 *
 * Uses the Anthropic SDK directly with the ANTHROPIC_API_KEY env var.
 * Provides a simple interface matching the LLMCallFn type from services.
 */
import Anthropic from '@anthropic-ai/sdk';
/**
 * Create an LLM client that uses the Anthropic API.
 *
 * @throws Error if ANTHROPIC_API_KEY environment variable is not set
 * @returns Function that accepts a prompt and returns the LLM response
 */
export function createLLMClient(options) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is required for LLM operations. ' +
            'Set it with: export ANTHROPIC_API_KEY=your-key');
    }
    const client = new Anthropic({ apiKey });
    const model = options?.model ?? 'claude-sonnet-4-20250514';
    const maxTokens = options?.maxTokens ?? 4096;
    return async (prompt) => {
        const response = await client.messages.create({
            model,
            max_tokens: maxTokens,
            messages: [{ role: 'user', content: prompt }],
        });
        // Extract text from the response
        const textBlock = response.content.find((block) => block.type === 'text');
        if (!textBlock) {
            throw new Error('No text response from LLM');
        }
        return textBlock.text;
    };
}
//# sourceMappingURL=llm.js.map