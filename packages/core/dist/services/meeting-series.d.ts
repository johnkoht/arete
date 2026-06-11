/**
 * Meeting series resolver (single-pass-extraction W1.5).
 *
 * Links a meeting to its prior occurrences in the same recurring series —
 * a linkage that did not exist before this module: `loadRecentMeetingBatch`
 * is a flat date window with no series concept, so "Anthony 1:1 6/9" related
 * to "Anthony 1:1 6/2" exactly as much as to any unrelated meeting.
 *
 * Matching (BOTH must hold — the conjunction is the AC13 negative case:
 * an ad-hoc John+Anthony escalation shares attendees with the weekly but
 * not the title, and must NOT receive series context):
 *   1. Title similarity: token Jaccard over normalized titles ≥
 *      SERIES_TITLE_JACCARD, OR both titles match the same
 *      `recurring_meetings[].title` entry from area config (substring,
 *      case-insensitive — same convention as area-parser).
 *   2. Attendee overlap: overlap coefficient (|∩| / min size) ≥
 *      SERIES_ATTENDEE_OVERLAP, evaluated whenever BOTH sides carry
 *      attendee metadata. When the TARGET has attendees but the candidate
 *      has none, the overlap gate cannot run and the title gate is
 *      tightened to Jaccard ≥ SERIES_TITLE_JACCARD_NO_ATTENDEE (0.7) to
 *      compensate (an explicit shared recurring-config match still passes).
 *      When the TARGET itself has no attendee metadata, the title gate
 *      alone decides (current behavior, unchanged).
 *
 * Window: candidates strictly BEFORE the target date, within
 * SERIES_WINDOW_DAYS (~35 days — catches biweeklies and a skipped week).
 * Same-day meetings are NOT series context (they are priorItems).
 *
 * excludePath trap (LEARNINGS.md 2026-04-29): the target meeting is excluded
 * by strict `===` against the paths emitted by `storage.list(meetingsDir)`.
 * Callers MUST pass `meetingPath` exactly as `storage.list` would emit it —
 * no `path.resolve()` / `path.normalize()`, which silently miss the match
 * for symlinked or `./`-prefixed inputs.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { MeetingIntelligence } from './meeting-extraction.js';
export declare const SERIES_WINDOW_DAYS = 35;
export declare const SERIES_TITLE_JACCARD = 0.5;
/**
 * Stricter title bar for the asymmetric attendee case (review should-fix 4):
 * when the target carries attendee metadata but a candidate has none, the
 * attendee gate cannot corroborate the match, so the title must clear this
 * higher bar instead of SERIES_TITLE_JACCARD.
 */
export declare const SERIES_TITLE_JACCARD_NO_ATTENDEE = 0.7;
export declare const SERIES_ATTENDEE_OVERLAP = 0.5;
/** Max prior same-series meetings returned (newest first). */
export declare const SERIES_MAX_PRIOR = 2;
export type SeriesMeeting = {
    path: string;
    /** YYYY-MM-DD */
    date: string;
    title: string;
    /** Staged/approved items parsed from the prior meeting file. */
    items: MeetingIntelligence | null;
    /** `## Open Questions` bullets from the prior meeting file. */
    openQuestions: string[];
};
export type SeriesResolution = {
    /** Prior same-series meetings, newest first, max SERIES_MAX_PRIOR. */
    meetings: SeriesMeeting[];
    matchedBy: 'title+attendees' | 'recurring-config';
};
/**
 * Normalize a meeting title to identity-bearing tokens.
 * Strips a leading YYYY-MM-DD prefix, lowercases, splits on non-alphanumerics
 * (keeping digit groups like "1 1" from "1:1" — "1:1" → tokens "1","1" which
 * collapse in a Set; acceptable: "1:1" identity comes from the names), and
 * drops generic stop tokens and pure date tokens.
 */
export declare function normalizeTitleTokens(raw: string): Set<string>;
/** Token-set Jaccard over normalized titles. Empty ∪ empty = 0. */
export declare function titleSimilarity(a: string, b: string): number;
/**
 * Normalize one attendee token to a comparable identity: the name part
 * before any `<email>` / `(...)` suffix, lowercased and whitespace-collapsed.
 * Falls back to the email itself when there is no name part.
 */
export declare function normalizeAttendee(raw: string): string;
/**
 * Overlap coefficient (|A ∩ B| / min(|A|,|B|)) over normalized attendees.
 * Returns null when either side is empty (no attendee evidence).
 */
export declare function attendeeOverlap(a: string[], b: string[]): number | null;
/** Case-insensitive substring match against recurring_meetings titles. */
export declare function matchesRecurringTitle(title: string, recurringTitles: string[]): string | null;
/** Parse `## Open Questions` bullets (with or without oq_NNN ids). */
export declare function parseOpenQuestionsSection(body: string): string[];
/**
 * Resolve the prior same-series meetings for `meetingPath`.
 *
 * @param storage - storage adapter
 * @param meetingsDir - meetings directory (e.g., `<root>/resources/meetings`)
 * @param meetingPath - target meeting path EXACTLY as `storage.list` emits it
 *   (strict-=== exclusion — see module JSDoc for the LEARNINGS.md trap)
 * @param opts.recurringTitles - `recurring_meetings[].title` entries from
 *   area config; lets explicitly-configured series match even when titles
 *   drift below the Jaccard threshold
 * @returns SeriesResolution or null when no series is found
 */
export declare function resolveMeetingSeries(storage: StorageAdapter, meetingsDir: string, meetingPath: string, opts?: {
    windowDays?: number;
    maxPrior?: number;
    recurringTitles?: string[];
}): Promise<SeriesResolution | null>;
/**
 * Render a SeriesResolution as the Layer-1 series-context block body for
 * `buildSinglePassExtractionPrompt({ sections: { seriesContext } })`.
 * The advisory framing/header is added by the prompt builder.
 */
export declare function renderSeriesContext(resolution: SeriesResolution): string;
//# sourceMappingURL=meeting-series.d.ts.map