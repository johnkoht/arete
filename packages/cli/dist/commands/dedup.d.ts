/**
 * `arete dedup` — Phase 10e background dedup hygiene verb.
 *
 * Manual-only (no cron in v2). Reuses the shipped reactive pipeline
 * (Phase 10b-min) to dedup retroactively against existing data within
 * an optional `--since` window.
 *
 * Modes:
 *   - `--dry-run` (default): writes diff report to dev/work/plans/.../
 *     dedup-diff-<scope>-<date>.md and DOES NOT modify any data.
 *   - `--apply`: requires explicit flag. Wraps the read-modify-write
 *     cycle in `services.commitments.withLock(...)` (commitments scope)
 *     so concurrent `arete meeting extract` cannot race. For memory
 *     scopes (decisions / learnings / topics), v2 surfaces a diff for
 *     editorial review — auto-merge is a non-goal per plan v2 §AC10a.
 *
 * Critical invariants:
 *   - NO production data writes during `--dry-run`.
 *   - NO LLM calls without an `--llm` flag (engine accepts callConcurrent
 *     as an option). When `--llm` is set, AIService.callConcurrent is
 *     wired in at the `fast` tier (matches reactive default).
 *   - Mutual exclusion with reactive dedup via withLock (commitments
 *     scope). If meeting extract is running, `dedup --apply` waits or
 *     aborts via the same lockfile.
 */
import type { Command } from 'commander';
export declare function registerDedupCommand(program: Command): void;
//# sourceMappingURL=dedup.d.ts.map