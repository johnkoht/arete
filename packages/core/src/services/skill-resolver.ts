/**
 * Skill-prose resolver (Phase 2 — legacy SKILL.md routing).
 *
 * Per Phase 2 plan §(e) — MC2 ship gate: each chef-orchestrator skill
 * ships with two artifacts:
 *
 *   1. `<skill-dir>/SKILL.md`        — the new chef-orchestrator prose
 *   2. `<skill-dir>/SKILL.legacy.md` — verbatim pre-rewrite copy
 *
 * The agent harness reads `ARETE_LEGACY_SKILL_PROSE` (comma-separated
 * skill slugs) at skill-resolve time. For each named skill, the
 * harness routes to `SKILL.legacy.md` instead of `SKILL.md`. Per-skill
 * routing means John can run new daily-winddown but legacy meeting-prep
 * if the latter regresses mid-soak.
 *
 * The rollback mechanism: Phase 2 wrap-up commit removes both
 * `SKILL.legacy.md` files AND this resolver code. Until then, the
 * resolver is the structural escape hatch (per MC2 ship gate).
 *
 * Phase 3: two-tier skill directory resolution. Skills live in two
 * tiers:
 *
 *   1. `<workspace>/.agents/skills/<name>/`  - user customizations
 *      (forks via `arete skill fork`, community installs, hand-authored).
 *      Survives `arete update`.
 *   2. `<workspace>/.arete/skills/<name>/`   - managed/shipped skills.
 *      Refreshed on `arete update`. Read-only by convention.
 *
 * Tier 1 wins when present; tier 2 is fallback. See
 * `resolveSkillDir()` and `resolveSkillFileTwoTier()`.
 *
 * Design notes:
 * - Pure function `resolveSkillFile()` — no I/O. Caller checks
 *   existence (storage adapter, fs, etc.).
 * - `parseLegacyList()` is exported for testability.
 * - Empty / unset / malformed env var → no skills routed (returns []).
 * - Whitespace and empty entries are tolerated:
 *     "daily-winddown,, meeting-prep ,," → ["daily-winddown", "meeting-prep"]
 */

import { join } from 'path';

/**
 * Parse the `ARETE_LEGACY_SKILL_PROSE` env var into a normalized list.
 *
 * Comma-separated skill slugs. Whitespace tolerated. Empty entries
 * (from trailing commas, double commas) dropped silently.
 *
 * Returns lowercased slugs. Skill slugs in the runtime are always
 * lowercased; normalizing here means consumers don't need to.
 */
