/**
 * TopicMemoryService — the L3 topic-wiki layer.
 *
 * Responsibilities (split across phased work):
 *  - alias/merge candidate topic slugs from source extraction against
 *    existing topic pages (Step 2 — primary concern of this file today)
 *  - integrateSource: read existing topic page + new source (meeting or
 *    slack-digest) + filter L2 items, ask LLM to rewrite only touched
 *    sections, merge back (Step 3)
 *  - discoverTopicSources / refreshAllFromSources: scan
 *    `resources/meetings/*.md` and `resources/notes/{date}-slack-digest.md`
 *    and integrate each source into every topic page that references it
 *    via frontmatter `topics:`. Both source classes share `parseMeetingFile`
 *    (the parser tolerates the slack-digest frontmatter shape; see
 *    plan `slack-digest-topic-wiki/plan.md` Step 2 and pre-mortem Risk 2).
 *  - listAll / listForArea: read topic pages from storage (needed by
 *    area-memory and CLAUDE.md regen)
 *
 * See plans:
 *  - dev/work/plans/topic-wiki-memory/plan.md (parent build)
 *  - dev/work/plans/slack-digest-topic-wiki/plan.md (slack-digest source class)
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { SearchProvider } from '../search/types.js';
import type { WorkspacePaths } from '../models/workspace.js';
import type { LLMCallFn } from '../integrations/conversations/extract.js';
import { type TopicPage, type TopicPageFrontmatter } from '../models/topic-page.js';
/**
 * Candidate topic as produced by meeting extraction
 * (`meeting-extraction.ts:651` emits `topics: string[]`).
 */
export interface TopicCandidate {
    slug: string;
}
export type AliasDecision = 'coerced' | 'new' | 'ambiguous-resolved-existing' | 'ambiguous-new';
export interface AliasResult {
    input: string;
    resolved: string;
    decision: AliasDecision;
    jaccardScore?: number;
    matchedAgainst?: string;
}
/**
 * Jaccard thresholds for alias decisions.
 *
 * score >= COERCE_THRESHOLD       → auto-coerce to existing slug
 * AMBIGUOUS_LOW <= score < COERCE → LLM adjudication batch
 * score < AMBIGUOUS_LOW           → new topic
 *
 * Thresholds based on pre-mortem Risk 6 guidance:
 * - 0.6 was too loose for 1-4 token slugs (`leap-templates` vs
 *   `leap-email-templates` scored 0.67 and would falsely coerce)
 * - Current default COERCE is 0.67; AMBIGUOUS_LOW 0.4. Band is wide
 *   so LLM adjudication catches asymmetric failure cases. Tuning
 *   data will come from `arete topic seed --dry-run` on real
 *   workspaces.
 */
export declare const COERCE_THRESHOLD = 0.67;
export declare const AMBIGUOUS_LOW_THRESHOLD = 0.4;
/**
 * An existing topic's identity surface for alias matching: its canonical
 * slug + any declared aliases.
 *
 * `lastRefreshed` (YYYY-MM-DD) is sourced from the topic page's
 * frontmatter `last_refreshed` and used by the lexical detector
 * (`detectTopicsLexical`) as a recency tiebreaker on equal scores.
 * Optional — pages without `last_refreshed` continue to work; they
 * just lose the tiebreaker and fall through to the canonical-asc
 * fallback.
 */
export interface TopicIdentity {
    canonical: string;
    aliases: string[];
    lastRefreshed?: string;
}
/**
 * Tokenize a slug for Jaccard comparison.
 * `cover-whale-templates` → `['cover', 'whale', 'templates']`.
 */
export declare function tokenizeSlug(slug: string): string[];
/**
 * Compute the best Jaccard score of a candidate against all identity
 * surfaces of existing topics, returning the winning match.
 *
 * Returns `{ bestScore: 0 }` when there are no existing topics.
 */
export declare function bestAliasMatch(candidate: string, existing: TopicIdentity[]): {
    bestScore: number;
    matchedCanonical?: string;
    matchedSurface?: string;
};
/**
 * Classify a candidate against existing topics using Jaccard thresholds only.
 * Produces an AliasResult for the deterministic band; callers handle the
 * ambiguous band via LLM adjudication.
 */
