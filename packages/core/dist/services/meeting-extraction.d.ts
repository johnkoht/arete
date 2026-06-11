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
/**
 * Direction of an action item relative to the owner.
 *
 * `'none'` (single-pass D3): team-internal / not-owner-relative. Only emitted
 * by the single_pass pipeline; legacy parsing still rejects it. `none` items
 * NEVER become commitments (D7) — they stage for visibility only.
 */
export type ActionItemDirection = 'i_owe_them' | 'they_owe_me' | 'none';
/**
 * Importance tier (single-pass D3). Tier — not confidence — drives
 * auto-approval in single_pass mode: only `blocker` may auto-approve
 * (pre-mortem risk 1).
 */
export type ItemImportance = 'blocker' | 'high' | 'normal';
/**
 * Judgment metadata shared by all single-pass item kinds (D3).
 * All fields optional — absent on legacy extractions, which keeps old
 * parsers/consumers bit-identical.
 */
export type ItemJudgment = {
    importance?: ItemImportance;
    /** The ⚠ channel — model self-flagged uncertainty. Always stages pending. */
    uncertain?: boolean;
    uncertaintyReason?: string;
    /** Claim: this item continues an existing tracked item/commitment (id or text ref). */
    continuationOf?: string;
    /** Claim: this item supersedes a prior item/decision (id or text ref). */
    supersedes?: string;
};
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
} & ItemJudgment;
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
    /**
     * Free-form prose lead — most actionable / decided / changed thing surfaced
     * by the LLM. Preferred over `summary` when present (callers in Tasks 8/10).
     * Sanitized of raw `---` lines before assignment to prevent YAML doc-separator
     * injection in downstream frontmattered files (R7 mitigation).
     */
    core?: string;
    /**
     * Up to 8 informative one-line headlines for side threads worth knowing
     * about. Ordered by importance. Each headline is self-contained. Sanitized
     * of raw `---` lines per entry (R7 mitigation).
     */
    could_include?: string[];
    /**
     * Open questions raised but not resolved in the meeting (single-pass D3).
     * Feeds the wiki Open Questions surface (full wiring deferred to F2 —
     * persist-don't-render-everywhere interim). Absent on legacy extractions.
     */
    openQuestions?: string[];
    /** Judgment metadata for decisions, parallel array indexed same as decisions. */
    decisionMeta?: (ItemJudgment | undefined)[];
    /** Judgment metadata for learnings, parallel array indexed same as learnings. */
    learningMeta?: (ItemJudgment | undefined)[];
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
/**
 * Telemetry event from a mechanical detector running in log-only mode
 * (single-pass D4). In single_pass mode the legacy filters/caps no longer
 * gate items — they fire these events instead, which flow to the item-fates
 * stream. Detectors are PERMANENT drift telemetry (2026-06-11 adjudication):
 * if silent, demote to sampled logging, never delete.
 */
export type ExtractionTelemetryEvent = {
    detector: 'garbage_prefix' | 'length_limit' | 'multi_sentence' | 'trivial_pattern' | 'invalid_direction' | 'mirror_pair' | 'near_duplicate' | 'category_limit' | 'unparseable_item';
    itemType: 'action' | 'decision' | 'learning' | 'open_question';
    /** Preview of the flagged item's text (truncated). */
    item: string;
    detail: string;
};
/** Result of parsing extraction response (includes validation warnings). */
export type MeetingExtractionResult = {
    intelligence: MeetingIntelligence;
    validationWarnings: ValidationWarning[];
    /** All items parsed from LLM response before validation filtering (for debugging). */
    rawItems: RawExtractedItem[];
    /**
     * Detector telemetry (single_pass mode only — D4 log-only flip). Absent in
     * legacy mode so legacy result shape is unchanged.
     */
    telemetryEvents?: ExtractionTelemetryEvent[];
};
/**
 * Strip line-start `---` separators that would corrupt downstream frontmatter
 * parsing if these LLM-generated strings get written into a YAML-frontmattered
 * file (e.g., a meeting markdown's staged section). Pure helper; safe to call
 * on any string.
 *
 * Returns the sanitized string and the count of stripped lines (callers may
 * log a warning when count > 0). Lines matching `^---\s*$` are removed
 * entirely (the line and its trailing newline).
 *
 * Pre-mortem R7 mitigation. See also `parseIntegrateResponse` in
 * `topic-memory.ts:475`, which DROPS the entire field instead — we strip
 * here because rejecting `core`/`could_include[]` outright would cause the
 * extraction to silently lose lead-prose content; the LLM is the author and
 * a noisy doc-separator is more often a formatting accident than a malicious
 * payload.
 */
