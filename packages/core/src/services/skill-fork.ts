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

import { join, basename, dirname } from 'path';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import type { StorageAdapter } from '../storage/adapter.js';
import {
  diffMarkdownSections,
  threeWayMergeSections,
  type MarkdownDiff,
  type MergeResult,
  type MergeHunk,
} from '../utils/markdown-diff.js';

/** Where the recorded base lives inside a user fork. */
const FORK_BASE_DIRNAME = '.fork-base';
/** Manifest file inside `.fork-base/` recording the snapshot hash + date. */
const FORK_BASE_MANIFEST = '.fork-base.yaml';

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
export async function forkSkill(
  storage: StorageAdapter,
  options: ForkSkillOptions,
): Promise<ForkSkillResult> {
  const { workspaceRoot, name, force = false } = options;
  const managedPath = join(workspaceRoot, '.arete', 'skills', name);
  const forkPath = join(workspaceRoot, '.agents', 'skills', name);

  const managedExists = await storage.exists(managedPath);
  if (!managedExists) {
    return {
      ok: false,
      forkPath,
      managedPath,
      alreadyExisted: false,
      error: `Managed skill not found: ${name} (looked at ${managedPath})`,
    };
  }

  const forkExists = await storage.exists(forkPath);
  if (forkExists) {
    // Already forked. Phase 3.5 B2 semantics:
    //
    // - SKILL.md: NEVER overwrite. The user's hand-edited content is
    //   the load-bearing artifact and is the only thing this skill
    //   resolution prefers from the user tier.
    // - Auxiliary files (templates/, LEARNINGS.md, anything else
    //   under managed except `.fork-base/` and SKILL.md): copy from
    //   managed only when MISSING in the fork. Never overwrite an
    //   existing user-tier copy. This makes `arete skill fork`
    //   idempotent against partial manual setups (e.g., user
    //   hand-created `.agents/skills/<name>/SKILL.md` and now wants a
    //   proper fork-base recorded — re-running fork backfills the aux
    //   files without trampling their SKILL.md).
    // - `.fork-base/`: (re-)record only when missing OR `--force`.
    const basePath = join(forkPath, FORK_BASE_DIRNAME);
    const auxCopied = await backfillAuxFiles(storage, managedPath, forkPath);
    const baseExists = await storage.exists(basePath);
    if (!baseExists || force) {
      const hash = await snapshotManagedAsBase(storage, managedPath, basePath);
      return {
        ok: true,
        forkPath,
        managedPath,
        alreadyExisted: true,
        baseHash: hash,
        auxFilesCopied: auxCopied,
      };
    }
    return {
      ok: true,
      forkPath,
      managedPath,
      alreadyExisted: true,
      auxFilesCopied: auxCopied,
    };
  }

  // Copy managed → fork.
  await copyDirectory(storage, managedPath, forkPath);

  // Snapshot managed → fork's `.fork-base/`.
  const basePath = join(forkPath, FORK_BASE_DIRNAME);
  const hash = await snapshotManagedAsBase(storage, managedPath, basePath);

  return {
    ok: true,
    forkPath,
    managedPath,
    alreadyExisted: false,
    baseHash: hash,
  };
}

/**
 * Phase 3.5 B2 — copy aux files (anything under managed except
 * `SKILL.md` and `.fork-base/`) into the fork only when the
 * corresponding user-tier path doesn't exist. Never overwrites an
 * existing user-tier file. Returns the list of relative paths
 * copied.
 *
 * This runs on the "fork already exists" branch of `forkSkill` so
 * that aux files (templates/, LEARNINGS.md) end up in the fork even
 * when the user hand-created the fork before running `arete skill
 * fork`.
 */
async function backfillAuxFiles(
  storage: StorageAdapter,
  managedPath: string,
  forkPath: string,
): Promise<string[]> {
  const copied: string[] = [];
  let managedFiles: string[];
  try {
    managedFiles = await storage.list(managedPath, { recursive: true });
  } catch {
    return copied;
  }
  for (const managedFile of managedFiles) {
    const rel = managedFile.slice(managedPath.length).replace(/^[/\\]/, '');
    if (rel.length === 0) continue;
    const topSegment = rel.split(/[/\\]/)[0];
    if (topSegment === 'SKILL.md') continue;
    if (topSegment === FORK_BASE_DIRNAME) continue;
    const forkFile = join(forkPath, rel);
    if (await storage.exists(forkFile)) continue;
    try {
      const content = await storage.read(managedFile);
      if (content === null) continue;
      await storage.mkdir(dirname(forkFile));
      await storage.write(forkFile, content);
      copied.push(rel);
    } catch {
      // Non-fatal; skip this file.
    }
  }
  return copied;
}