export declare function classifyByJaccard(candidate: string, existing: TopicIdentity[]): AliasResult;
/**
 * Build the adjudication prompt for the LLM.
 * One prompt per batch of ambiguous candidates; returns JSON.
 *
 * See pre-mortem Risk 4: LLM output validation is load-bearing. The
 * parser below enforces enum keys (existing slug OR literal "NEW") to
 * prevent silent corruption of topic slugs.
 */
export declare function buildAdjudicationPrompt(candidates: Array<{
    input: string;
    bestMatch: string;
}>, existing: TopicIdentity[]): string;
/**
 * Parse the LLM adjudication response and validate against the allowed
 * slug enum (existing canonicals + "NEW"). Returns a map from input →
 * resolved slug. Inputs the LLM failed to classify stay unresolved
 * (caller falls back to treating them as new).
 */
export declare function parseAdjudicationResponse(response: string, validSlugs: Set<string>): Map<string, string>;
export interface AliasAndMergeOptions {
    /**
     * LLM function for adjudicating the 0.4-0.67 ambiguous band. When
     * undefined, ambiguous candidates are treated as new topics
     * (conservative — won't collapse distinct topics, but may allow
     * minor sprawl; lint catches it).
     */
    callLLM?: LLMCallFn;
}
export declare class TopicMemoryService {
    private readonly storage;
    private readonly searchProvider?;
    constructor(storage: StorageAdapter, searchProvider?: SearchProvider);
    /**
     * Read all topic pages from `.arete/memory/topics/*.md`.
     * Returns `{ topics, errors }` — partial-state tolerant per pre-mortem
     * Risk 14. Corrupt pages are logged as errors; valid pages still usable.
     */
    listAll(paths: WorkspacePaths): Promise<{
        topics: TopicPage[];
        errors: Array<{
            path: string;
            reason: string;
        }>;
    }>;
    /**
     * Derive the identity surface (canonical slug + aliases) from existing
     * topic pages.
     */
    static toIdentities(topics: TopicPage[]): TopicIdentity[];
    /**
     * Alias/merge a batch of candidate slugs against existing topics.
     *
     * Pipeline (per plan Step 2):
     *   1. Jaccard classify each candidate → coerced / new / ambiguous
     *   2. Batch all ambiguous candidates into one LLM call (if callLLM)
     *   3. Apply LLM decisions; unclassified ambiguous → new (conservative)
     *
     * Idempotent for identical inputs: returns identical results.
     */
    aliasAndMerge(candidates: string[], existing: TopicIdentity[], options?: AliasAndMergeOptions): Promise<AliasResult[]>;
}
import { type SectionName, type TopicSourceRef } from '../models/topic-page.js';
/**
 * Shape the LLM must return from the integrate-source prompt.
 *
 * Per pre-mortem Risk 4: key-validation is enum-restricted (only
 * known section names accepted; unknown keys dropped silently).
 * `new_change_log_entry` is REQUIRED — an integration that produces
 * no log entry is a malformed response and should fall back.
 */
export interface IntegrateOutput {
    updated_sections: Partial<Record<SectionName, string>>;
    new_change_log_entry: string;
    new_open_questions?: string[];
    new_known_gaps?: string[];
}
/**
 * Parse + validate the LLM's integrate-source JSON response.
 * Returns null when malformed (caller falls back to minimal update path).
 *
 * Invariants enforced (Risk 4 mitigations):
 *  - Section keys restricted to SECTION_NAMES enum
 *  - Section bodies cannot contain raw `---` (would break frontmatter
 *    on next parse)
 *  - Section bodies capped at 8000 chars (prevents LLM echoing the
 *    whole page into one section)
 *  - `new_change_log_entry` required and non-empty
 */
