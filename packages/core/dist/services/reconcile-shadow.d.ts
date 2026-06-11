/**
 * reconcile-shadow — CHR W7 infra: raw pre-reconcile extraction snapshots
 * + shadow-run log scaffolding for the dual-run soak
 * (dev/work/plans/chef-holistic-reconcile/plan.md W7; engine-spec § 1).
 *
 * Pre-mortem R2 (the soak-validity fix): the shadow engine must NOT consume
 * post-inline state — inline reconcile mutates the day (visible skips,
 * first-occurrence-wins collapses, batchLLMReview drops) before the engine
 * would see it, which makes agreement vacuously high and arc-assembly
 * structurally impossible. The snapshot is therefore taken at extract time,
 * immediately after `extractMeetingIntelligence` returns and BEFORE:
 *   - the inline cross-meeting reconcile (`reconcileMeetingBatch` merge),
 *   - `processMeetingExtraction` (confidence filtering, completed/open-task
 *     matching, silent merges),
 *   - `batchLLMReview` drops,
 *   - `wireExtractDedup` (Phase 10b reactive dedup).
 *
 * KNOWN LIMIT (review F1): prompt-level suppression happens INSIDE
 * extraction — a legacy-mode exclusion list can suppress items before any
 * snapshot can see them. Single-pass mark-don't-skip (SP W2) is the fix;
 * the snapshot records `extractionMode` so soak analysis can segment.
 *
 * Both artifacts live under the workspace's `dev/diary/` and are gitignored
 * (soak telemetry, not history). Writes are best-effort: callers wrap in
 * try/catch and NEVER fail extraction over instrumentation.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { MeetingIntelligence, ValidationWarning } from './meeting-extraction.js';
export declare const RAW_EXTRACTIONS_DIR: string;
export declare const RECONCILE_SHADOW_LOG: string;
/** Raw pre-reconcile snapshot of one meeting extraction. */
export type RawExtractionSnapshot = {
    /** Schema version for soak tooling. */
    v: 1;
    /** ISO timestamp the snapshot was written. */
    capturedAt: string;
    /** Meeting file path as the extract command saw it. */
    meetingPath: string;
    /** YYYY-MM-DD of the meeting (filename prefix). */
    date: string;
    /** Meeting slug (filename without date prefix / extension). */
    slug: string;
    /** 'legacy' | 'single_pass' — segments soak analysis (see header). */
    extractionMode: string;
    /** The PURE extraction result — pre-reconcile, pre-processing. */
    intelligence: MeetingIntelligence;
    /** Parse-time validation warnings (pre-persistence). */
    validationWarnings?: ValidationWarning[];
};
export type ShadowLogEntry = {
    /** Entry type, e.g. 'shadow-run' | 'diff' | 'note' | 'soak-pause'. */
    type: string;
    [key: string]: unknown;
};
/** Derive `{date, slug}` from a meeting filename like
 * `2026-06-09-compliance-workshop.md`. Returns null when the filename has
 * no date prefix (snapshot callers skip those — soak tooling keys on date). */
export declare function parseMeetingFilename(meetingPath: string): {
    date: string;
    slug: string;
} | null;
/**
 * Persist a raw pre-reconcile extraction snapshot to
 * `<workspaceRoot>/dev/diary/raw-extractions/<date>-<slug>.json`.
 *
 * Overwrites any prior snapshot for the same meeting (a re-extract
 * supersedes — the soak wants the snapshot that fed the day's pipeline run).
 * Returns the written path, or null when the filename has no date prefix.
 */
export declare function writeRawExtractionSnapshot(storage: StorageAdapter, workspaceRoot: string, args: {
    meetingPath: string;
    extractionMode: string;
    intelligence: MeetingIntelligence;
    validationWarnings?: ValidationWarning[];
}): Promise<string | null>;
/**
 * Append one JSONL entry to `<workspaceRoot>/dev/diary/reconcile-shadow.log`.
 *
 * Scaffolding for the W7 nightly diff: shadow-engine runs append
 * `shadow-run` / `diff` entries here (agreement rate, engine-only catches,
 * inline-only catches, arc-assembly events); the soak report reads the log.
 * `ts` is stamped automatically.
 */
export declare function appendReconcileShadowLog(storage: StorageAdapter, workspaceRoot: string, entry: ShadowLogEntry): Promise<string>;
//# sourceMappingURL=reconcile-shadow.d.ts.map