/**
 * Diff a user fork's recorded base vs current managed content. Used
 * by `arete skill diff` and by `arete update` to surface the
 * upstream-changed-skills summary.
 */
export async function diffSkill(
  storage: StorageAdapter,
  workspaceRoot: string,
  name: string,
): Promise<DiffSkillResult> {
  const managedPath = join(workspaceRoot, '.arete', 'skills', name);
  const forkPath = join(workspaceRoot, '.agents', 'skills', name);
  const basePath = join(forkPath, FORK_BASE_DIRNAME);
  const baseSkillMd = join(basePath, 'SKILL.md');
  const managedSkillMd = join(managedPath, 'SKILL.md');

  const baseExists = await storage.exists(baseSkillMd);
  if (!baseExists) {
    // No recorded base. Synthesize an empty diff with baseMissing flag.
    const managedContent = (await storage.read(managedSkillMd)) ?? '';
    return {
      upToDate: false,
      diff: { changes: [], unchanged: true },
      forkPath,
      managedPath,
      basePath: baseSkillMd,
      baseMissing: true,
    };
  }
  const managedContent = (await storage.read(managedSkillMd)) ?? '';
  const baseContent = (await storage.read(baseSkillMd)) ?? '';
  const diff = diffMarkdownSections(baseContent, managedContent);
  return {
    upToDate: diff.unchanged,
    diff,
    forkPath,
    managedPath,
    basePath: baseSkillMd,
    baseMissing: false,
  };
}

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
export async function mergeSkill(
  storage: StorageAdapter,
  options: MergeSkillOptions,
): Promise<MergeSkillResult> {
  const { workspaceRoot, name, onHunk, forceBaseUpdate = false } = options;
  const managedPath = join(workspaceRoot, '.arete', 'skills', name);
  const forkPath = join(workspaceRoot, '.agents', 'skills', name);
  const basePath = join(forkPath, FORK_BASE_DIRNAME);
  const baseSkillMd = join(basePath, 'SKILL.md');
  const managedSkillMd = join(managedPath, 'SKILL.md');
  const forkSkillMd = join(forkPath, 'SKILL.md');

  if (!(await storage.exists(forkSkillMd))) {
    return {
      ran: false,
      mergedContent: '',
      conflicts: [],
      hunks: [],
      clean: false,
      baseUpdated: false,
      error: `User fork not found at ${forkSkillMd}. Run \`arete skill fork ${name}\` first.`,
    };
  }
  if (!(await storage.exists(managedSkillMd))) {
    return {
      ran: false,
      mergedContent: '',
      conflicts: [],
      hunks: [],
      clean: false,
      baseUpdated: false,
      error: `Managed skill not found at ${managedSkillMd}.`,
    };
  }
  const baseExists = await storage.exists(baseSkillMd);

  const baseContent = baseExists ? ((await storage.read(baseSkillMd)) ?? '') : '';
  const localContent = (await storage.read(forkSkillMd)) ?? '';
  const incomingContent = (await storage.read(managedSkillMd)) ?? '';

  // Auto-merge.
  const auto = threeWayMergeSections(baseContent, localContent, incomingContent);

  // Interactive override: walk hunks, ask user, rewrite per decision.
  let finalResult: MergeResult = auto;
  if (onHunk) {
    finalResult = await applyHunkDecisions(
      auto,
      onHunk,
      baseContent,
      localContent,
      incomingContent,
    );
  }

  // Write merged content to the fork.
  await storage.write(forkSkillMd, finalResult.merged);

  // Update `.fork-base/` only on clean merges (or when forced).
  let baseUpdated = false;
  let baseHash: string | undefined;
  if (finalResult.clean || forceBaseUpdate) {
    baseHash = await snapshotManagedAsBase(storage, managedPath, basePath);
    baseUpdated = true;
  }

  return {
    ran: true,
    mergedContent: finalResult.merged,
    conflicts: finalResult.conflicts,
    hunks: finalResult.hunks,
    clean: finalResult.clean,
    baseUpdated,
    baseHash,
  };
}

/**
 * For each managed skill that has a corresponding user fork, return
 * whether upstream has changes the user fork hasn't picked up yet.
 * Used by `arete update` to print the summary banner.
 */
