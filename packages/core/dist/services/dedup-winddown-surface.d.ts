/**
 * Phase 10b-aux Step 3 — winddown surfacing for dedup decisions.
 *
 * Reads the parsed `dedup-decisions.log` (via dedup-explain.parseDedupLog)
 * and formats the two chef-curated winddown sections specified in the plan
 * §"Winddown flow" + AC8a:
 *
 *   - "Deduped today" — MERGE decisions, each with an inline
 *     `[[unmerge: <canonical> ← <dupe>]]` hint for copy-paste recovery
 *     (pre-mortem F3 discoverability fix).
 *   - "Possibly mergeable" — UNCERTAIN decisions awaiting user confirm
 *     (AC4a).
 *
 * Pure module: NO filesystem, NO LLM. The winddown wire-in (SKILL.md /
 * its driver) reads the log file, parses it, filters to today's entries,
 * and calls these formatters.
 *
 * Scoping note: the log is append-only across all days. Callers pass the
 * entries they want surfaced (typically "today's" — filtered by the ISO
 * date prefix). `filterLogByDate` is provided as the conventional filter.
 */
import type { DedupLogEntry } from './dedup-explain.js';
/**
 * Filter log entries to a single ISO date (YYYY-MM-DD prefix on the
 * timestamp column). Used to scope "Deduped today" to the current day.
 *
 * Exported for tests + the winddown driver.
 */
export declare function filterLogByDate(entries: ReadonlyArray<DedupLogEntry>, isoDate: string): DedupLogEntry[];
/**
 * Format the "Deduped today" section (AC8a).
 *
 * Returns the empty string when there are no MERGE entries — callers omit
 * the section entirely (the winddown template only renders non-empty
 * sections).
 *
 * Each merge entry inlines a ready-to-edit `[[unmerge]]` directive so the
 * user can split a wrong merge in the NEXT winddown (F3 discoverability).
 */
export declare function formatDedupedTodaySection(entries: ReadonlyArray<DedupLogEntry>): string;
/**
 * Format the "Possibly mergeable" section (AC4a).
 *
 * Surfaces UNCERTAIN decisions — items the LLM cross-check couldn't call
 * SAME or DIFFERENT. They were registered as NEW canonicals; the user can
 * confirm a merge here. Returns '' when there are none.
 */
export declare function formatPossiblyMergeableSection(entries: ReadonlyArray<DedupLogEntry>): string;
/**
 * Build BOTH sections (Deduped today + Possibly mergeable) for a given
 * day's log entries, joined by a blank line. Returns '' when neither
 * section has content. Convenience for the winddown driver.
 *
 * @param entries  ALL parsed log entries (pre-date-filter).
 * @param isoDate  The day to scope to (YYYY-MM-DD).
 */
export declare function formatDedupWinddownSections(entries: ReadonlyArray<DedupLogEntry>, isoDate: string): string;
//# sourceMappingURL=dedup-winddown-surface.d.ts.map