export declare function stripYamlDocSeparator(s: string): {
    sanitized: string;
    stripped: number;
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
/**
 * Jaccard threshold for mirror-pair detection (Phase 8 followup-6).
 *
 * Tighter than the general dedup threshold because mirror-pair pathology is
 * "identical or near-identical" (the LLM is emitting the SAME compound sentence
 * split into two opposite-direction rows — observed Jaccard ≥0.95 in the
 * structural-failure case). 0.90 is the post-review-1 revision (was 0.85);
 * tighter threshold = fewer false-positives on legitimate bilateral pairs at
 * minimal catch-rate cost. If AC5 eval reveals <100% catch at 0.90, ratchet
 * down with logged rationale.
 */
export declare const MIRROR_PAIR_JACCARD_THRESHOLD = 0.9;
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
 * Detect and drop mirror-pair duplicate action items (Phase 8 followup-6).
 *
 * A "mirror pair" is the LLM emitting TWO `action_items[]` entries from a
 * single compound transcript sentence — one `i_owe_them` and one
 * `they_owe_me`, identical or near-identical `description`, different
 * `owner_slug`. The extraction prompt now has Pattern 4 to prevent this
 * upstream (AC1), but this deterministic post-LLM pass catches anything that
 * leaks through. See plan: phase-8-followup-6-direction-parser/plan.md.
 *
 * Pair detection criteria (ALL must hold):
 *   1. `a.direction !== b.direction` (opposite directions),
 *   2. `a.ownerSlug !== b.ownerSlug` (different owners — same-owner same-text
 *      same-direction is handled by `deduplicateItems`),
 *   3. `jaccardSimilarity(normalize(a.description), normalize(b.description))
 *       >= MIRROR_PAIR_JACCARD_THRESHOLD` (0.90).
 *
 * Canonical selection (run in order — first match wins, per pre-mortem R5):
 *   a. **Verbatim-actor heuristic.** If exactly one item's description begins
 *      with the owner's slug-stem (e.g., "john-koht" → /^john\b/i), that item
 *      is canonical. This aligns with Areté's verbatim-action prompt
 *      convention ("<Owner> to ..." / "<Owner> will ..."). Most reliable
 *      signal when both slugs are non-owner.
 *   b. **Workspace-owner-match.** If exactly one of the two slugs equals the
 *      workspace `ownerSlug`, keep that item — it represents the user's
 *      direct commitment. (When the owner has direction `i_owe_them`, this
 *      is the user's actionable commitment; when `they_owe_me`, it's still
 *      the user's tracked expectation.)
 *   c. **Arbitrary (keep `a`).** Ambiguous — neither verbatim-actor nor
 *      owner-match can pick. Keep the first occurrence; both items get
 *      logged to `validationWarnings` so the user can review.
 *
 * Every drop is logged to `validationWarnings[]` with
 * `reason: 'mirror-pair duplicate (kept canonical)'` so the user sees what
 * was suppressed in the chef-curated view (pre-mortem R1 mitigation).
 *
 * Pure function; no I/O. O(n^2) over `items` — fine for n ≤ ~20.
 *
 * @param items - Action items to dedup (typically post-validation, pre-`deduplicateItems`)
 * @param ownerSlug - Workspace owner slug for owner-match heuristic (optional)
 * @returns Kept items + dropped pair-mates with reasons
 */
export declare function dedupMirrorPairs(items: ActionItem[], ownerSlug?: string): {
    kept: ActionItem[];
    dropped: Array<{
        item: ActionItem;
        reason: string;
        canonicalDescription: string;
    }>;
};
/**
 * Char budget for the rendered topic-wiki context block.
 *
 * Mirrors the `MAX_EXCLUSION_CHARS = 4000` precedent. Roughly 1.5K tokens.
 * When a rendered `topicWikiContext` exceeds this, `truncateTopicWikiContextToBudget`
 * applies a tiered truncation that preserves the highest-scored topic.
 */
export declare const MAX_TOPIC_WIKI_CONTEXT_CHARS = 6000;
/**
 * Prose preamble for the active-topic-slug bias block injected into extraction
 * prompts. Byte-stable text — when present, the prompt appends a blank line,
 * the rendered slug list (`renderActiveTopicsAsSlugList(getActiveTopics(...))`),
 * and a closing newline.
 *
 * **Exported for skill-drift tests, not for reuse.** Internal callers should
 * use the prompt builders that already embed it; the only legitimate external
 * reader is `packages/core/test/runtime/slack-digest-bias-block.test.ts`,
 * which asserts byte-equality between this constant and the matching block in
 * `packages/runtime/skills/slack-digest/SKILL.md` (between
 * `<!-- BIAS_BLOCK_START -->` and `<!-- BIAS_BLOCK_END -->` markers).
 *
 * **Load-bearing constant — do not edit lightly.** Editing this constant
 * requires a parallel edit to SKILL.md or the drift test will fail. The
 * slack-digest skill uses the SKILL.md copy verbatim to bias its per-thread
 * topic extraction with the same wording the meeting-extraction prompt uses.
 */
export declare const TOPIC_BIAS_BLOCK_PROMPT = "**Prefer these existing topic slugs when applicable.** Only propose a new slug\nwhen the meeting is substantively about something not covered. Matching an\nexisting slug keeps knowledge compounding instead of sprawling:";
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
        /**
         * `last_refreshed` from the topic page frontmatter (wiki-repair W5).
         * Rendered under the `### [[slug]]` heading so the extraction LLM —
         * and anyone reading the prompt — sees page age.
         */
        lastRefreshed?: string;
        /** True when the page is >60 days old (or its date is unparseable). */
        stale?: boolean;
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
 * Pre-rendered Layer-1 context blocks for the single-pass prompt. All
 * optional; absent blocks are simply omitted. Assembled by the caller (CLI /
 * winddown path) so this module stays storage-free.
 */
export type SinglePassContextSections = {
    /** "Who John is / how direction works" — enables `direction: none`. */
    identityFrame?: string;
    /**
     * Open commitments filtered to present counterparties — dedup at source:
     * the model marks `continuation_of` instead of re-emitting.
     */
    openCommitments?: string;
    /** Prior same-series meetings' items + open questions (W1.5 resolver). */
    seriesContext?: string;
};
/**
 * Build the single-pass "known items" section (W2 — review finding 1).
 *
 * REPLACES `buildExclusionListSection`'s "SKIP these" framing in single_pass
 * mode with **mark-don't-skip**: prior items are presented as already-known;
 * the model RE-EMITS matching items WITH `continuation_of`/`supersedes`
 * markers and never omits a superseding item. This is what keeps same-day
 * supersession arcs alive for the day-level reconcile (CHR D3/D4/AC3 — the
 * Anthony de_002 → workshop de_004 fixture).
 *
 * Same sources and budgets as the exclusion list (priorItems +
 * recentDecisions/recentLearnings, MAX_EXCLUSION_CHARS, 10/category).
 * Legacy mode keeps `buildExclusionListSection` untouched.
 */
export declare function buildKnownItemsSection(context?: MeetingContextBundle, priorItems?: PriorItem[]): string;
/**
 * Build the single-pass extraction prompt (W2 — judgment-first).
 *
 * Replaces the accreted IS/IS-NOT pattern lists with the benchmark prompt
 * shape that recovered 5/5 audited misses + 17/17 staged items on the
 * compliance transcript: closeability rule, one-utterance-one-type,
 * ⚠-if-unsure, importance tiers with blocker cues, open questions, direction
 * `none`, continuation/supersedes markers, "don't pad". Keeps the parts of
 * the legacy prompt that carry the win: topic-wiki context + delta directive
 * (incl. the open-question-resolution escape hatch), topic-bias block, and
 * the meeting-context bundle (attendee stances / goals / agenda / area).
 *
 * Layer-1 context blocks (identity frame, open commitments, series context)
 * arrive pre-rendered via `sections` — assembled by the caller.
 *
 * Only used when `extraction_mode: single_pass`; the legacy
 * `buildMeetingExtractionPrompt` is untouched.
 */
export declare function buildSinglePassExtractionPrompt(transcript: string, opts?: {
    attendees?: string[];
    ownerSlug?: string;
    ownerName?: string;
    context?: MeetingContextBundle;
    priorItems?: PriorItem[];
    activeTopicSlugs?: string;
    sections?: SinglePassContextSections;
}): string;
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
 * @param ownerSlug - Optional workspace owner slug; used by the mirror-pair
 *                    dedup pass (Phase 8 followup-6) to break ties between
 *                    candidate canonical items.
 * @param opts.singlePass - single-pass mode (W1/W3): accepts the new schema
 *   (importance tiers, ⚠ fields, direction `none`, open_questions,
 *   continuation/supersedes markers), applies NO category caps, and flips
 *   every mechanical filter (garbage/trivial/mirror-pair/near-dup) to
 *   telemetry-only — items are kept and the detector fires an
 *   `ExtractionTelemetryEvent` instead (D4). Legacy path (default) is
 *   bit-identical to the pre-W1 behavior.
 */
export declare function parseMeetingExtractionResponse(response: string, limits?: CategoryLimits, ownerSlug?: string, opts?: {
    singlePass?: boolean;
}): MeetingExtractionResult;
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
    /**
     * single-pass extraction (W1/W2/W3): judgment-first prompt + new schema,
     * no caps, detectors telemetry-only. Driven by `extraction_mode:
     * single_pass` in arete.yaml. Default false = legacy, bit-identical.
     */
    singlePass?: boolean;
    /**
     * Pre-rendered Layer-1 context blocks for the single-pass prompt
     * (identity frame, open commitments, series context, known-items
     * mark-don't-skip). Built by the caller (CLI) via
     * `buildSinglePassContextSections`. Ignored in legacy mode.
     */
    singlePassContext?: SinglePassContextSections;
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
 * Extractor-written headers that only exist in single_pass mode (W1/W3).
 * Deliberately NOT in the legacy STAGED_HEADERS set: a legacy-mode
 * re-extract must never strip a USER-authored "## Open Questions" section
 * (legacy bit-identical invariant). single_pass callers pass these via
 * `updateMeetingContent`'s `extraStagedHeaders`.
 */
export declare const SINGLE_PASS_STAGED_HEADERS: readonly ["Open Questions", "Parser-flagged (mirror-pair suspects)"];
/**
 * Replace or insert staged sections in meeting content.
 * Preserves content before the lead-prose heading (## Summary or ## Core)
 * and content after staged sections. Accepts either heading as the anchor
 * so files written under the new wiki-aware shape are correctly rewritten
 * on subsequent passes (Task 8 / Decision #7).
 *
 * @param originalContent - The original meeting file content
 * @param stagedSections - The formatted staged sections to insert
 * @param extraStagedHeaders - Additional extractor-owned headers to treat as
 *   staged (single_pass passes SINGLE_PASS_STAGED_HEADERS so its own
 *   `## Open Questions` / `## Parser-flagged` sections are replaced on
 *   re-extract; legacy callers omit this and user sections with those names
 *   are preserved as before)
 * @returns Updated content with staged sections replaced/inserted
 */
export declare function updateMeetingContent(originalContent: string, stagedSections: string, extraStagedHeaders?: readonly string[]): string;
//# sourceMappingURL=meeting-extraction.d.ts.map