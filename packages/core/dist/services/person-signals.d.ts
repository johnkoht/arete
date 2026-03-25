/**
 * Person signal extraction: LLM stance extraction and action items with lifecycle.
 *
 * Stance extraction follows the DI pattern from conversations/extract.ts:
 *   buildStancePrompt() → callLLM() → parseStanceResponse()
 *
 * Action item extraction is regex-based with direction classification,
 * staleness detection, capping, and dedup.
 */
/**
 * Function signature for the LLM call.
 * Accepts a prompt string and returns the LLM's text response.
 */
export type LLMCallFn = (prompt: string) => Promise<string>;
/** Direction of a person's stance on a topic. */
export type StanceDirection = 'supports' | 'opposes' | 'concerned' | 'neutral';
/** A stance extracted from meeting content for a specific person. */
export type PersonStance = {
    topic: string;
    direction: StanceDirection;
    summary: string;
    evidenceQuote: string;
    source: string;
    date: string;
};
/**
 * Build the LLM prompt for extracting stances from content for a specific person.
 */
export declare function buildStancePrompt(content: string, personName: string): string;
/**
 * Parse the LLM response into a PersonStance array.
 * Handles various response formats gracefully — never throws.
 */
export declare function parseStanceResponse(response: string): PersonStance[];
/**
 * Extract stances for a specific person from content using an LLM.
 *
 * @param content - Meeting transcript or conversation text
 * @param personName - Name of the person to extract stances for
 * @param callLLM - Function that calls the LLM with a prompt and returns the response
 * @returns Extracted stances — empty array on any error
 */
export declare function extractStancesForPerson(content: string, personName: string, callLLM: LLMCallFn): Promise<PersonStance[]>;
export type ActionItemDirection = 'i_owe_them' | 'they_owe_me';
export type PersonActionItem = {
    text: string;
    direction: ActionItemDirection;
    source: string;
    date: string;
    hash: string;
    stale: boolean;
    /** Optional goal association — links action item to a quarterly goal */
    goalSlug?: string;
    /** Optional area association — domain scoping. Metadata only, NOT part of dedup hash. */
    area?: string;
};
/**
 * Content-normalized dedup hash: sha256(lowercase(trim(text)) + personSlug + direction).
 */
export declare function computeActionItemHash(text: string, personSlug: string, direction: ActionItemDirection): string;
/**
 * Returns true if the action item's source date is older than 30 days
 * relative to `referenceDate` (defaults to now).
 */
export declare function isActionItemStale(item: PersonActionItem, referenceDate?: Date): boolean;
/**
 * Keep most recent N items per direction, sorted by date descending.
 */
export declare function capActionItems(items: PersonActionItem[], maxPerDirection?: number): PersonActionItem[];
/**
 * Merge new items into existing, skipping any with a matching hash.
 */
export declare function deduplicateActionItems(existing: PersonActionItem[], newItems: PersonActionItem[]): PersonActionItem[];
/**
 * Build the LLM prompt for extracting action items / commitments from content
 * for a specific person.
 *
 * @deprecated For meetings, use {@link parseActionItemsFromMeeting} from meeting-parser.ts.
 * This LLM-based extraction path is deprecated. The meeting processing workflow now
 * extracts action items during `arete meeting extract` and saves them to structured
 * `## Action Items` sections, which are parsed by meeting-parser.ts during person
 * memory refresh. This prompt builder is preserved for potential non-meeting sources
 * (conversations, etc.) but should not be used for new meeting workflows.
 */
export declare function buildActionItemPrompt(content: string, personName: string): string;
/**
 * Parse the LLM response into an array of raw action item objects.
 * Handles code fences, extra text, malformed JSON — never throws.
 * Returns objects with text + direction only; caller adds source/date/hash/stale.
 *
 * @deprecated For meetings, use {@link parseActionItemsFromMeeting} from meeting-parser.ts.
 * This LLM response parser is deprecated. Action items are now extracted during meeting
 * processing and stored in structured `## Action Items` sections, which are parsed by
 * meeting-parser.ts. This parser is preserved for potential non-meeting sources but
 * should not be used for new meeting workflows.
 */
export declare function parseActionItemResponse(response: string): Array<{
    text: string;
    direction: ActionItemDirection;
}>;
/**
 * Extract action items for a specific person from meeting content.
 *
 * **LLM Path (deprecated)**: When `callLLM` is provided, uses LLM-based extraction via
 * `buildActionItemPrompt` → `callLLM` → `parseActionItemResponse` to distinguish genuine
 * commitments from descriptions, explanations, and general discussion.
 *
 * **Regex Path (active)**: When `callLLM` is NOT provided, falls back to the existing
 * regex implementation — no silent zero-result regression. This path remains available
 * for non-meeting sources (conversations, etc.).
 *
 * @deprecated The LLM path (when callLLM is provided) is deprecated. For meetings, use
 * {@link parseActionItemsFromMeeting} from meeting-parser.ts. The meeting processing
 * workflow now extracts action items during `arete meeting extract` and saves them to
 * structured `## Action Items` sections. The regex fallback (when callLLM is omitted)
 * remains available for potential non-meeting sources.
 *
 * @param content - Meeting notes/transcript text
 * @param personName - Name of the person to extract items for
 * @param source - Meeting filename
 * @param date - Meeting date (YYYY-MM-DD)
 * @param callLLM - Optional LLM function; when omitted, regex fallback runs (deprecated when provided)
 * @param ownerName - Workspace owner name (from profile.md); enables owner detection (regex path only)
 */
export declare function extractActionItemsForPerson(content: string, personName: string, source: string, date: string, callLLM?: LLMCallFn, ownerName?: string): Promise<PersonActionItem[]>;
//# sourceMappingURL=person-signals.d.ts.map