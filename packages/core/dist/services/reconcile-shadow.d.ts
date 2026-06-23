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
    /** Prompt depth mode ('light' | 'normal' | 'thorough') — distinct from
     * extractionMode, which records the pipeline shape. Optional. */
    promptMode?: string;
    /** The PURE extraction result — pre-reconcile, pre-processing. */
    intelligence: MeetingIntelligence;
    /** Parse-time validation warnings (pre-persistence). */
    validationWarnings?: ValidationWarning[];
    /**
     * Why the extraction FAILED, when it did (single_pass W1 / S1, AC2/AC7).
     * Absent on a successful snapshot. When present, `intelligence` is the empty
     * shell — the extraction threw before producing items. Lets soak analysis
     * tell a silent-empty bug (would be absent here entirely) from a diagnosable
     * failure (call error / parse error / truncation), and makes the
     * Anthony-class case recoverable from the snapshot alone.
     */
    failureReason?: ExtractionFailureReason;
    /** Truncated raw-response preview / error message for a failed snapshot. */
    failurePreview?: string;
    /** The error message of the failure (failed snapshot only). */
    failureMessage?: string;
};
/**
 * Classification of an extraction failure recorded in a failure snapshot
 * (single_pass W1 / S1). Maps to the W1 error taxonomy: a thrown transport
 * error (`call_error`), a ParseError from the response parser (`parse_error`),
 * a truncated response (`truncation`), an `empty_extraction` (the call
 * succeeded + JSON parsed, but a non-trivial transcript yielded zero
 * intelligence — finding #11/#13 over-suppression), or anything else
 * (`unknown`).
 */
export type ExtractionFailureReason = 'call_error' | 'parse_error' | 'truncation' | 'empty_extraction' | 'unknown';
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
    promptMode?: string;
    intelligence: MeetingIntelligence;
    validationWarnings?: ValidationWarning[];
}): Promise<string | null>;
/**
 * Persist a FAILURE snapshot when an extraction threw (single_pass W1 / S1,
 * AC2/AC7). Same path/shape as `writeRawExtractionSnapshot` but records
 * `failureReason` + preview + message and an empty `intelligence` shell — the
 * extraction never produced items.
 *
 * CRITICAL (S1): the CLI's success-path snapshot writer runs AFTER
 * `extractMeetingIntelligence` returns; with W1's fail-loud propagation the
 * CLI catch does `process.exit(1)` before that line, so without THIS write the
 * exact failure being targeted would leave no snapshot → AC2/AC7 unreachable.
 * The CLI calls this in its catch BEFORE exiting. Best-effort: callers wrap in
 * try/catch and never let snapshot failure mask the original error.
 *
 * Returns the written path, or null when the filename has no date prefix.
 */
export declare function writeFailureSnapshot(storage: StorageAdapter, workspaceRoot: string, args: {
    meetingPath: string;
    extractionMode: string;
    promptMode?: string;
    failureReason: ExtractionFailureReason;
    failureMessage: string;
    failurePreview?: string;
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