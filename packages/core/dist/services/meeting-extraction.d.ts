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
 *
 * Context-enhanced extraction (T2):
 *   When a MeetingContextBundle is provided, the prompt is enhanced with:
 *   - Resolved attendee info (stances, open items) for better owner resolution
 *   - Related goals for context-aware extraction
 *   - Unchecked agenda items that become action item candidates
 */
import type { MeetingContextBundle } from './meeting-context.js';
/**
 * Function signature for the LLM call.
 * Accepts a prompt string and returns the LLM's text response.
 */
export type LLMCallFn = (prompt: string) => Promise<string>;
/** Extraction mode determining prompt style and category limits. */
export type ExtractionMode = 'light' | 'normal' | 'thorough';
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
/** Item from a prior meeting in the same processing batch, used for deduplication. */
export interface PriorItem {
    type: 'action' | 'decision' | 'learning';
    text: string;
    source?: string;
}
/** Full meeting intelligence extracted from a transcript. */
export type MeetingIntelligence = {
    summary: string;
    actionItems: ActionItem[];
    nextSteps: string[];
    decisions: string[];
    learnings: string[];
    /** Confidence scores for decisions, parallel array indexed same as decisions. undefined = not provided by LLM. */
    decisionConfidences?: (number | undefined)[];
    /** Confidence scores for learnings, parallel array indexed same as learnings. undefined = not provided by LLM. */
    learningConfidences?: (number | undefined)[];
    /** Slugified topic keywords (e.g. 'email-templates', 'q2-planning'). 3–6 items. */
    topics?: string[];
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
/** Category limits: max items per category (keep first N in LLM response order). */
export declare const CATEGORY_LIMITS: {
    actionItems: number;
    decisions: number;
    learnings: number;
};
/** Light mode limits: summary + minimal learnings only. */
export declare const LIGHT_LIMITS: {
    actionItems: number;
    decisions: number;
    learnings: number;
};
/** Thorough mode limits: higher caps for comprehensive extraction. */
export declare const THOROUGH_LIMITS: {
    actionItems: number;
    decisions: number;
    learnings: number;
};
/** Type for category limits. */
export type CategoryLimits = typeof CATEGORY_LIMITS;
export { normalizeForJaccard, jaccardSimilarity } from '../utils/similarity.js';
/**
 * Check if a decision matches trivial patterns.
 * Safety: patterns do NOT match items containing decision verbs.
 */
export declare function isTrivialDecision(text: string): string | null;
/**
 * Check if a learning matches trivial patterns.
 */
export declare function isTrivialLearning(text: string): string | null;
/**
 * Char budget for the rendered topic-wiki context block.
 *
 * Mirrors the `MAX_EXCLUSION_CHARS = 4000` precedent. Roughly 1.5K tokens.
 * When a rendered `topicWikiContext` exceeds this, `truncateTopicWikiContextToBudget`
 * applies a tiered truncation that preserves the highest-scored topic.
 */
export declare const MAX_TOPIC_WIKI_CONTEXT_CHARS = 6000;
/**
 * Shape of the topic-wiki context piped through `MeetingContextBundle.topicWikiContext`.
 *
 * **Array order encodes priority**: `detectedTopics[0]` is the highest-scored topic
 * (per `detectTopicsLexical`'s sort order — score desc, lastRefreshed desc, slug asc),
 * the last element is the lowest-scored. The truncation helper relies on this
 * invariant — never reshuffle the array without updating both helpers.
 */
export type TopicWikiContext = {
    detectedTopics: Array<{
        slug: string;
        sections: string;
        l2Excerpts: string[];
    }>;
};
/**
 * Render the topic-wiki context section for the extraction prompt.
 *
 * Each detected topic produces a `### [[<slug>]]` block with its pre-rendered
 * sections (Task 5: emit verbatim — already rendered by `renderForExtractionContext`),
 * followed by a "Prior captured items" bullet list of L2 excerpts when present.
 * The "Prior captured items" line is omitted entirely when `l2Excerpts` is empty.
 *
 * Returns an empty string (no `## Topic Wiki` heading) when:
 *   - `ctx` is undefined
 *   - `ctx.detectedTopics` is empty
 *
 * The caller (`buildMeetingExtractionPrompt`) inserts the result between
 * `enhancedContext` and `exclusionList`. The companion delta-only directive,
 * inserted earlier in the prompt, references this section by name.
 */
export declare function buildTopicWikiContextSection(ctx?: TopicWikiContext): string;
/**
 * Apply tiered truncation so that `buildTopicWikiContextSection(ctx)` fits in `maxChars`.
 *
 * Truncation tiers (applied in sequence until rendered length ≤ `maxChars`):
 *   1. Drop OLDEST L2 excerpts within each topic, round-robin (preserve newest).
 *      L2 excerpts are pre-formatted `${date}: ${content}` strings produced by
 *      Task 5; we treat them as opaque strings ordered newest-first (excerpts[0]
 *      is newest), so dropping from the END of each excerpt array drops oldest.
 *   2. Halve the LONGEST topic page `sections` string, slicing on a `\n` boundary
 *      at-or-before the half-length mark so the output stays parseable.
 *   3. Drop the LOWEST-SCORED topic (last element of `detectedTopics`).
 *   4. The HIGHEST-SCORED topic (`detectedTopics[0]`) is never dropped.
 *
 * Returns the truncated context plus the rendered char count for telemetry/tests.
 * Never mutates the input.
 */
export declare function truncateTopicWikiContextToBudget(ctx: TopicWikiContext, maxChars: number): {
    ctx: TopicWikiContext;
    totalChars: number;
};
/**
 * Merge wiki-detected topic slugs into a pre-rendered active-topics slug list.
 *
 * The active-topics list (built via `renderActiveTopicsAsSlugList`) is one entry
 * per line in the form `<slug> — <status>: <summary>`. Wiki-detected slugs only
 * have a slug (no status, no summary), so they're appended as bare-slug lines.
 * Slugs already present in the active list are skipped — first-line-token compare,
 * trim-tolerant, prevents duplicate entries.
 *
 * Returns the merged string, or `undefined` when both inputs are empty (so the
 * "Prefer these existing topic slugs" block continues to be omitted entirely).
 */
export declare function mergeDetectedSlugsIntoActiveList(activeTopicSlugs: string | undefined, detectedSlugs: string[] | undefined): string | undefined;
/**
 * Build exclusion list section for deduplication.
 * Groups items by type (action items, decisions, learnings) with positive "SKIP" framing.
 * Includes UPDATE exception for changed items.
 *
 * Sources:
 * - priorItems → use item.source if available, else "Prior Meeting"
 * - context.relatedContext.recentDecisions → use "Recent Decision"
 * - context.relatedContext.recentLearnings → use "Recent Learning"
 *
 * @param context - Optional MeetingContextBundle with recentDecisions/recentLearnings
 * @param priorItems - Items already extracted from earlier meetings in a batch
 * @returns Exclusion list section string, empty if no items
 */
export declare function buildExclusionListSection(context?: MeetingContextBundle, priorItems?: PriorItem[]): string;
/**
 * Build the LLM prompt for extracting meeting intelligence.
 *
 * @param transcript - Meeting transcript text
 * @param attendees - List of attendee names (optional, for context)
 * @param ownerSlug - Workspace owner's slug (for direction classification)
 * @param context - Optional MeetingContextBundle for enhanced extraction
 * @param priorItems - Items already extracted from earlier meetings in a batch (for deduplication)
 * @param ownerName - Owner's full name for speaking ratio and owner synthesis
 * @param activeTopicSlugs - Pre-rendered slug list (`slug — status: summary` per line)
 *   from `renderActiveTopicsAsSlugList(getActiveTopics(topics))`. When provided,
 *   the extraction prompt instructs the LLM to prefer existing slugs at propose-
 *   time, biasing against topic sprawl. This is the first line of defense against
 *   duplicate topics; Jaccard + LLM alias adjudication at meeting-apply is the
 *   backstop. Bare slugs, no wikilinks — `[[...]]` in the prompt would leak
 *   into the JSON `topics[]` output.
 */
export declare function buildMeetingExtractionPrompt(transcript: string, attendees?: string[], ownerSlug?: string, context?: MeetingContextBundle, priorItems?: PriorItem[], ownerName?: string, activeTopicSlugs?: string): string;
/**
 * Build a lightweight LLM prompt for minimal extraction.
 * ~50% shorter than normal prompt, focused on summary + domain learnings.
 *
 * Used for light-importance meetings where full extraction is overhead.
 *
 * @param transcript - Meeting transcript text
 */
export declare function buildLightExtractionPrompt(transcript: string): string;
/**
 * Parse the LLM response into a MeetingExtractionResult.
 * Handles various response formats gracefully — never throws.
 * Returns validation warnings for rejected items.
 *
 * @param response - Raw LLM response text
 * @param limits - Optional category limits (defaults to CATEGORY_LIMITS for normal mode)
 */
export declare function parseMeetingExtractionResponse(response: string, limits?: CategoryLimits): MeetingExtractionResult;
/**
 * Extract meeting intelligence from a transcript using an LLM.
 *
 * @param transcript - The meeting transcript text
 * @param callLLM - Function that calls the LLM with a prompt and returns the response
 * @param options - Optional attendees, ownerSlug, context, priorItems, and mode for extraction
 * @returns Extracted intelligence with validation warnings — empty on error
 */
export declare function extractMeetingIntelligence(transcript: string, callLLM: LLMCallFn, options?: {
    attendees?: string[];
    ownerSlug?: string;
    context?: MeetingContextBundle;
    priorItems?: PriorItem[];
    /** Extraction mode: 'light' for minimal, 'normal' (default), 'thorough' for comprehensive */
    mode?: ExtractionMode;
    /** Owner's full name for speaking ratio */
    ownerName?: string;
    /**
     * Pre-rendered active-topic slug list (bare slugs, no wikilinks) for
     * biasing the extraction LLM toward reusing existing topic slugs.
     * Build via `renderActiveTopicsAsSlugList(getActiveTopics(topics))`.
     * When present, injected after the JSON schema. See
     * `meeting-extraction.ts:buildMeetingExtractionPrompt` for the
     * full rationale.
     */
    activeTopicSlugs?: string;
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