export declare function parseIntegrateResponse(response: string): IntegrateOutput | null;
/**
 * Content-hash a string for idempotency. Low-level primitive; callers
 * should prefer `hashMeetingSource` for any frontmatter-framed source
 * file (meetings AND slack-digests) so frontmatter edits (attendee
 * adds, status changes, post-processing metadata, dedup markers) don't
 * bust dedup.
 */
export declare function hashSource(content: string): string;
/**
 * Hash a topic-source file's body only — excludes frontmatter. Used in
 * `sources_integrated[].hash` so that editing source-file frontmatter
 * does NOT bust topic-page idempotency.
 *
 * Applies to both source classes:
 *  - meetings (`resources/meetings/*.md`): adding an attendee, fixing a
 *    title typo, rewriting the `intelligence` block from re-extraction
 *    leaves the body hash unchanged.
 *  - slack-digests (`resources/notes/{date}-slack-digest.md`): adding
 *    `topics:`, `items_approved`, or sibling-plan dedup metadata to
 *    frontmatter (e.g., `dedup_processed_at`) leaves the body hash
 *    unchanged.
 *
 * Only substantive body changes — the actual transcript, notes, or
 * digest summary — trigger re-integration.
 *
 * For content that isn't a frontmatter-framed file (no `^---\n...\n---`),
 * the raw string is hashed as-is. The function name retains
 * `MeetingSource` for back-compat; consider rename to `hashSourceBody`
 * in a follow-up.
 */
export declare function hashMeetingSource(content: string): string;
/**
 * Apply an `IntegrateOutput` onto an existing topic page, returning the
 * updated page. Pure: no I/O. Caller does the write.
 */
export declare function applyIntegrateOutput(page: TopicPage, output: IntegrateOutput, source: TopicSourceRef, today: string): TopicPage;
/**
 * Build a fallback page update for the no-LLM / malformed-output case.
 * Records the source in `sources_integrated` and appends a minimal
 * Change log + Source trail entry, but does not synthesize narrative.
 * Keeps the topic page retrievable; next refresh can upgrade it.
 */
export declare function applyFallbackUpdate(page: TopicPage, source: TopicSourceRef, today: string, reason: string): TopicPage;
/**
 * Create a stub TopicPage for a freshly-proposed new topic. Empty
 * sections; status=new. Step 3 will populate on first integrateSource.
 */
export declare function createTopicStub(slug: string, today: string, options?: {
    area?: string;
    aliases?: string[];
}): TopicPage;
/**
 * Build the LLM prompt for incremental source integration.
 *
 * Layout:
 *  - Existing page (if any) so the LLM can revise rather than regen
 *  - New source (meeting OR slack-digest content)
 *  - Relevant L2 items (decisions, learnings) — filtered by caller
 *  - Response schema + constraints
 */