export async function summarizeUpstreamChanges(
  storage: StorageAdapter,
  workspaceRoot: string,
): Promise<UpstreamChangedSkill[]> {
  const managedDir = join(workspaceRoot, '.arete', 'skills');
  const userDir = join(workspaceRoot, '.agents', 'skills');

  if (!(await storage.exists(managedDir))) return [];
  if (!(await storage.exists(userDir))) return [];

  const userSubdirs = await storage.listSubdirectories(userDir);
  const result: UpstreamChangedSkill[] = [];
  for (const userPath of userSubdirs) {
    const name = basename(userPath);
    const managedPath = join(managedDir, name);
    if (!(await storage.exists(managedPath))) continue;
    const diff = await diffSkill(storage, workspaceRoot, name);
    if (diff.baseMissing) {
      // Compare fork SKILL.md vs managed SKILL.md directly. If they
      // match, nothing to surface; if they differ, treat as changed
      // (the user has either edited or never refreshed).
      const forkContent = (await storage.read(join(userPath, 'SKILL.md'))) ?? '';
      const managedContent = (await storage.read(join(managedPath, 'SKILL.md'))) ?? '';
      if (forkContent === managedContent) continue;
      const wholesaleDiff = diffMarkdownSections(forkContent, managedContent);
      if (wholesaleDiff.unchanged) continue;
      result.push({
        name,
        hasFork: true,
        baseMissing: true,
        changeCount: wholesaleDiff.changes.length,
      });
      continue;
    }
    if (!diff.upToDate) {
      result.push({
        name,
        hasFork: true,
        baseMissing: false,
        changeCount: diff.diff.changes.length,
      });
    }
  }
  return result;
}

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
export async function migratePreSplitAgentSkills(
  storage: StorageAdapter,
  agentSkillsDir: string,
  managedSkillsDir: string,
  options: MigratePreSplitOptions = {},
): Promise<MigratePreSplitResult> {
  const removed: string[] = [];
  const preserved: string[] = [];
  const cleaned: MigrationCleanup[] = [];

  if (!(await storage.exists(agentSkillsDir))) {
    return { removed, preserved, cleaned };
  }
  if (!(await storage.exists(managedSkillsDir))) {
    // No managed dir yet — nothing to migrate against. Caller
    // (workspace.update) syncs managed BEFORE calling this; in tests
    // this branch is rare.
    return { removed, preserved, cleaned };
  }

  const userSubdirs = await storage.listSubdirectories(agentSkillsDir);
  for (const userPath of userSubdirs) {
    const name = basename(userPath);
    const managedPath = join(managedSkillsDir, name);

    if (!(await storage.exists(managedPath))) {
      // Case 3: community / hand-authored skill. Leave alone.
      preserved.push(name);
      continue;
    }

    const userSkillMd = join(userPath, 'SKILL.md');
    const managedSkillMd = join(managedPath, 'SKILL.md');
    const userContent = await storage.read(userSkillMd);
    const managedContent = await storage.read(managedSkillMd);

    // Phase 3.5 A2 — opportunistic cleanup of stale SKILL.legacy.md.
    // Run BEFORE the byte-equal/fork branching so that legacy removal
    // happens whether the user's SKILL.md ends up pruned or preserved.
    await cleanupStaleLegacy(storage, userPath, options.sourceSkillsDir, name, cleaned);

    // Phase 3.5 A3 — opportunistic dedup of byte-equal aux files.
    // Same rationale: dedup runs whether the user's SKILL.md is
    // pruned (case 1) or preserved (case 2). The dedup target is the
    // user-tier `.agents/skills/<name>/` aux files when their byte
    // content matches `.arete/skills/<name>/`.
    await dedupAuxFiles(storage, userPath, managedPath, name, cleaned);

    if (userContent === null || managedContent === null) {
      // Either side missing SKILL.md — preserve and let later flows
      // surface the breakage; never silently delete.
      preserved.push(name);
      // Phase 3.5 A4 — empty-dir cleanup AFTER aux dedup may have
      // emptied the user dir.
      await pruneEmptyUserDir(storage, userPath, name, cleaned);
      continue;
    }

    if (userContent === managedContent) {
      // Case 1: byte-equal. Safe to remove UNLESS the user has an
      // explicit `.fork-base/` (meaning they ran `arete skill fork`
      // and the fact that the fork is currently byte-equal is
      // incidental — they've signaled intent to track this skill as
      // a fork). Preserve in that case.
      const forkBaseExists = await storage.exists(join(userPath, FORK_BASE_DIRNAME));
      if (forkBaseExists) {
        preserved.push(name);
        continue;
      }
      try {
        await deleteDirectory(storage, userPath);
        removed.push(name);
      } catch {
        // Removal failure is non-fatal; treat as preserved so the
        // user isn't lied to in the update summary.
        preserved.push(name);
      }
      continue;
    }

    // Case 2: user fork (edited).
    preserved.push(name);

    // Phase 3.5 B1 — auto-record `.fork-base/` when the user's
    // SKILL.md content matches a known prior shipped version. Without
    // this, `arete skill diff <name>` errors with "no fork base
    // recorded" and the user has to choose between
    // `arete skill fork --force` or manual recovery. Best-effort —
    // skipped silently if git history is unavailable or no match
    // found.
    if (options.autoForkBase && options.sourceSkillsDir) {
      const forkBasePath = join(userPath, FORK_BASE_DIRNAME);
      const forkBaseExists = await storage.exists(forkBasePath);
      if (!forkBaseExists) {
        const matched = await tryAutoForkBase(
          storage,
          userPath,
          managedPath,
          options.sourceSkillsDir,
          name,
          userContent,
          options.gitWorkingDir,
        );
        if (matched) {
          cleaned.push({ name, kind: 'auto_fork_base', path: forkBasePath });
        }
      }
    }

    // Phase 3.5 A4 — empty-dir cleanup after aux dedup may have
    // emptied the user dir (e.g., user removed SKILL.md but left
    // templates/ behind which then byte-deduped to the managed copy).
    await pruneEmptyUserDir(storage, userPath, name, cleaned);
  }

  return { removed, preserved, cleaned };
}

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

