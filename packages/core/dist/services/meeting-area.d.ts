/**
 * Meeting area backfill helpers (Phase 13 AC2/AC3).
 *
 * Third instantiation of the backfill contract (after `commitments
 * backfill-area` and `project-area.ts`): list area-less meetings with the
 * inference inputs `suggestAreaForMeeting` needs, write the `area:` +
 * `area_set_by:` provenance pair into meeting frontmatter, and selectively
 * reset ONLY backfill-stamped areas.
 *
 * Differences from the project backfill, both deliberate:
 *  - Writes go through `writeWithLock` (meeting files are mutated by
 *    extract/approve concurrently) with `mtimeGuardSeconds: 0` — set-area
 *    and backfill are explicit user-gated commands that own exactly two
 *    keys, and the default 60s guard would silently no-op the designed
 *    process→set-area sequence (pre-mortem D4).
 *  - Same-values rerun performs ZERO write calls (review finding 2 —
 *    deliberately STRONGER than the project backfill's identical-content
 *    guarantee, because meeting backfill can touch hundreds of committed
 *    files).
 *
 * No direct `fs` — all I/O through StorageAdapter (services invariant);
 * `writeWithLock` owns its own locked read/write internals.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths } from '../models/index.js';
import type { AreaMatch } from '../models/entities.js';
/** One area-less meeting, annotated for the backfill flow. */
export interface MeetingBackfillCandidate {
    /** Absolute meeting file path. */
    path: string;
    /** Basename (stable display handle in preview tables). */
    file: string;
    /** Display/inference title (frontmatter `title:` → basename). */
    title: string;
    /** YYYY-MM-DD (frontmatter `date:` → filename prefix → ''). */
    date: string;
    /** Frontmatter `summary:` when present (inference input). */
    summary?: string;
    /** Meeting body — transcript-bearing inference input. */
    body: string;
    /** Topic slugs from `topics:` frontmatter. */
    topics: string[];
    /**
     * Area slugs present in `topics:` — the meeting currently surfaces in
     * these areas via the topics-union arm, and assigning a different
     * primary area will REMOVE it from them (pre-mortem D2 recall-loss
     * visibility column for the preview table).
     */
    alsoMatchesViaTopics: string[];
}
/** Per-match qualification for the MEETING backfill (pre-mortem D1). */
export interface MeetingAreaQualification {
    /** False → the meeting stays area-less (listed as unmatched). */
    qualified: boolean;
    /**
     * True for uncorroborated name-substring matches — preview groups and
     * flags these for John's MC3 spot-check.
     */
    nameOnly: boolean;
    /** Machine-readable reason when disqualified or flagged. */
    reason?: 'below-floor' | 'summary-name-only' | 'title-name-only';
}
/**
 * List area-less meetings annotated for backfill (candidate filter:
 * meetings WITH a non-empty `area:` are never candidates — this excludes
 * the ~96 legacy capture-flow carriers and makes apply rerun a no-op at
 * the listing level). Phase 13 AC3.
 *
 * @param opts.sinceDay  Optional YYYY-MM-DD cutoff (`--days` limiter);
 *                       meetings dated strictly before it are skipped.
 *                       Undated meetings are kept (honest: age unknown).
 * @param opts.areaSlugs Known area slugs, used to fill
 *                       `alsoMatchesViaTopics` (D2 preview column).
 */
export declare function listMeetingsForBackfill(storage: StorageAdapter, paths: WorkspacePaths, opts?: {
    sinceDay?: string;
    areaSlugs?: string[];
}): Promise<MeetingBackfillCandidate[]>;
/**
 * Per-match-type qualification for meeting backfill (pre-mortem D1).
 *
 * With the inherited 0.7 floor, every non-recurring proposal is a 0.8
 * name-substring match — so signal policy IS the precision lever here:
 *  - below floor → unqualified (`below-floor`);
 *  - uncorroborated `area-name-summary` → unqualified
 *    (`summary-name-only`) — a bare summary mention is structurally the
 *    same tangentiality as the observed topic-leak;
 *  - uncorroborated `area-name-title` → qualified but flagged
 *    `nameOnly` (`title-name-only`) for the preview spot-check;
 *  - everything else (recurring title, corroborated matches, qualifying
 *    keyword matches) → qualified, unflagged.
 *
 * STRICTER than the floor, never looser — the floor stays non-negotiable.
 */
export declare function qualifyMeetingAreaMatch(match: AreaMatch, floor?: number): MeetingAreaQualification;
/** Result of a single meeting-area write attempt. */
export interface ApplyAreaResult {
    /** True when the file was actually written. */
    written: boolean;
    /** True when skipped because area + provenance already hold these values. */
    noop: boolean;
    /** writeWithLock abstain reason when written=false and not a noop. */
    abstainReason?: string;
}
/**
 * Write `area:` + `area_set_by:` into a meeting's frontmatter under the
 * meeting lock, preserving body bytes and all other frontmatter keys
 * (writeWithLock shallow-merge contract). Phase 13 AC2/AC3.
 *
 * - Same-values rerun → mutator abstains BEFORE serialization: zero
 *   write calls, byte-identical file (review finding 2).
 * - `mtimeGuardSeconds: 0` — explicit user-gated write owning exactly two
 *   keys; the default 60s guard would silently swallow the designed
 *   process→set-area sequence (pre-mortem D4). Callers MUST surface
 *   `written: false` results.
 */
export declare function applyAreaToMeeting(storage: StorageAdapter, meetingPath: string, areaSlug: string, setBy: 'approval' | 'manual' | 'backfill'): Promise<ApplyAreaResult>;
/**
 * Clear `area` + `area_set_by` ONLY on meetings stamped
 * `area_set_by: backfill`. `approval`/`manual` provenance and the legacy
 * capture-flow carriers (no `area_set_by` at all) are left intact
 * (AC3 `--reset` contract; pre-mortem D6 implication 3).
 */
export declare function resetBackfilledMeetingAreas(storage: StorageAdapter, paths: WorkspacePaths): Promise<{
    reset: string[];
}>;
//# sourceMappingURL=meeting-area.d.ts.map