export declare function buildIntegratePrompt(topicSlug: string, existingPage: TopicPage | null, newSource: {
    path: string;
    date: string;
    content: string;
}, relevantL2: string): string;
export interface IntegrateSourceOptions {
    callLLM?: LLMCallFn;
    relevantL2?: string;
    today: string;
}
export interface IntegrateResult {
    page: TopicPage;
    decision: 'integrated' | 'fallback' | 'skipped-already-integrated';
    reason?: string;
}
declare module './topic-memory.js' {
    interface TopicMemoryService {
        integrateSource(topicSlug: string, existingPage: TopicPage | null, newSource: {
            path: string;
            date: string;
            content: string;
        }, options: IntegrateSourceOptions): Promise<IntegrateResult>;
    }
}
export interface RefreshBatchOptions {
    callLLM?: LLMCallFn;
    dryRun?: boolean;
    today: string;
    /** Only refresh these slugs; omit for all existing topics. */
    slugs?: string[];
    /**
     * When set, scope source discovery to a single file. The
     * `discoverTopicSources` output is filtered to entries where
     * `entry.path === sourcePath` (exact equality, after both sides are
     * resolved to absolute paths) BEFORE the per-slug source filter
     * runs. Used by the slack-digest skill (Hook 2) to integrate ONLY
     * the just-written digest, not every prior digest tagged with the
     * same slugs.
     *
     * **Must be an absolute path.** If a relative path is passed,
     * `refreshAllFromSources` resolves it against `paths.root` before
     * matching. Path normalization is the caller's responsibility — the
     * service rejects ambiguous suffix matches by design (cost-correct).
     *
     * Pre-mortem Risk 4 / memory bullet 5: this is a behavioral filter,
     * NOT a label-only logging hint. Without it, a workspace with N
     * prior digests tagged `cover-whale-templates` runs N× the user's
     * expected cost.
     */
    sourcePath?: string;
    /**
     * When true, skip acquiring the `.arete/.seed.lock`. Use only when
     * the caller already holds the lock (e.g., `arete topic seed`
     * acquires at the CLI boundary and threads `skipLock: true` so
     * it doesn't double-acquire and EEXIST against itself).
     *
     * Default false — `arete memory refresh` and `arete topic refresh`
     * acquire the lock so concurrent runs (cron + interactive shell)
     * cannot race on topic-page writes.
     */
    skipLock?: boolean;
    /**
     * Workspace root — used to locate `.arete/` for the lock file when
     * `skipLock !== true`. Required unless `skipLock: true`.
     */
    workspaceRoot?: string;
    /**
     * Short label written into the lock file for user-facing diagnosis.
     * Default 'topic refresh'.
     */
    lockLabel?: string;
}
export interface RefreshBatchTopicResult {
    slug: string;
    integrated: number;
    fallback: number;
    skipped: number;
    status: 'ok' | 'no-sources';
}
export interface RefreshBatchResult {
    topics: RefreshBatchTopicResult[];
    totalIntegrated: number;
    totalFallback: number;
    totalSkipped: number;
}
declare module './topic-memory.js' {
    interface TopicMemoryService {
        refreshAllFromSources(paths: import('../models/workspace.js').WorkspacePaths, options: RefreshBatchOptions): Promise<RefreshBatchResult>;
    }
}
/**
 * Source-of-truth filter for slack-digest files in `resources/notes/`.
 * Filename pattern: `YYYY-MM-DD-slack-digest.md`. Files not matching this
 * pattern are ignored (they may be other kinds of notes — capture-conversation
 * outputs, manual notes, etc., none of which contribute to topic narratives).
 *
 * Example matches:
 *  - `2026-04-28-slack-digest.md` → MATCH
 *  - `2026-04-28-capture-acme-call.md` → no match (not a digest)
 *  - `slack-digest-2026-04-28.md` → no match (date prefix is required)
 */
export declare const SLACK_DIGEST_FILENAME_RE: RegExp;
/**
 * Internal type produced by `discoverTopicSources`. Both source classes
 * (meetings + slack-digests) flatten into this shape so
 * `refreshAllFromSources`'s integration loop is source-agnostic.
 */
export interface SourceDiscoveryEntry {
    /** Absolute or workspace-relative path the storage adapter understands. */
    path: string;
    /** YYYY-MM-DD parsed from the filename's `^(\d{4}-\d{2}-\d{2})` prefix. */
    date: string;
    /** Full file content (read once during discovery). */
    content: string;
    /**
     * The source class. Set by which directory the file lives in (NOT by
     * frontmatter parsing): `'meeting'` for files under `resources/meetings/`,
     * `'slack-digest'` for files under `resources/notes/` whose filename
     * matches `SLACK_DIGEST_FILENAME_RE`. The downstream integration path
     * does NOT branch on this field today (both classes share the same
     * `integrateSource` LLM prompt and `hashMeetingSource` content hash) —
     * it exists for telemetry, logging, and any future class-specific
     * routing (e.g., per-class cost accounting).
     */
    type: 'meeting' | 'slack-digest';
    /** Slugs read from frontmatter `topics:` via `parseMeetingFile`. */
    topics: string[];
}
/**
 * Scan both topic-source classes and return parseable entries sorted by
 * `date` ascending (ties broken by `path` ascending, for determinism).
 * The two classes are:
 *  - **meetings**: every `*.md` under `resources/meetings/` whose filename
 *    starts with a `YYYY-MM-DD` prefix.
 *  - **slack-digests**: every `*.md` under `resources/notes/` whose filename
 *    matches `SLACK_DIGEST_FILENAME_RE` (`YYYY-MM-DD-slack-digest.md`).
 *
 * Both classes flatten into the same `SourceDiscoveryEntry` shape so
 * `refreshAllFromSources` can iterate them uniformly. Single-pass discovery
 * is shared by `arete topic refresh --all` and `arete memory refresh` to
 * avoid duplicate FS walks.
 *
 * Tolerant by design:
 *  - Missing `meetings/` dir → no meeting entries (no throw).
 *  - Missing `notes/` dir → no slack-digest entries (no throw).
 *  - Files that fail filename pattern, parse, or read → skipped silently
 *    (warn-and-continue is reserved for the belt-and-suspenders frontmatter
 *    `type:` check below; parser failures are common-enough that warning
 *    spam isn't useful).
 *  - A file in `notes/` whose frontmatter `type:` is set but is NOT
 *    `slack-digest` emits one warn line and is skipped (sanity check;
 *    primary filter remains the filename regex).
 */
