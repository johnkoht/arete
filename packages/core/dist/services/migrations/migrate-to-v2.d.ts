/**
 * Phase 10a v2 migration engine (Step 4 — core).
 *
 * Pure module. Given a list of v1-shape `Commitment` rows + a person
 * directory + the workspace owner's slug + a sidecar of user
 * disambiguations, this module produces:
 *
 *   - the migrated v2-shape `Commitment[]` (canonical-per-group),
 *   - a categorized `MigrationDiff` for the audit artifact,
 *   - an array of `AmbiguousRow` entries the user must disambiguate.
 *
 * The CLI verb (`packages/cli/src/commands/commitments.ts`) wires this
 * to the storage adapter + emits `migration-diff.md`. Tests exercise
 * the engine via synthetic fixtures — NO production data writes happen
 * at any layer in this build (per phase-10a constraints).
 *
 * Algorithm (per plan §"Migration plan (v2)" + AC1a-h):
 *
 *   1. For each row: run `extractCounterpartiesFromText` to derive
 *      v2 stakeholders + (possibly rewritten) direction. Stash
 *      ambiguous rows in a parallel list with their candidate names.
 *
 *   2. For each row that is NOT ambiguous: compute the v2 hash via
 *      `computeCommitmentHashV2(text, direction)`. Group by hash.
 *
 *   3. Within each group, sort by `date` ascending (oldest = canonical
 *      per PM Q5). Tiebreak on `createdAt`, then on row's original
 *      index (insertion order). Build the canonical v2 row by:
 *        - unioning `stakeholders[]` (de-duped by slug; mentioned <
 *          recipient < sender < self for role priority — see
 *          `mergeStakeholderRoles`)
 *        - unioning `source_meetings[]` (de-duped; canonical's
 *          `source` first)
 *        - merging `textVariants[]` (canonical text first; cap at 5,
 *          drop oldest when over)
 *        - resolving status conflicts (any resolved → resolved,
 *          earliest `resolvedAt`; any deferred w/o resolved → open
 *          (we re-open); else preserve canonical)
 *        - preserving `area` from the canonical row's `area` if any;
 *          else from the first group entry that carries one
 *        - emitting `source_external: []` (Phase 11)
 *
 *   4. Categorize each group for the diff report:
 *        - 'pass-through': single-row group, no v1→v2 changes other
 *          than added v2 fields (stakeholders inferred, etc.)
 *        - 'collapsed':    multi-row group; multiple v1 rows fold
 *          into one v2 row.
 *        - 'self-rewrite': single-row group where direction shifted
 *          to 'self' via owner-as-personSlug repair.
 *        - 'status-conflict': multi-row group with mixed status (e.g.,
 *          one resolved + one open).
 *        - 'ambiguous': row(s) whose counterparty parse was ambiguous;
 *          NOT folded into any group; surfaced separately.
 *
 *   5. Apply a sidecar `Disambiguations` map (name → chosen slug) to
 *      ambiguous rows before grouping. Without disambiguation, the
 *      row stays in the ambiguous bucket and `--apply` (CLI layer)
 *      blocks until the user resolves.
 *
 * NO LLM CALLS in this module. Semantic dedup is Phase 10b — this
 * module only does deterministic hash-bucket grouping.
 */
import type { Commitment } from '../../models/index.js';
import { type PersonDirectory, type AmbiguousName } from '../commitments-counterparty-parser.js';
/**
 * User-supplied resolutions for ambiguous bare names.
 *
 * Sidecar file shape: `{ disambiguations: [{commitmentId, name, slug}] }`.
 * Engine consumes the in-memory map; CLI layer reads + writes the file.
 *
 * Key = `<commitmentId>::<lowercased-name>` — disambiguations are
 * per-row, NOT global, because the same name ("Lindsay") may legitimately
 * refer to different people in different commitments.
 */
export type Disambiguations = ReadonlyMap<string, string>;
/**
 * Row category in the migration diff report. Drives both the diff's
 * section grouping AND the soft pass/fail signal the user uses to
 * decide whether to run `--apply`.
 */
export type MigrationRowCategory = 'pass-through' | 'collapsed' | 'self-rewrite' | 'status-conflict' | 'ambiguous';
/**
 * A row in the diff report. Captures BEFORE (v1) and AFTER (v2) state
 * so the user can audit each migration decision.
 */
export type MigrationDiffRow = {
    category: MigrationRowCategory;
    /** Hash of the v2 row (empty for ambiguous rows). */
    hash: string;
    before: Commitment[];
    after: Commitment | null;
    /** Filled when category === 'ambiguous'. */
    ambiguous?: AmbiguousName[];
    /** Notes surfaced to the user (status conflicts, dropped variants, etc.). */
    notes: string[];
};
/**
 * Top-level result of `migrateCommitmentsToV2`.
 */
export type MigrationResult = {
    /** v2 commitments in canonical order (matches input order of canonicals). */
    migrated: Commitment[];
    /** Categorized rows for the audit-artifact diff. */
    diff: MigrationDiffRow[];
    /** Summary counts for the report header. */
    summary: {
        totalIn: number;
        totalOut: number;
        passThrough: number;
        collapsed: number;
        selfRewrite: number;
        statusConflict: number;
        ambiguous: number;
    };
};
export type MigrationInputs = {
    /** v1 commitments (read from `.arete/commitments.json`). */
    commitments: ReadonlyArray<Commitment>;
    /** Workspace owner slug (e.g., 'john-koht'). */
    ownerSlug: string;
    /** Person directory (name → candidate slugs). */
    directory: PersonDirectory;
    /** Optional sidecar disambiguations. */
    disambiguations?: Disambiguations;
};
/**
 * Run the migration in-memory.
 *
 * Idempotency: running on the OUTPUT of a previous run is a fixed point
 * — every row already has `stakeholders[]`, hashes already collapse,
 * and the diff reports zero collapsed/self-rewrite/ambiguous rows.
 */
export declare function migrateCommitmentsToV2(inputs: MigrationInputs): MigrationResult;
/**
 * Build the `migration-diff.md` content. Categorizes by row source per
 * AC1g (delta-diff legibility) AND per AC1h (24h quiet-window guard
 * surfaces the same row breakdown).
 *
 * Format is deliberately simple — pure markdown so the user can read
 * it in any editor and grep for hashes. NO json. NO yaml frontmatter.
 */
export declare function formatMigrationDiff(result: MigrationResult, meta: {
    workspaceRoot: string;
    ownerSlug: string;
    timestamp: string;
    mode: 'dry-run' | 'apply' | 'delta';
    /** Optional rows-by-source breakdown for delta diffs (AC1h). */
    deltaSources?: {
        newExtract: number;
        manualResolve: number;
        manualDrop: number;
        manualCreate: number;
    };
}): string;
//# sourceMappingURL=migrate-to-v2.d.ts.map