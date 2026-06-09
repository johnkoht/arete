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
import { join } from 'path';
/**
 * Resolve the active skill directory for a given slug, preferring the
 * user tier (`.agents/skills/<slug>/`) when it exists.
 */
export async function resolveSkillDirTwoTier(workspaceRoot, skillSlug, existsFn) {
    const userDir = join(workspaceRoot, '.agents', 'skills', skillSlug);
    const managedDir = join(workspaceRoot, '.arete', 'skills', skillSlug);
    const userExists = await Promise.resolve(existsFn(userDir));
    if (userExists) {
        return { dir: userDir, tier: 'user', userDir, managedDir };
    }
    const managedExists = await Promise.resolve(existsFn(managedDir));
    if (managedExists) {
        return { dir: managedDir, tier: 'managed', userDir, managedDir };
    }
    return { dir: userDir, tier: 'missing', userDir, managedDir };
}
/**
 * Resolve the SKILL.md file path for a given slug under Phase 3
 * two-tier resolution. Returns the user-tier path when missing so
 * callers can produce a clear "skill not installed at <userDir>" error.
 */
export async function resolveSkillFileTwoTier(workspaceRoot, skillSlug, existsFn) {
    const dirResult = await resolveSkillDirTwoTier(workspaceRoot, skillSlug, existsFn);
    return {
        path: join(dirResult.dir, 'SKILL.md'),
        tier: dirResult.tier,
        userDir: dirResult.userDir,
        managedDir: dirResult.managedDir,
    };
}
//# sourceMappingURL=skill-resolver.js.map