/**
 * Phase 3.5 A2 — remove stale `<userDir>/SKILL.legacy.md` when the
 * corresponding source `<sourceSkillsDir>/<name>/SKILL.legacy.md` is
 * gone. MC5 sunset removed all source `.legacy.md` files; user-side
 * copies that survived earlier updates are stale and should be
 * cleaned. Caller may omit `sourceSkillsDir` to suppress A2 cleanup.
 */
async function cleanupStaleLegacy(
  storage: StorageAdapter,
  userPath: string,
  sourceSkillsDir: string | undefined,
  name: string,
  cleaned: MigrationCleanup[],
): Promise<void> {
  if (!sourceSkillsDir) return;
  const userLegacy = join(userPath, 'SKILL.legacy.md');
  if (!(await storage.exists(userLegacy))) return;
  const sourceLegacy = join(sourceSkillsDir, name, 'SKILL.legacy.md');
  // Only remove when source is gone — otherwise the user might
  // still be relying on it for some experimental flag we don't know
  // about.
  if (await storage.exists(sourceLegacy)) return;
  try {
    await storage.delete(userLegacy);
    cleaned.push({ name, kind: 'legacy_skill', path: userLegacy });
  } catch {
    // Non-fatal.
  }
}

/**
 * Phase 3.5 A3 — for each top-level entry in `.agents/skills/<name>/`
 * (excluding `SKILL.md`, `.fork-base/`, hidden dotfiles), if a
 * byte-equal copy exists at the same relative path under
 * `.arete/skills/<name>/`, remove the user-tier copy. Byte equality
 * means the user has not customized it — keeping the duplicate is
 * cruft that this migration cleans up.
 *
 * Templates dirs are walked recursively; LEARNINGS.md / aux .md files
 * are top-level entries. The `.fork-base/` snapshot is preserved
 * unconditionally (it's the diff source-of-truth).
 */