export function parseLegacyList(envValue: string | undefined): string[] {
  if (!envValue || typeof envValue !== 'string') return [];
  return envValue
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Decide which SKILL.md file path to resolve for a given skill slug,
 * considering the legacy env var list. Pure function — does not check
 * file existence. The caller is responsible for verifying the legacy
 * file exists (and falling back to SKILL.md if not).
 *
 * Returns:
 *   - `<skillDir>/SKILL.legacy.md` when slug is in legacyList
 *   - `<skillDir>/SKILL.md` otherwise
 */
export function resolveSkillFile(
  skillDir: string,
  skillSlug: string,
  legacyList: readonly string[],
): string {
  const normalizedSlug = skillSlug.toLowerCase();
  const useLegacy = legacyList.includes(normalizedSlug);
  return useLegacy
    ? join(skillDir, 'SKILL.legacy.md')
    : join(skillDir, 'SKILL.md');
}

/**
 * High-level resolver that reads ARETE_LEGACY_SKILL_PROSE from the
 * environment, parses it, and returns the resolved path.
 *
 * Caller should verify the resolved file exists; if not (e.g., legacy
 * file missing for a skill that's in the env var list), caller should
 * fall back to the live SKILL.md and log a warning. This fallback is
 * NOT done here — the resolver is pure path math; existence checks
 * belong in the I/O layer (storage adapter or fs).
 *
 * @param skillDir Absolute path to the skill's directory
 *                 (e.g. `<workspace>/.agents/skills/daily-winddown`)
 * @param skillSlug The skill's slug (matches the directory name)
 * @param env Process env (default: `process.env`). Inject for testing.
 */
export function resolveSkillFileFromEnv(
  skillDir: string,
  skillSlug: string,
  env: NodeJS.ProcessEnv = process.env,
): {
  /** The path the resolver chose. */
  path: string;
  /** True if the env var routed this skill to legacy. */
  legacy: boolean;
  /** The parsed list of legacy-routed slugs (for diagnostics). */
  legacyList: string[];
} {
  const legacyList = parseLegacyList(env['ARETE_LEGACY_SKILL_PROSE']);
  const path = resolveSkillFile(skillDir, skillSlug, legacyList);
  const legacy = legacyList.includes(skillSlug.toLowerCase());
  return { path, legacy, legacyList };
}

/**
 * Result of the I/O-aware resolver — checks file existence and
 * falls back to live SKILL.md when the legacy file is missing.
 *
 * Caller passes an `existsFn` (storage adapter or fs.existsSync) so
 * this stays decoupled from any specific I/O layer.
 */
export interface ResolveSkillFileResult {
  /** The resolved file path. */
  path: string;
  /** Was legacy mode requested for this skill via env var. */
  legacyRequested: boolean;
  /** Did the resolver actually use the legacy file. */
  legacyUsed: boolean;
  /** Warning message when fallback occurred (legacy requested but missing). */
  warning?: string;
}

/**
 * I/O-aware resolver. Checks file existence and falls back from
 * SKILL.legacy.md to SKILL.md if the legacy file is missing.
 *
 * Returns a ResolveSkillFileResult that includes a warning when
 * legacy was requested but the file was absent — caller can surface
 * this to the user / agent.
 */
export async function resolveSkillFileWithFallback(
  skillDir: string,
  skillSlug: string,
  existsFn: (path: string) => boolean | Promise<boolean>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResolveSkillFileResult> {
  const { legacy: legacyRequested, legacyList } = resolveSkillFileFromEnv(
    skillDir,
    skillSlug,
    env,
  );

  const livePath = join(skillDir, 'SKILL.md');
  const legacyPath = join(skillDir, 'SKILL.legacy.md');

  if (legacyRequested) {
    const legacyExists = await Promise.resolve(existsFn(legacyPath));
    if (legacyExists) {
      return {
        path: legacyPath,
        legacyRequested: true,
        legacyUsed: true,
      };
    }
    return {
      path: livePath,
      legacyRequested: true,
      legacyUsed: false,
      warning: `ARETE_LEGACY_SKILL_PROSE requested legacy for "${skillSlug}" but ${legacyPath} does not exist; falling back to live SKILL.md`,
    };
  }

  // Suppress the unused-var lint for legacyList (kept for API symmetry)
  void legacyList;

  return {
    path: livePath,
    legacyRequested: false,
    legacyUsed: false,
  };
}

// ----------------------------------------------------------------
// Phase 3 — two-tier skill directory resolution
// ----------------------------------------------------------------

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
 * user tier (`.agents/skills/<slug>/`) when it exists. Pure path math
 * with one I/O dependency (existsFn) so the caller can inject `fs.existsSync`
 * or a storage-adapter `exists`.
 *
 * Async-friendly: `existsFn` may return `boolean` or `Promise<boolean>`.
 */
export async function resolveSkillDirTwoTier(
  workspaceRoot: string,
  skillSlug: string,
  existsFn: (path: string) => boolean | Promise<boolean>,
): Promise<ResolveSkillDirResult> {
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
 * Two-tier resolver that ALSO honors `ARETE_LEGACY_SKILL_PROSE` for
 * legacy SKILL.md routing. Combines `resolveSkillDirTwoTier` with the
 * legacy fallback. Returns the absolute path to the SKILL*.md file
 * the harness should load.
 *
 * Resolution order:
 *   1. Pick the active skill directory (user wins, then managed).
 *   2. Within that directory, route to SKILL.legacy.md when the env
 *      var lists this slug AND the legacy file exists; otherwise to
 *      SKILL.md.
 *   3. If neither tier has the skill, return the user-tier path with
 *      `tier: 'missing'` so callers can produce a clear error.
 *
 * Phase 3 Step 9 will remove the legacy routing path; the two-tier
 * directory resolution stays.
 */
export interface TwoTierResolveResult {
  /** Final SKILL.md path the harness should load. */
  path: string;
  /** Which directory tier provided the skill. */
  tier: 'user' | 'managed' | 'missing';
  /** Path to the user-tier dir (regardless of selection). */
  userDir: string;
  /** Path to the managed-tier dir (regardless of selection). */
  managedDir: string;
  /** Was legacy SKILL.md requested for this slug. */
  legacyRequested: boolean;
  /** Did the resolver actually use the legacy file. */
  legacyUsed: boolean;
  /** Warning when legacy was requested but the file was absent. */
  warning?: string;
}

export async function resolveSkillFileTwoTier(
  workspaceRoot: string,
  skillSlug: string,
  existsFn: (path: string) => boolean | Promise<boolean>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<TwoTierResolveResult> {
  const dirResult = await resolveSkillDirTwoTier(workspaceRoot, skillSlug, existsFn);

  if (dirResult.tier === 'missing') {
    return {
      path: join(dirResult.dir, 'SKILL.md'),
      tier: 'missing',
      userDir: dirResult.userDir,
      managedDir: dirResult.managedDir,
      legacyRequested: false,
      legacyUsed: false,
    };
  }

  const fileResult = await resolveSkillFileWithFallback(
    dirResult.dir,
    skillSlug,
    existsFn,
    env,
  );

  return {
    path: fileResult.path,
    tier: dirResult.tier,
    userDir: dirResult.userDir,
    managedDir: dirResult.managedDir,
    legacyRequested: fileResult.legacyRequested,
    legacyUsed: fileResult.legacyUsed,
    warning: fileResult.warning,
  };
}
