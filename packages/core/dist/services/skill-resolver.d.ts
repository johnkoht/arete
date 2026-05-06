/**
 * Skill-prose resolver (Phase 3 — two-tier directory resolution).
 *
 * Skills live in two tiers:
 *
 *   1. `<workspace>/.agents/skills/<name>/`  — user customizations
 *      (forks via `arete skill fork`, community installs, hand-authored).
 *      Survives `arete update`.
 *   2. `<workspace>/.arete/skills/<name>/`   — managed/shipped skills.
 *      Refreshed on `arete update`. Read-only by convention.
 *
 * Tier 1 wins when present; tier 2 is fallback.
 *
 * Phase 3 Step 9 (MC5 sunset): the Phase 2 `ARETE_LEGACY_SKILL_PROSE`
 * routing has been removed. Each chef-orchestrator skill no longer
 * ships a `SKILL.legacy.md` companion. Pre-Phase-2 prose lives in git
 * history; recovery requires `git revert` of the Phase 2 rewrites
 * (Phase 2 commits are per-skill so revert is surgical), not a runtime
 * env var flip.
 *
 * Design notes:
 * - Pure path math; one I/O dependency (`existsFn`) so callers can
 *   inject `fs.existsSync` or a storage-adapter `exists`.
 * - `existsFn` may be sync or async (returns `boolean | Promise<boolean>`).
 */
/**
 * Result of `resolveSkillDirTwoTier`. The `tier` field tells callers
 * which directory the skill was found in:
 *
 *   - `'user'`     — `.agents/skills/<name>/` (user fork / community / hand-authored)
 *   - `'managed'`  — `.arete/skills/<name>/`  (shipped, managed by `arete update`)
 *   - `'missing'`  — neither directory contains the skill
 */
export interface ResolveSkillDirResult {
    /** Resolved skill directory path (or the user-tier path when missing). */
    dir: string;
    tier: 'user' | 'managed' | 'missing';
    /** Path to the user-tier dir, regardless of which tier was selected. */
    userDir: string;
    /** Path to the managed-tier dir, regardless of which tier was selected. */
    managedDir: string;
}
/**
 * Resolve the active skill directory for a given slug, preferring the
 * user tier (`.agents/skills/<slug>/`) when it exists.
 */
export declare function resolveSkillDirTwoTier(workspaceRoot: string, skillSlug: string, existsFn: (path: string) => boolean | Promise<boolean>): Promise<ResolveSkillDirResult>;
/** Result of `resolveSkillFileTwoTier`. */
export interface TwoTierResolveResult {
    /** Final SKILL.md path the harness should load. */
    path: string;
    /** Which directory tier provided the skill. */
    tier: 'user' | 'managed' | 'missing';
    /** Path to the user-tier dir (regardless of selection). */
    userDir: string;
    /** Path to the managed-tier dir (regardless of selection). */
    managedDir: string;
}
/**
 * Resolve the SKILL.md file path for a given slug under Phase 3
 * two-tier resolution. Returns the user-tier path when missing so
 * callers can produce a clear "skill not installed at <userDir>" error.
 */
export declare function resolveSkillFileTwoTier(workspaceRoot: string, skillSlug: string, existsFn: (path: string) => boolean | Promise<boolean>): Promise<TwoTierResolveResult>;
//# sourceMappingURL=skill-resolver.d.ts.map