/**
 * Meeting intelligence extraction via LLM.
 *
 * Extracts structured intelligence from meeting transcripts:
 *   - summary, action items, next steps, decisions, learnings
 *
 * Uses the same DI pattern as person-signals.ts:
 *   buildMeetingExtractionPrompt() → callLLM() → parseMeetingExtractionResponse()
 *
 * Aggressive validation rejects garbage:
 *   - Action items > 150 chars
 *   - Items starting with "Me:", "Them:", "Yeah", "I'm not sure"
 *   - Items with multiple sentences (more than one period)
 */
/**
 * Function signature for the LLM call.
 * Accepts a prompt string and returns the LLM's text response.
 */
export type LLMCallFn = (prompt: string) => Promise<string>;
/** Direction of an action item relative to the owner. */
export type ActionItemDirection = 'i_owe_them' | 'they_owe_me';
/** A structured action item extracted from a meeting. */
export type ActionItem = {
    owner: string;
    ownerSlug: string;
    description: string;
    direction: ActionItemDirection;
    counterpartySlug?: string;
    due?: string;
    /** LLM confidence score (0-1) for this item. */
    confidence?: number;
};
/** Full meeting intelligence extracted from a transcript. */
export type MeetingIntelligence = {
    summary: string;
    actionItems: ActionItem[];
    nextSteps: string[];
    decisions: string[];
    learnings: string[];
};
/** Validation warning for rejected items. */
export type ValidationWarning = {
    item: string;
    reason: string;
};
/** Raw item before validation filtering (for debugging/analysis). */
export type RawExtractedItem = {
    type: 'action' | 'decision' | 'learning';
    text: string;
    owner?: string;
    direction?: string;
    confidence?: number;
};
/** Result of parsing extraction response (includes validation warnings). */
export type MeetingExtractionResult = {
    intelligence: MeetingIntelligence;
    validationWarnings: ValidationWarning[];
    /** All items parsed from LLM response before validation filtering (for debugging). */
    rawItems: RawExtractedItem[];
};
/**
 * Build the LLM prompt for extracting meeting intelligence.
 *
 * @param transcript - Meeting transcript text
 * @param attendees - List of attendee names (optional, for context)
 * @param ownerSlug - Workspace owner's slug (for direction classification)
 */
export declare function buildMeetingExtractionPrompt(transcript: string, attendees?: string[], ownerSlug?: string): string;
/**
 * Parse the LLM response into a MeetingExtractionResult.
 * Handles various response formats gracefully — never throws.
 * Returns validation warnings for rejected items.
 */
export declare function parseMeetingExtractionResponse(response: string): MeetingExtractionResult;
/**
 * Extract meeting intelligence from a transcript using an LLM.
 *
 * @param transcript - The meeting transcript text
 * @param callLLM - Function that calls the LLM with a prompt and returns the response
 * @param options - Optional attendees and ownerSlug for better context
 * @returns Extracted intelligence with validation warnings — empty on error
 */
export declare function extractMeetingIntelligence(transcript: string, callLLM: LLMCallFn, options?: {
    attendees?: string[];
    ownerSlug?: string;
}): Promise<MeetingExtractionResult>;
/**
 * Format extraction result as markdown sections.
 * IDs are zero-padded 3 digits (ai_001, de_001, le_001).
 * Empty sections are omitted entirely.
 *
 * @param result - The meeting extraction result containing structured intelligence
 * @returns Formatted markdown string with Summary and staged sections
 */
export declare function formatStagedSections(result: MeetingExtractionResult): string;
/**
 * Replace or insert staged sections in meeting content.
 * Preserves content before ## Summary and after staged sections.
 *
 * @param originalContent - The original meeting file content
 * @param stagedSections - The formatted staged sections to insert
 * @returns Updated content with staged sections replaced/inserted
 */
export declare function updateMeetingContent(originalContent: string, stagedSections: string): string;
//# sourceMappingURL=meeting-extraction.d.ts.map