async function dedupAuxFiles(
  storage: StorageAdapter,
  userPath: string,
  managedPath: string,
  name: string,
  cleaned: MigrationCleanup[],
): Promise<void> {
  // Walk every file under userPath recursively, compute its rel path,
  // skip SKILL.md / .fork-base/, and compare against managed's
  // file at the same rel path.
  let userFiles: string[];
  try {
    userFiles = await storage.list(userPath, { recursive: true });
  } catch {
    return;
  }
  for (const userFile of userFiles) {
    const rel = userFile.slice(userPath.length).replace(/^[/\\]/, '');
    if (rel.length === 0) continue;
    const topSegment = rel.split(/[/\\]/)[0];
    if (topSegment === 'SKILL.md') continue;
    if (topSegment === FORK_BASE_DIRNAME) continue;
    // Ignore other dotfiles defensively (no aux dedup of
    // `.arete-meta.yaml`, etc.) — those carry user metadata.
    if (topSegment.startsWith('.')) continue;

    const managedFile = join(managedPath, rel);
    if (!(await storage.exists(managedFile))) continue;
    const userContent = await storage.read(userFile);
    const managedContent = await storage.read(managedFile);
    if (userContent === null || managedContent === null) continue;
    if (userContent !== managedContent) continue;
    try {
      await storage.delete(userFile);
      cleaned.push({ name, kind: 'aux_dedup', path: userFile });
    } catch {
      // Non-fatal.
    }
  }
}

/**
 * Phase 3.5 A4 — remove `.agents/skills/<name>/` entirely when no
 * substantive content remains (no SKILL.md, no aux files, no
 * `.fork-base/`). Idempotent: a previously-pruned dir is a no-op.
 *
 * "No substantive content" = `storage.list(userPath, { recursive: true })`
 * returns no files. (Empty subdirs are treated as no-content for the
 * adapter implementations we care about.)
 */
async function pruneEmptyUserDir(
  storage: StorageAdapter,
  userPath: string,
  name: string,
  cleaned: MigrationCleanup[],
): Promise<void> {
  if (!(await storage.exists(userPath))) return;
  let files: string[];
  try {
    files = await storage.list(userPath, { recursive: true });
  } catch {
    return;
  }
  if (files.length > 0) return;
  try {
    await storage.delete(userPath);
    cleaned.push({ name, kind: 'empty_dir', path: userPath });
  } catch {
    // Non-fatal.
  }
}

/**
 * Phase 3.5 B1 — search the runtime source's git history for a prior
 * shipped version of `<name>/SKILL.md` whose content matches the
 * user's `<userPath>/SKILL.md`. On match, snapshot the matched
 * revision's tree into `<userPath>/.fork-base/`.
 *
 * Returns true when a match was recorded, false otherwise (no git,
 * no match, or any failure path — all best-effort and silent).
 *
 * Implementation walks at most 30 commits of the file's history (the
 * file rarely has more than 5–10 substantive revisions; 30 is a
 * generous ceiling that bounds latency). Uses `git log --pretty=%H`
 * and `git show <sha>:<path>` via execFileSync. Each git invocation
 * is best-effort; any throw aborts the search and returns false.
 */
