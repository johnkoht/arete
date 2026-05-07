/**
 * Skill fork / diff / merge service (Phase 3 Steps 3, 5, 6, 7).
 *
 * Phase 3 introduces a two-tier skill directory layout:
 *
 *   - `.arete/skills/<name>/`   — managed; refreshed by `arete update`;
 *                                 read-only by convention.
 *   - `.agents/skills/<name>/`  — user customizations; takes precedence
 *                                 at agent-load time; survives update.
 *
 * This module owns the user-facing flow:
 *
 *   - `forkSkill(name, ...)`   — copy managed → user; record `.fork-base`.
 *   - `diffSkill(name, ...)`   — section-level diff against the recorded base.
 *   - `mergeSkill(name, ...)`  — three-way merge of base + user + new managed;
 *                                git-style conflict markers when needed.
 *   - `summarizeUpstreamChanges(...)` — `arete update` summary helper.
 *   - `migratePreSplitAgentSkills(...)` — Step 7 migration for pre-Phase-3
 *                                 workspaces with shipped content under
 *                                 `.agents/skills/`.
 *
 * Pure I/O (no LLMs, no network). Markdown-section diff lives in
 * `utils/markdown-diff.ts`. Tests at
 * `packages/core/test/services/skill-fork.test.ts`.
 *
 * The `.fork-base/` directory inside a user fork holds a snapshot of
 * the managed skill at fork time. `arete skill diff` and `arete skill
 * merge` use it as the merge base. We snapshot the whole skill dir
 * (not just SKILL.md) so APPEND.md and templates/ are also tracked.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import { type MarkdownDiff, type MergeHunk } from '../utils/markdown-diff.js';
/** Result of `forkSkill`. */
export interface ForkSkillResult {
    /** True if a fork was created or already-existed-but-recorded. */
    ok: boolean;
    /** Path to the fork (`<root>/.agents/skills/<name>`). */
    forkPath: string;
    /** Path to the managed source (`<root>/.arete/skills/<name>`). */
    managedPath: string;
    /** Was the fork already present before this call? */
    alreadyExisted: boolean;
    /** Why ok=false. Empty when ok=true. */
    error?: string;
    /**
     * Hash of the managed SKILL.md at fork time (sha256 hex). Recorded
     * to `.fork-base/.fork-base.yaml`. Used by `diffSkill` and
     * `mergeSkill` to detect upstream drift.
     */
    baseHash?: string;
    /**
     * Phase 3.5 B2 — when forking onto a pre-existing user dir, the
     * names of aux files copied from managed because they were missing
     * in the fork. Empty/undefined when `alreadyExisted` is false (full
     * fresh-fork copies everything via `copyDirectory`).
     */
    auxFilesCopied?: string[];
}
/** Options for `forkSkill`. */
export interface ForkSkillOptions {
    /** Workspace root. */
    workspaceRoot: string;
    /** Skill slug (matches the directory name in both tiers). */
    name: string;
    /**
     * Allow re-forking an existing fork. When true, the existing fork's
     * `.fork-base/` is overwritten with the current managed content.
     * Default: false (idempotent — warn but don't overwrite).
     */
    force?: boolean;
}
/** Result of `diffSkill`. */
export interface DiffSkillResult {
    /** True when no upstream changes vs the user fork's recorded base. */
    upToDate: boolean;
    /** Markdown-section diff between recorded base and current managed. */
    diff: MarkdownDiff;
    /** Path to the user fork. */
    forkPath: string;
    /** Path to the managed source. */
    managedPath: string;
    /** Path to the recorded base SKILL.md (`<fork>/.fork-base/SKILL.md`). */
    basePath: string;
    /**
     * True when the fork has no `.fork-base/` (legacy pre-Phase-3 fork or
     * never-forked-but-content-present). Caller can prompt user to
     * re-fork or treat as user-tracked-upstream.
     */
    baseMissing: boolean;
}
/** Result of `mergeSkill`. */
export interface MergeSkillResult {
    /** True if the merge applied at least one hunk OR there were conflicts the user must resolve. */
    ran: boolean;
    /** Merged content written to the user fork's SKILL.md. */
    mergedContent: string;
    /** Conflict section headings; empty when clean. */
    conflicts: string[];
    /** Per-section verdicts. */
    hunks: MergeHunk[];
    /** True when no conflicts emitted (merge applied cleanly). */
    clean: boolean;
    /** Was `.fork-base/` updated to the new managed content? */
    baseUpdated: boolean;
    /** New base hash (when `baseUpdated`). */
    baseHash?: string;
    /** Why ran=false (e.g., fork missing). */
    error?: string;
}
/** Options for `mergeSkill`. */
export interface MergeSkillOptions {
    /** Workspace root. */
    workspaceRoot: string;
    /** Skill slug. */
    name: string;
    /**
     * Per-hunk decision callback for `--interactive` mode. Receives
     * each hunk and returns:
     *   - `accept`: take the proposed merge for this hunk
     *   - `keep-local`: discard incoming for this hunk; keep local
     *   - `take-incoming`: discard local for this hunk; take incoming verbatim
     *   - `skip`: leave the section unchanged from local (synonym for keep-local)
     * When omitted, all non-conflict hunks are auto-accepted and conflicts
     * land as git-style markers. Async to allow CLI-side prompting.
     */
    onHunk?: (hunk: MergeHunk) => Promise<HunkDecision> | HunkDecision;
    /**
     * Force `.fork-base/` update even when conflicts exist. Default:
     * false — base only updates on clean merges, otherwise the user
     * needs to resolve and re-run `arete skill merge`.
     */
    forceBaseUpdate?: boolean;
}
export type HunkDecision = 'accept' | 'keep-local' | 'take-incoming' | 'skip';
export interface UpstreamChangedSkill {
    name: string;
    /** True when the user has a fork to compare against. */
    hasFork: boolean;
    /**
     * True when the fork's `.fork-base/` is missing — hints the user to
     * either re-fork or accept upstream wholesale.
     */
    baseMissing: boolean;
    /** Number of section-level changes (added + removed + modified). */
    changeCount: number;
}
/**
 * Fork a managed skill into the user's `.agents/skills/` overlay.
 * Idempotent: if the fork already exists and `force` is false, this
 * returns ok=true with `alreadyExisted=true` — never overwrites user
 * edits. Call with `force: true` to refresh the recorded base of an
 * existing fork to the current managed content.
 */