export declare function discoverTopicSources(paths: WorkspacePaths, storage: StorageAdapter): Promise<SourceDiscoveryEntry[]>;
/**
 * Cost estimate helper — rough Haiku cost per (topic, source) integration,
 * where `source` is a meeting or slack-digest. Used by CLI for `--dry-run`
 * and `--confirm` prompts.
 */
export declare const ESTIMATED_USD_PER_INTEGRATION = 0.015;
/**
 * Per-topic health signal surfaced by `arete status`. Mirrors the
 * `AreaMemoryService.listAreaMemoryStatus` shape so the CLI can apply
 * uniform formatting across areas and topics.
 *
 * - `stale`: `last_refreshed` older than staleDays (default 60)
 * - `stub`: Current state section missing or empty (topic page exists
 *   but narrative was never populated)
 * - `orphan`: zero inbound `[[slug]]` references from any other topic
 */
export interface TopicMemoryStatus {
    slug: string;
    lastRefreshed: string;
    daysOld: number;
    stale: boolean;
    stub: boolean;
    orphan: boolean;
}
export interface ListTopicMemoryStatusOptions {
    /** Days since last_refreshed that marks a topic stale. Default 60. */
    staleDays?: number;
    /** Reference date for staleness calc. Default `new Date()`. */
    today?: Date;
}
declare module './topic-memory.js' {
    interface TopicMemoryService {
        listTopicMemoryStatus(paths: import('../models/workspace.js').WorkspacePaths, options?: ListTopicMemoryStatusOptions): Promise<TopicMemoryStatus[]>;
    }
}
export declare function estimateRefreshCostUsd(totalIntegrations: number): number;
export interface RetrieveRelevantOptions {
    /** Limit top-k results returned after re-ranking. Default 3. */
    limit?: number;
    /** Optional area bias — matching topics get +0.1 rank bonus. */
    area?: string;
    /** Word budget for `bodyForContext` per topic. Default 1000. */
    budgetWords?: number;
}
export interface TopicPageContext {
    slug: string;
    frontmatter: TopicPageFrontmatter;
    bodyForContext: string;
    score: number;
}
/**
 * Result envelope for `retrieveRelevant`. Distinguishes genuine empty
 * results from degraded capability (no search provider available), so
 * callers can decide whether to fall back to atomic L2 search or warn.
 */
export interface RetrieveRelevantResult {
    results: TopicPageContext[];
    /**
     * Which search backend produced these results:
     *  - 'qmd'      — semantic search via qmd CLI
     *  - 'fallback' — token-based search (no embeddings)
     *  - 'none'     — no search provider configured; results is always []
     */
    searchBackend: 'qmd' | 'fallback' | 'none';
}
declare module './topic-memory.js' {
    interface TopicMemoryService {
        retrieveRelevant(query: string, options?: RetrieveRelevantOptions): Promise<RetrieveRelevantResult>;
    }
}
//# sourceMappingURL=topic-memory.d.ts.map