async function tryAutoForkBase(
  storage: StorageAdapter,
  userPath: string,
  managedPath: string,
  sourceSkillsDir: string,
  name: string,
  userContent: string,
  gitWorkingDirOverride?: string,
): Promise<boolean> {
  // Resolve git working dir. Default: the parent of the runtime source
  // skills dir (e.g., package root if sourceSkillsDir is
  // "<repo>/packages/runtime/skills").
  const gitDir = gitWorkingDirOverride ?? findGitWorkingDir(sourceSkillsDir);
  if (!gitDir) return false;

  // Determine the relative path inside the git repo of
  // `<sourceSkillsDir>/<name>/SKILL.md`.
  const sourceSkillMd = join(sourceSkillsDir, name, 'SKILL.md');
  const relPath = relativizeForGit(gitDir, sourceSkillMd);
  if (!relPath) return false;

  let commits: string[];
  try {
    const out = execFileSync(
      'git',
      ['log', '--pretty=%H', '-n', '30', '--', relPath],
      { cwd: gitDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    commits = out.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0);
  } catch {
    return false;
  }
  if (commits.length === 0) return false;

  for (const sha of commits) {
    let revContent: string;
    try {
      revContent = execFileSync(
        'git',
        ['show', `${sha}:${relPath}`],
        { cwd: gitDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      );
    } catch {
      // File may not have existed at this commit; keep walking.
      continue;
    }
    if (revContent === userContent) {
      // Match found. Snapshot the *current managed* tree as
      // `.fork-base/` rather than the matched commit's tree, because
      // we're recording "what the user's fork was based on" and the
      // user's SKILL.md is the source of truth for that base. We
      // record the SKILL.md byte-for-byte to ensure the diff against
      // current managed shows accurate "what changed since you
      // forked" output.
      try {
        const basePath = join(userPath, FORK_BASE_DIRNAME);
        if (await storage.exists(basePath)) {
          // Don't overwrite an existing fork-base — caller already
          // gated on its absence, but handle race defensively.
          return false;
        }
        await storage.mkdir(basePath);
        // Write the matched historical SKILL.md as the base.
        await storage.write(join(basePath, 'SKILL.md'), revContent);
        // Hash of the matched content.
        const hash = createHash('sha256').update(revContent).digest('hex');
        const manifest = [
          `# Phase 3.5 auto-recorded fork-base manifest. Recorded by`,
          `# \`arete update\` migration when the user's SKILL.md byte-equaled`,
          `# a prior shipped revision found in git history.`,
          `version: 1`,
          `recorded_at: ${new Date().toISOString()}`,
          `skill_md_sha256: ${hash}`,
          `auto_recorded: true`,
          `matched_commit: ${sha}`,
          '',
        ].join('\n');
        await storage.write(join(basePath, FORK_BASE_MANIFEST), manifest);
        // Reference managedPath to silence unused-arg lint; reserved
        // for future use (e.g., snapshot full managed tree alongside
        // SKILL.md).
        void managedPath;
        return true;
      } catch {
        return false;
      }
    }
  }
  return false;
}

/**
 * Walk up from `<sourceSkillsDir>` looking for a `.git/` directory.
 * Returns the directory containing it, or null if none found.
 */
function findGitWorkingDir(sourceSkillsDir: string): string | null {
  let current = sourceSkillsDir;
  while (current && current !== dirname(current)) {
    const gitDir = join(current, '.git');
    try {
      // execFileSync rev-parse to confirm it's a real git repo.
      execFileSync('git', ['rev-parse', '--git-dir'], {
        cwd: current,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return current;
    } catch {
      // Try parent.
    }
    void gitDir;
    current = dirname(current);
  }
  return null;
}

/**
 * Compute the path of `target` relative to `base`, suitable for use
 * as a git pathspec. Returns null if `target` isn't under `base`.
 */
function relativizeForGit(base: string, target: string): string | null {
  if (!target.startsWith(base)) return null;
  const rel = target.slice(base.length).replace(/^[/\\]/, '');
  if (rel.length === 0) return null;
  return rel.split(/[/\\]/).join('/');
}

// ---- internal helpers ----

async function snapshotManagedAsBase(
  storage: StorageAdapter,
  managedPath: string,
  basePath: string,
): Promise<string> {
  // Wipe + recreate the base dir. We cannot do an in-place overwrite
  // safely without tracking removals.
  if (await storage.exists(basePath)) {
    await deleteDirectory(storage, basePath);
  }
  await storage.mkdir(basePath);
  await copyDirectoryContents(storage, managedPath, basePath, {
    exclude: new Set([FORK_BASE_DIRNAME, FORK_BASE_MANIFEST]),
  });
  // Compute hash of SKILL.md.
  const skillMdContent = (await storage.read(join(managedPath, 'SKILL.md'))) ?? '';
  const hash = createHash('sha256').update(skillMdContent).digest('hex');
  // Manifest yaml — minimal shape, no `yaml` dep needed.
  const manifest = [
    `# Phase 3 fork-base manifest. Do not hand-edit; rewritten on \`arete skill fork --force\` /`,
    `# \`arete skill merge\`. The hash is sha256(SKILL.md) of the managed content at fork time.`,
    `version: 1`,
    `recorded_at: ${new Date().toISOString()}`,
    `skill_md_sha256: ${hash}`,
    '',
  ].join('\n');
  await storage.write(join(basePath, FORK_BASE_MANIFEST), manifest);
  return hash;
}

async function copyDirectory(
  storage: StorageAdapter,
  src: string,
  dest: string,
): Promise<void> {
  await storage.mkdir(dest);
  await copyDirectoryContents(storage, src, dest);
}

async function copyDirectoryContents(
  storage: StorageAdapter,
  src: string,
  dest: string,
  options: { exclude?: Set<string> } = {},
): Promise<void> {
  const exclude = options.exclude ?? new Set<string>();
  const files = await storage.list(src, { recursive: true });
  for (const srcFile of files) {
    const rel = srcFile.slice(src.length).replace(/^[/\\]/, '');
    // Skip excluded top-level entries.
    const topSegment = rel.split(/[/\\]/)[0];
    if (exclude.has(topSegment)) continue;
    const destFile = join(dest, rel);
    const content = await storage.read(srcFile);
    if (content === null) continue;
    await storage.mkdir(dirname(destFile));
    await storage.write(destFile, content);
  }
}

async function deleteDirectory(
  storage: StorageAdapter,
  dir: string,
): Promise<void> {
  if (!(await storage.exists(dir))) return;
  const files = await storage.list(dir, { recursive: true });
  for (const f of files) {
    try {
      await storage.delete(f);
    } catch {
      // Best effort.
    }
  }
  // Some storage adapters require explicit dir removal; the file-based
  // adapter cleans up empty dirs in delete(). For others, we attempt:
  try {
    await storage.delete(dir);
  } catch {
    // If the adapter doesn't support directory delete, that's fine —
    // empty subdirs are harmless.
  }
}

/**
 * Apply per-hunk decisions to an auto-merge result. Walks every
 * non-trivial hunk, asks the caller, and rebuilds the merged
 * document. Pure rewrite — the auto-merge is the source of truth for
 * section ordering.
 */
async function applyHunkDecisions(
  auto: MergeResult,
  onHunk: (hunk: MergeHunk) => Promise<HunkDecision> | HunkDecision,
  baseContent: string,
  localContent: string,
  incomingContent: string,
): Promise<MergeResult> {
  // Re-parse the three sides to access section bodies by heading.
  const { parseMarkdownSections, renderSections } = await import(
    '../utils/markdown-diff.js'
  );
  const localMap = new Map(parseMarkdownSections(localContent).map((s) => [s.heading, s.body]));
  const incomingMap = new Map(
    parseMarkdownSections(incomingContent).map((s) => [s.heading, s.body]),
  );
  // baseMap unused for decision logic (decisions only choose between local /
  // incoming or accept the auto-merge body), but kept for future use.
  void baseContent;

  // Rebuild the merged document from the auto-merge's hunk order.
  // For each hunk, the auto already chose a body and emitted it in
  // `auto.merged`. We rewrite per-hunk based on the decision.
  const autoSections = parseMarkdownSections(auto.merged);
  const finalSections: { heading: string; body: string }[] = [];
  const conflicts: string[] = [];

  for (let i = 0; i < auto.hunks.length; i++) {
    const hunk = auto.hunks[i];
    const autoSection = autoSections[i];
    if (!autoSection) {
      // Defensive — should not happen because hunks are produced 1:1
      // with output sections (except for fully-removed sections, which
      // are not in the hunks list either).
      continue;
    }

    // Always-trivial hunks: caller doesn't need to decide.
    if (
      hunk.kind === 'unchanged' ||
      hunk.kind === 'both-agree' ||
      hunk.kind === 'incoming-add' ||
      hunk.kind === 'incoming-only' ||
      hunk.kind === 'incoming-restore' ||
      hunk.kind === 'local-add' ||
      hunk.kind === 'local-only' ||
      hunk.kind === 'local-keep-removed'
    ) {
      const decision = await onHunk(hunk);
      if (decision === 'keep-local' || decision === 'skip') {
        const lb = localMap.get(hunk.heading);
        if (lb !== undefined) {
          finalSections.push({ heading: hunk.heading, body: lb });
        }
        // If local doesn't have the section (e.g. incoming-add and
        // user said "keep-local"), drop it — they're saying don't
        // take incoming.
        continue;
      }
      if (decision === 'take-incoming') {
        const ib = incomingMap.get(hunk.heading);
        if (ib !== undefined) {
          finalSections.push({ heading: hunk.heading, body: ib });
        }
        continue;
      }
      // 'accept' — use the auto body.
      finalSections.push({ heading: autoSection.heading, body: autoSection.body });
      continue;
    }

    // Conflict hunks.
    const decision = await onHunk(hunk);
    if (decision === 'keep-local' || decision === 'skip') {
      const lb = localMap.get(hunk.heading);
      if (lb !== undefined) {
        finalSections.push({ heading: hunk.heading, body: lb });
      }
      continue;
    }
    if (decision === 'take-incoming') {
      const ib = incomingMap.get(hunk.heading);
      if (ib !== undefined) {
        finalSections.push({ heading: hunk.heading, body: ib });
      }
      continue;
    }
    // 'accept' — keep the auto's conflict-marker body.
    finalSections.push({ heading: autoSection.heading, body: autoSection.body });
    conflicts.push(hunk.heading);
  }

  return {
    merged: renderSections(finalSections),
    conflicts,
    hunks: auto.hunks,
    clean: conflicts.length === 0,
  };
}
