/**
 * Conversation text parser with fallback chain.
 *
 * Fallback order:
 *   1. Structured with timestamps: [timestamp] Name: message
 *   2. Structured without timestamps: Name: message
 *   3. Raw text paragraph splitting
 *   4. Always succeed (never throws)
 *
 * Source-agnostic — no Slack-specific parsing (no emoji, no <@mention>, no thread markers).
 */
export type ParsedMessage = {
    speaker: string;
    timestamp?: string;
    text: string;
};
export type ParsedConversation = {
    messages: ParsedMessage[];
    participants: string[];
    normalizedContent: string;
    format: 'timestamped' | 'structured' | 'raw';
};
/**
 * Parse raw conversation text into structured messages with participant extraction.
 *
 * Uses a fallback chain:
 *   1. Structured with timestamps → 2. Structured without → 3. Raw paragraphs
 *
 * Never throws. Always returns a valid ParsedConversation.
 */
export declare function parseConversation(text: string): ParsedConversation;
//# sourceMappingURL=parser.d.ts.map