export declare function forkSkill(storage: StorageAdapter, options: ForkSkillOptions): Promise<ForkSkillResult>;
/**
 * Diff a user fork's recorded base vs current managed content. Used
 * by `arete skill diff` and by `arete update` to surface the
 * upstream-changed-skills summary.
 */
export declare function diffSkill(storage: StorageAdapter, workspaceRoot: string, name: string): Promise<DiffSkillResult>;
/**
 * Three-way merge: integrate upstream changes (base → managed) into
 * the user fork. Conflicts land as git-style markers for the user to
 * resolve manually. `--interactive` mode prompts per-hunk via the
 * `onHunk` callback.
 *
 * On clean merges, `.fork-base/` is updated to the new managed
 * content so subsequent diff/merge calls operate against the new
 * base. On conflict, base is NOT updated — user needs to resolve
 * conflicts and re-run `arete skill merge` to advance the base
 * (alternatively pass `forceBaseUpdate: true` to advance unconditionally;
 * not exposed via CLI in v1).
 */
export declare function mergeSkill(storage: StorageAdapter, options: MergeSkillOptions): Promise<MergeSkillResult>;
/**
 * For each managed skill that has a corresponding user fork, return
 * whether upstream has changes the user fork hasn't picked up yet.
 * Used by `arete update` to print the summary banner.
 */
