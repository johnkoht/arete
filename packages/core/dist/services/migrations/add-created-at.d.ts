/**
 * One-shot migration: backfill `createdAt` on `Commitment` entries.
 *
 * Phase 10a-pre prerequisite. The `createdAt` field was added to
 * `Commitment` in this phase; pre-existing entries in commitments.json do
 * not carry the field. This script reads commitments.json, fills any
 * missing `createdAt` with the entry's existing `date` value (sentinel
 * — date-only, no time component), and writes it back.
 *
 * Properties (per Phase 10 plan AC0):
 *  - **Idempotent**: re-running the script after first apply is a no-op
 *    (entries already carrying `createdAt` are left untouched).
 *  - **No-op on fresh entries**: entries created by the post-10a-pre code
 *    paths already have an ISO wall-clock `createdAt`; the migration
 *    leaves them alone.
 *  - **Sentinel format**: backfilled `createdAt` mirrors the `date` field
 *    (YYYY-MM-DD). Downstream sort logic that ties on `date` can read
 *    `createdAt` as a secondary key; sentinel values tie on `date` as
 *    expected. After 14d of soak, the sentinel pattern is observable in
 *    the JSON for any pre-migration row.
 *
 * Pure code module: callers (CLI verbs, tests) decide where the JSON
 * comes from and where the rewrite goes. No filesystem coupling here.
 */
import type { Commitment } from '../../models/index.js';
/**
 * Outcome of the migration on a single commitment.
 */
export type AddCreatedAtPerEntryResult = {
    id: string;
    /** Was a `createdAt` value written for this row? */
    backfilled: boolean;
    /** The `createdAt` value the row carries after migration. */
    createdAt: string;
};
/**
 * Summary report of an in-memory backfill pass.
 */
export type AddCreatedAtReport = {
    total: number;
    /** Rows that already had `createdAt` and were left untouched. */
    alreadyPresent: number;
    /** Rows that received a sentinel-backfilled `createdAt`. */
    backfilled: number;
    /** Per-row details, in iteration order. */
    entries: AddCreatedAtPerEntryResult[];
};
/**
 * Apply the backfill to an in-memory list of commitments.
 *
 * Returns a NEW array — input is not mutated. Per-entry: if `createdAt`
 * is missing/blank, the result row carries `createdAt = entry.date`.
 * Otherwise the entry is returned unchanged.
 *
 * This is the pure core of the migration. Callers pair it with `parseCommitmentsFile`
 * / `serializeCommitmentsFile` (or their own JSON I/O) to perform the
 * full read → backfill → write round-trip.
 */
export declare function applyAddCreatedAt(commitments: Commitment[]): {
    commitments: Commitment[];
    report: AddCreatedAtReport;
};
/**
 * Parse a commitments.json string into a typed list.
 *
 * Returns an empty list when the input is empty / malformed — mirrors the
 * defensive read pattern of `CommitmentsService.load()` so the migration
 * does not blow up on a freshly-installed workspace.
 */
export declare function parseCommitmentsFile(content: string | null): Commitment[];
/**
 * Serialize a list back to the same JSON shape `CommitmentsService` reads.
 *
 * Uses 2-space indent to match the existing on-disk format and keep
 * diffs sane during the dry-run window.
 */
export declare function serializeCommitmentsFile(commitments: Commitment[]): string;
/**
 * High-level migration runner: read raw JSON, backfill, return new JSON
 * + report. Caller writes the result (or doesn't, for --dry-run).
 *
 * Idempotency contract: running on the OUTPUT of a previous run produces
 * a report with `backfilled === 0` and identical JSON serialization.
 */
export declare function migrateAddCreatedAt(rawJson: string | null): {
    json: string;
    report: AddCreatedAtReport;
};
//# sourceMappingURL=add-created-at.d.ts.map