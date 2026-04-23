/**
 * Active topics data primitive + view renderers.
 *
 * Shared between:
 *   - CLAUDE.md generator (renders `## Active Topics` wikilink list)
 *   - Meeting-extraction prompt bias (bare-slug list for LLM proposal input)
 *
 * One data source (`getActiveTopics`) feeds both views. Renderers are
 * view-specific so that wikilinks don't leak `[[...]]` into the
 * extraction LLM's JSON output (see plan §9.6 and Step 7 review).
 *
 * Pure — no I/O, no clock reads unless explicitly injected.
 */
import { type TopicPage } from './topic-page.js';
export interface ActiveTopicEntry {
    slug: string;
    area?: string;
    status: string;
    summary: string;
    lastRefreshed: string;
}
export interface GetActiveTopicsOptions {
    /** Maximum entries returned. Default 25. */
    limit?: number;
    /**
     * Reference date for recency filtering. Default: new Date().
     * Injectable for deterministic tests.
     */
    today?: Date;
    /**
     * Only include topics with `last_refreshed` within this many days.
     * Topics outside the window are excluded. Default 90.
     */
    recencyDays?: number;
    /**
     * Optional per-topic "open items" lookup. Supplies `openItems` so the
     * sort can weight active work. When omitted, all topics sort with
     * open_items = 0 (tie on openItems falls through to lastRefreshed DESC).
     */
    openItemsBySlug?: Map<string, number>;
}
/**
 * Select + sort active topics for the boot-context Active Topics block.
 *
 * Filter: include only topics whose `openItems > 0` OR whose
 * `last_refreshed` is within `recencyDays` (default 90).
 *
 * Sort: `(openItems desc, lastRefreshed desc, slug asc)` — deterministic
 * slug tiebreak keeps output stable across refreshes when everything
 * else is equal. No `localeCompare`, no `Intl.Collator` — plain string
 * comparison for locale independence.
 */
export declare function getActiveTopics(topics: TopicPage[], options?: GetActiveTopicsOptions): ActiveTopicEntry[];
/**
 * Render active topics as an Obsidian-style wikilink list for CLAUDE.md.
 *
 * Format (per entry):
 *   `- [[slug]] (area) — status — summary`
 *
 * Used by the CLAUDE.md generator. Skills resolving `[[slug]]` at
 * attention time navigate directly to the topic page.
 */
export declare function renderActiveTopicsAsWikilinks(entries: ActiveTopicEntry[]): string;
/**
 * Render active topics as a bare-slug list for the extraction-prompt
 * bias. **Intentionally strips wikilinks** — an LLM seeing `[[slug]]`
 * in a prompt tends to echo `[[...]]` back in its JSON output, corrupting
 * downstream topic frontmatter (reviewer §6 of Step 9 doc review).
 *
 * Format (per entry):
 *   `<slug> — <status>: <summary>`
 */
export declare function renderActiveTopicsAsSlugList(entries: ActiveTopicEntry[]): string;
/**
 * Compute the effective `last_refreshed` display date for the Active
 * Topics section header. Takes the max across entries so the header is
 * data-derived (stable under wall-clock drift).
 *
 * Returns empty string when there are no entries.
 */
export declare function maxLastRefreshed(entries: ActiveTopicEntry[]): string;
//# sourceMappingURL=active-topics.d.ts.map