export declare function summarizeUpstreamChanges(storage: StorageAdapter, workspaceRoot: string): Promise<UpstreamChangedSkill[]>;
/**
 * Phase 3 Step 7 migration. Pre-Phase-3 `arete install` / `update`
 * wrote shipped skills directly to `.agents/skills/`. After Phase 3,
 * shipped skills live in `.arete/skills/`; `.agents/skills/` is for
 * user customizations only.
 *
 * Migration policy (idempotent):
 *
 * 1. For each `.agents/skills/<name>/` whose SKILL.md is byte-equal to
 *    the corresponding `.arete/skills/<name>/SKILL.md`: delete the
 *    `.agents/skills/<name>/` entry. The user has not edited; they
 *    are tracking upstream. After migration, agent-load resolves to
 *    `.arete/skills/<name>/` (managed).
 *
 * 2. For each `.agents/skills/<name>/` whose SKILL.md DIFFERS from the
 *    corresponding `.arete/skills/<name>/SKILL.md`: leave intact.
 *    Treat as user fork. If `.fork-base/` is missing, do NOT
 *    fabricate one — the diff will show the full divergence on first
 *    `arete skill diff` call. User can run `arete skill fork --force`
 *    to record a base if they want clean upstream-update reports.
 *
 * 3. For `.agents/skills/<name>/` with NO matching managed entry
 *    (community skill installed via `arete skill install <repo>`,
 *    or hand-authored): leave intact. Outside Phase 3 split scope.
 *
 * Returns lists of `removed` (case 1) and `preserved` (cases 2 + 3)
 * for the caller to surface in the update report. Never throws on
 * partial failure — best-effort. Migration runs as part of `arete
 * update` (not `install`), since `install` always writes shipped
 * skills to `.arete/skills/` directly.
 */
export declare function migratePreSplitAgentSkills(storage: StorageAdapter, agentSkillsDir: string, managedSkillsDir: string, options?: MigratePreSplitOptions): Promise<MigratePreSplitResult>;
/** Optional inputs for `migratePreSplitAgentSkills`. */
export interface MigratePreSplitOptions {
    /**
     * Source `runtime/skills/` directory. When provided, A2 cleanup
     * removes stale `<user>/<name>/SKILL.legacy.md` files when the
     * corresponding source `<sourceSkillsDir>/<name>/SKILL.legacy.md`
     * is gone. Without this, A2 cleanup is a no-op (safer default).
     */
    sourceSkillsDir?: string;
    /**
     * Phase 3.5 B1 — when true, attempt to auto-record `.fork-base/`
     * for user-edited forks whose content matches a known prior shipped
     * version of `<sourceSkillsDir>/<name>/SKILL.md` in the package
     * root's git history. Best-effort: silently skipped if git history
     * is unavailable or no match is found. Requires `sourceSkillsDir`
     * AND a `gitWorkingDir` (or it will be inferred from
     * `sourceSkillsDir`).
     */
    autoForkBase?: boolean;
    /**
     * Phase 3.5 B1 — git working directory for history queries.
     * Defaults to the parent of `sourceSkillsDir` (which is the package
     * root in production). Override for tests.
     */
    gitWorkingDir?: string;
}
export interface MigrationCleanup {
    name: string;
    /**
     * `legacy_skill`   — stale `SKILL.legacy.md` removed (A2).
     * `aux_dedup`      — byte-equal aux file removed (A3).
     * `empty_dir`      — empty user-skill dir pruned (A4).
     * `auto_fork_base` — `.fork-base/` auto-recorded from a prior
     *                    shipped version matched in git history (B1).
     */
    kind: 'legacy_skill' | 'aux_dedup' | 'empty_dir' | 'auto_fork_base';
    /** Workspace-relative or absolute path of the entry that was removed. */
    path: string;
}
export interface MigratePreSplitResult {
    removed: string[];
    preserved: string[];
    cleaned: MigrationCleanup[];
}
//# sourceMappingURL=skill-fork.d.ts.map