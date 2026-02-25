/**
 * Conversation insight extraction via LLM.
 *
 * Produces structured JSON output with optional sections:
 *   summary, decisions, action_items, open_questions, stakeholders, risks.
 *
 * Source-agnostic prompt — works with any conversation text.
 * Uses dependency injection for the LLM call to enable testability.
 */
import type { ConversationInsights } from './types.js';
/**
 * Function signature for the LLM call.
 * Accepts a prompt string and returns the LLM's text response.
 */
export type LLMCallFn = (prompt: string) => Promise<string>;
declare function buildExtractionPrompt(conversationText: string): string;
/**
 * Parse the LLM response into a ConversationInsights object.
 * Handles various response formats gracefully.
 */
declare function parseExtractionResponse(response: string): ConversationInsights;
/**
 * Extract insights from conversation text using an LLM.
 *
 * @param conversationText - The normalized conversation text to analyze
 * @param callLLM - Function that calls the LLM with a prompt and returns the response
 * @returns Extracted insights with only populated sections
 */
export declare function extractInsights(conversationText: string, callLLM: LLMCallFn): Promise<ConversationInsights>;
export { buildExtractionPrompt, parseExtractionResponse };
//# sourceMappingURL=extract.d.ts.map