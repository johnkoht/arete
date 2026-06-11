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
import { join } from 'path';
export const RAW_EXTRACTIONS_DIR = join('dev', 'diary', 'raw-extractions');
export const RECONCILE_SHADOW_LOG = join('dev', 'diary', 'reconcile-shadow.log');
/** Derive `{date, slug}` from a meeting filename like
 * `2026-06-09-compliance-workshop.md`. Returns null when the filename has
 * no date prefix (snapshot callers skip those — soak tooling keys on date). */
export function parseMeetingFilename(meetingPath) {
    const filename = meetingPath.split('/').pop() ?? '';
    const m = filename.match(/^(\d{4}-\d{2}-\d{2})[-_]?(.*)\.md$/);
    if (!m)
        return null;
    return { date: m[1], slug: m[2] || 'meeting' };
}
/**
 * Persist a raw pre-reconcile extraction snapshot to
 * `<workspaceRoot>/dev/diary/raw-extractions/<date>-<slug>.json`.
 *
 * Overwrites any prior snapshot for the same meeting (a re-extract
 * supersedes — the soak wants the snapshot that fed the day's pipeline run).
 * Returns the written path, or null when the filename has no date prefix.
 */
export async function writeRawExtractionSnapshot(storage, workspaceRoot, args) {
    const parsed = parseMeetingFilename(args.meetingPath);
    if (!parsed)
        return null;
    const dir = join(workspaceRoot, RAW_EXTRACTIONS_DIR);
    await storage.mkdir(dir);
    const outPath = join(dir, `${parsed.date}-${parsed.slug}.json`);
    const snapshot = {
        v: 1,
        capturedAt: new Date().toISOString(),
        meetingPath: args.meetingPath,
        date: parsed.date,
        slug: parsed.slug,
        extractionMode: args.extractionMode,
        intelligence: args.intelligence,
        ...(args.validationWarnings && args.validationWarnings.length > 0
            ? { validationWarnings: args.validationWarnings }
            : {}),
    };
    await storage.write(outPath, JSON.stringify(snapshot, null, 2) + '\n');
    return outPath;
}
/**
 * Append one JSONL entry to `<workspaceRoot>/dev/diary/reconcile-shadow.log`.
 *
 * Scaffolding for the W7 nightly diff: shadow-engine runs append
 * `shadow-run` / `diff` entries here (agreement rate, engine-only catches,
 * inline-only catches, arc-assembly events); the soak report reads the log.
 * `ts` is stamped automatically.
 */
export async function appendReconcileShadowLog(storage, workspaceRoot, entry) {
    const logPath = join(workspaceRoot, RECONCILE_SHADOW_LOG);
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
    if (storage.append) {
        // Atomic append (POSIX O_APPEND) — safe against the winddown's
        // wave-of-4 parallel extracts.
        await storage.append(logPath, line);
    }
    else {
        await storage.mkdir(join(workspaceRoot, 'dev', 'diary'));
        const existing = (await storage.read(logPath)) ?? '';
        await storage.write(logPath, existing + line);
    }
    return logPath;
}
//# sourceMappingURL=reconcile-shadow.js.map