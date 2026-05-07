/**
 * Phase 3.5 polish tests for skill-fork:
 *
 * - A2 (stale legacy cleanup)
 * - A3 (byte-equal aux dedup)
 * - A4 (empty user-dir prune)
 * - B1 (auto-fork-base from git history) — best-effort; tested via
 *   real git workflow under a tmp repo.
 * - B2 (forkSkill aux-file backfill on pre-existing user dir)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import {
  migratePreSplitAgentSkills,
  forkSkill,
} from '../../src/services/skill-fork.js';

function makeWorkspace(): {
  root: string;
  storage: FileStorageAdapter;
  managedDir: string;
  agentDir: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'phase-3-5-skill-fork-'));
  const storage = new FileStorageAdapter();
  const managedDir = join(root, '.arete', 'skills');
  const agentDir = join(root, '.agents', 'skills');
  mkdirSync(managedDir, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  return { root, storage, managedDir, agentDir };
}

function cleanup(root: string): void {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

describe('migratePreSplitAgentSkills — A2 (stale legacy cleanup)', () => {
  let ws: ReturnType<typeof makeWorkspace>;
  let sourceDir: string;
  beforeEach(() => {
    ws = makeWorkspace();
    sourceDir = join(ws.root, 'source-runtime', 'skills');
    mkdirSync(sourceDir, { recursive: true });
  });
  afterEach(() => cleanup(ws.root));

  it('removes user SKILL.legacy.md when source legacy is gone', async () => {
    // Source: only has SKILL.md (post-MC5; .legacy.md is gone).
    mkdirSync(join(sourceDir, 'foo'));
    writeFileSync(join(sourceDir, 'foo', 'SKILL.md'), 'managed body');
    // Managed mirror.
    mkdirSync(join(ws.managedDir, 'foo'));
    writeFileSync(join(ws.managedDir, 'foo', 'SKILL.md'), 'managed body');
    // User has stale legacy AND a customized SKILL.md.
    mkdirSync(join(ws.agentDir, 'foo'));
    writeFileSync(join(ws.agentDir, 'foo', 'SKILL.md'), 'user customized');
    writeFileSync(join(ws.agentDir, 'foo', 'SKILL.legacy.md'), 'old legacy prose');

    const result = await migratePreSplitAgentSkills(
      ws.storage,
      ws.agentDir,
      ws.managedDir,
      { sourceSkillsDir: sourceDir },
    );
    assert.deepEqual(result.preserved, ['foo']);
    assert(!existsSync(join(ws.agentDir, 'foo', 'SKILL.legacy.md')));
    // User's SKILL.md preserved.
    assert.equal(
      readFileSync(join(ws.agentDir, 'foo', 'SKILL.md'), 'utf8'),
      'user customized',
    );
    assert.equal(result.cleaned.length, 1);
    assert.equal(result.cleaned[0].kind, 'legacy_skill');
    assert.equal(result.cleaned[0].name, 'foo');
  });

  it('preserves user SKILL.legacy.md when source legacy still exists', async () => {
    mkdirSync(join(sourceDir, 'foo'));
    writeFileSync(join(sourceDir, 'foo', 'SKILL.md'), 'managed body');
    writeFileSync(join(sourceDir, 'foo', 'SKILL.legacy.md'), 'legacy still shipped');
    mkdirSync(join(ws.managedDir, 'foo'));
    writeFileSync(join(ws.managedDir, 'foo', 'SKILL.md'), 'managed body');
    mkdirSync(join(ws.agentDir, 'foo'));
    writeFileSync(join(ws.agentDir, 'foo', 'SKILL.md'), 'user customized');
    writeFileSync(join(ws.agentDir, 'foo', 'SKILL.legacy.md'), 'old legacy prose');

    const result = await migratePreSplitAgentSkills(
      ws.storage,
      ws.agentDir,
      ws.managedDir,
      { sourceSkillsDir: sourceDir },
    );
    assert(existsSync(join(ws.agentDir, 'foo', 'SKILL.legacy.md')));
    assert.equal(
      result.cleaned.filter((c) => c.kind === 'legacy_skill').length,
      0,
    );
  });

  it('is a no-op without sourceSkillsDir option', async () => {
    mkdirSync(join(ws.managedDir, 'foo'));
    writeFileSync(join(ws.managedDir, 'foo', 'SKILL.md'), 'managed');
    mkdirSync(join(ws.agentDir, 'foo'));
    writeFileSync(join(ws.agentDir, 'foo', 'SKILL.md'), 'user');
    writeFileSync(join(ws.agentDir, 'foo', 'SKILL.legacy.md'), 'legacy');

    const result = await migratePreSplitAgentSkills(
      ws.storage,
      ws.agentDir,
      ws.managedDir,
      // No sourceSkillsDir → A2 cleanup off
    );
    // legacy file still there
    assert(existsSync(join(ws.agentDir, 'foo', 'SKILL.legacy.md')));
    assert.equal(
      result.cleaned.filter((c) => c.kind === 'legacy_skill').length,
      0,
    );
  });
});

describe('migratePreSplitAgentSkills — A3 (byte-equal aux dedup)', () => {
  let ws: ReturnType<typeof makeWorkspace>;
  beforeEach(() => {
    ws = makeWorkspace();
  });
  afterEach(() => cleanup(ws.root));

  it('removes byte-equal aux files from user dir', async () => {
    // Managed has SKILL.md + templates/ + LEARNINGS.md.
    mkdirSync(join(ws.managedDir, 'foo'));
    writeFileSync(join(ws.managedDir, 'foo', 'SKILL.md'), 'managed body');
    writeFileSync(join(ws.managedDir, 'foo', 'LEARNINGS.md'), 'shared learnings');
    mkdirSync(join(ws.managedDir, 'foo', 'templates'));
    writeFileSync(
      join(ws.managedDir, 'foo', 'templates', 'plan.md'),
      'shared template',
    );
    // User has byte-equal copies AND an edited SKILL.md.
    mkdirSync(join(ws.agentDir, 'foo'));
    writeFileSync(join(ws.agentDir, 'foo', 'SKILL.md'), 'user customized');
    writeFileSync(join(ws.agentDir, 'foo', 'LEARNINGS.md'), 'shared learnings');
    mkdirSync(join(ws.agentDir, 'foo', 'templates'));
    writeFileSync(
      join(ws.agentDir, 'foo', 'templates', 'plan.md'),
      'shared template',
    );

    const result = await migratePreSplitAgentSkills(
      ws.storage,
      ws.agentDir,
      ws.managedDir,
    );
    // SKILL.md preserved (case 2: edited).
    assert(existsSync(join(ws.agentDir, 'foo', 'SKILL.md')));
    // Aux files removed.
    assert(!existsSync(join(ws.agentDir, 'foo', 'LEARNINGS.md')));
    assert(!existsSync(join(ws.agentDir, 'foo', 'templates', 'plan.md')));
    const dedupCleaned = result.cleaned.filter((c) => c.kind === 'aux_dedup');
    assert.equal(dedupCleaned.length, 2);
  });

  it('preserves user-edited aux files', async () => {
    mkdirSync(join(ws.managedDir, 'foo'));
    writeFileSync(join(ws.managedDir, 'foo', 'SKILL.md'), 'managed body');
    writeFileSync(join(ws.managedDir, 'foo', 'LEARNINGS.md'), 'shared learnings');
    mkdirSync(join(ws.agentDir, 'foo'));
    writeFileSync(join(ws.agentDir, 'foo', 'SKILL.md'), 'user customized');
    writeFileSync(
      join(ws.agentDir, 'foo', 'LEARNINGS.md'),
      'user-edited learnings',
    );

    const result = await migratePreSplitAgentSkills(
      ws.storage,
      ws.agentDir,
      ws.managedDir,
    );
    assert(existsSync(join(ws.agentDir, 'foo', 'LEARNINGS.md')));
    assert.equal(
      readFileSync(join(ws.agentDir, 'foo', 'LEARNINGS.md'), 'utf8'),
      'user-edited learnings',
    );
    assert.equal(
      result.cleaned.filter((c) => c.kind === 'aux_dedup').length,
      0,
    );
  });

  it('does not dedup .fork-base or dotfiles', async () => {
    mkdirSync(join(ws.managedDir, 'foo'));
    writeFileSync(join(ws.managedDir, 'foo', 'SKILL.md'), 'managed body');
    mkdirSync(join(ws.agentDir, 'foo'));
    writeFileSync(join(ws.agentDir, 'foo', 'SKILL.md'), 'user customized');
    // .fork-base/SKILL.md byte-equal to managed: should be preserved.
    mkdirSync(join(ws.agentDir, 'foo', '.fork-base'));
    writeFileSync(join(ws.agentDir, 'foo', '.fork-base', 'SKILL.md'), 'managed body');
    // .arete-meta.yaml dotfile: should be preserved.
    writeFileSync(join(ws.agentDir, 'foo', '.arete-meta.yaml'), 'category: user');

    await migratePreSplitAgentSkills(ws.storage, ws.agentDir, ws.managedDir);
    assert(existsSync(join(ws.agentDir, 'foo', '.fork-base', 'SKILL.md')));
    assert(existsSync(join(ws.agentDir, 'foo', '.arete-meta.yaml')));
  });

  it('is idempotent — second run does nothing', async () => {
    mkdirSync(join(ws.managedDir, 'foo'));
    writeFileSync(join(ws.managedDir, 'foo', 'SKILL.md'), 'managed body');
    writeFileSync(join(ws.managedDir, 'foo', 'LEARNINGS.md'), 'shared');
    mkdirSync(join(ws.agentDir, 'foo'));
    writeFileSync(join(ws.agentDir, 'foo', 'SKILL.md'), 'user');
    writeFileSync(join(ws.agentDir, 'foo', 'LEARNINGS.md'), 'shared');

    await migratePreSplitAgentSkills(ws.storage, ws.agentDir, ws.managedDir);
    const result2 = await migratePreSplitAgentSkills(
      ws.storage,
      ws.agentDir,
      ws.managedDir,
    );
    assert.equal(
      result2.cleaned.filter((c) => c.kind === 'aux_dedup').length,
      0,
    );
  });
});

describe('migratePreSplitAgentSkills — A4 (empty user-dir prune)', () => {
  let ws: ReturnType<typeof makeWorkspace>;
  beforeEach(() => {
    ws = makeWorkspace();
  });
  afterEach(() => cleanup(ws.root));

  it('prunes user dir when aux dedup leaves nothing behind', async () => {
    // Source: managed has SKILL.md + LEARNINGS.md.
    mkdirSync(join(ws.managedDir, 'foo'));
    writeFileSync(join(ws.managedDir, 'foo', 'SKILL.md'), 'managed body');
    writeFileSync(join(ws.managedDir, 'foo', 'LEARNINGS.md'), 'shared');
    // User: only LEARNINGS.md (byte-equal) — no SKILL.md.
    mkdirSync(join(ws.agentDir, 'foo'));
    writeFileSync(join(ws.agentDir, 'foo', 'LEARNINGS.md'), 'shared');

    const result = await migratePreSplitAgentSkills(
      ws.storage,
      ws.agentDir,
      ws.managedDir,
    );
    // After A3 dedup empties the dir, A4 prunes it.
    assert(!existsSync(join(ws.agentDir, 'foo')));
    assert.equal(
      result.cleaned.filter((c) => c.kind === 'empty_dir').length,
      1,
    );
  });
});

describe('forkSkill — B2 (aux backfill on pre-existing user dir)', () => {
  let root: string;
  let storage: FileStorageAdapter;
  let managedDir: string;
  let userDir: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'phase-3-5-fork-aux-'));
    storage = new FileStorageAdapter();
    managedDir = join(root, '.arete', 'skills', 'foo');
    userDir = join(root, '.agents', 'skills', 'foo');
    mkdirSync(managedDir, { recursive: true });
    writeFileSync(join(managedDir, 'SKILL.md'), 'managed body');
    writeFileSync(join(managedDir, 'LEARNINGS.md'), 'managed learnings');
    mkdirSync(join(managedDir, 'templates'));
    writeFileSync(join(managedDir, 'templates', 'plan.md'), 'managed template');
  });
  afterEach(() => cleanup(root));

  it('backfills missing aux files when fork already exists', async () => {
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, 'SKILL.md'), 'user-edited body');

    const result = await forkSkill(storage, {
      workspaceRoot: root,
      name: 'foo',
    });
    assert.equal(result.ok, true);
    assert.equal(result.alreadyExisted, true);
    assert(result.auxFilesCopied!.includes('LEARNINGS.md'));
    assert(
      result.auxFilesCopied!.some(
        (p) => p === 'templates/plan.md' || p === 'templates\\plan.md',
      ),
    );
    // User SKILL.md not overwritten.
    assert.equal(readFileSync(join(userDir, 'SKILL.md'), 'utf8'), 'user-edited body');
    // Aux files now present.
    assert(existsSync(join(userDir, 'LEARNINGS.md')));
    assert(existsSync(join(userDir, 'templates', 'plan.md')));
  });

  it('never overwrites pre-existing aux files', async () => {
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, 'SKILL.md'), 'user');
    writeFileSync(join(userDir, 'LEARNINGS.md'), 'user-edited learnings');

    const result = await forkSkill(storage, {
      workspaceRoot: root,
      name: 'foo',
    });
    assert.equal(result.ok, true);
    assert.equal(result.alreadyExisted, true);
    // LEARNINGS.md should NOT be in auxFilesCopied (it existed).
    assert(!(result.auxFilesCopied ?? []).includes('LEARNINGS.md'));
    assert.equal(
      readFileSync(join(userDir, 'LEARNINGS.md'), 'utf8'),
      'user-edited learnings',
    );
  });
});

describe('migratePreSplitAgentSkills — B1 (auto-fork-base from git history)', () => {
  let ws: ReturnType<typeof makeWorkspace>;
  let gitDir: string;
  let sourceDir: string;
  beforeEach(() => {
    ws = makeWorkspace();
    gitDir = mkdtempSync(join(tmpdir(), 'phase-3-5-git-'));
    sourceDir = join(gitDir, 'runtime', 'skills');
    mkdirSync(sourceDir, { recursive: true });
    // Init git repo.
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: gitDir });
      execFileSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: gitDir,
      });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: gitDir });
    } catch {
      // Skip these tests if git is missing.
    }
  });
  afterEach(() => {
    cleanup(ws.root);
    cleanup(gitDir);
  });

  it('auto-records .fork-base when user content matches a prior shipped revision', async () => {
    // Skip if git is unavailable.
    try {
      execFileSync('git', ['--version'], { stdio: 'ignore' });
    } catch {
      return;
    }

    // Commit 1: prior shipped version.
    mkdirSync(join(sourceDir, 'foo'));
    const v1 = '# Foo\n\nv1 content\n';
    writeFileSync(join(sourceDir, 'foo', 'SKILL.md'), v1);
    execFileSync('git', ['add', '-A'], { cwd: gitDir });
    execFileSync('git', ['commit', '-q', '-m', 'v1'], { cwd: gitDir });

    // Commit 2: current shipped version (different).
    const v2 = '# Foo\n\nv2 newer content\n';
    writeFileSync(join(sourceDir, 'foo', 'SKILL.md'), v2);
    execFileSync('git', ['add', '-A'], { cwd: gitDir });
    execFileSync('git', ['commit', '-q', '-m', 'v2'], { cwd: gitDir });

    // Managed mirror = current.
    mkdirSync(join(ws.managedDir, 'foo'));
    writeFileSync(join(ws.managedDir, 'foo', 'SKILL.md'), v2);

    // User has v1 content (matches the prior commit).
    mkdirSync(join(ws.agentDir, 'foo'));
    writeFileSync(join(ws.agentDir, 'foo', 'SKILL.md'), v1);

    const result = await migratePreSplitAgentSkills(
      ws.storage,
      ws.agentDir,
      ws.managedDir,
      {
        sourceSkillsDir: sourceDir,
        autoForkBase: true,
        gitWorkingDir: gitDir,
      },
    );

    // Preserved as user fork.
    assert.deepEqual(result.preserved, ['foo']);
    // Fork base auto-recorded.
    const baseSkillMd = join(ws.agentDir, 'foo', '.fork-base', 'SKILL.md');
    assert(existsSync(baseSkillMd), `expected .fork-base/SKILL.md at ${baseSkillMd}`);
    assert.equal(readFileSync(baseSkillMd, 'utf8'), v1);
    // Manifest carries auto_recorded marker.
    const manifestPath = join(ws.agentDir, 'foo', '.fork-base', '.fork-base.yaml');
    assert(existsSync(manifestPath));
    const manifest = readFileSync(manifestPath, 'utf8');
    assert(manifest.includes('auto_recorded: true'), `expected auto_recorded in manifest:\n${manifest}`);
    assert(manifest.includes('matched_commit:'), `expected matched_commit in manifest:\n${manifest}`);
    // Cleaned record present.
    assert.equal(
      result.cleaned.filter((c) => c.kind === 'auto_fork_base').length,
      1,
    );
  });

  it('skips silently when no historical revision matches', async () => {
    try {
      execFileSync('git', ['--version'], { stdio: 'ignore' });
    } catch {
      return;
    }

    mkdirSync(join(sourceDir, 'foo'));
    writeFileSync(join(sourceDir, 'foo', 'SKILL.md'), 'shipped content');
    execFileSync('git', ['add', '-A'], { cwd: gitDir });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: gitDir });

    mkdirSync(join(ws.managedDir, 'foo'));
    writeFileSync(join(ws.managedDir, 'foo', 'SKILL.md'), 'shipped content');

    mkdirSync(join(ws.agentDir, 'foo'));
    writeFileSync(
      join(ws.agentDir, 'foo', 'SKILL.md'),
      'completely novel user content unmatched by history',
    );

    const result = await migratePreSplitAgentSkills(
      ws.storage,
      ws.agentDir,
      ws.managedDir,
      {
        sourceSkillsDir: sourceDir,
        autoForkBase: true,
        gitWorkingDir: gitDir,
      },
    );
    // Preserved but no fork-base recorded.
    assert.deepEqual(result.preserved, ['foo']);
    assert(!existsSync(join(ws.agentDir, 'foo', '.fork-base')));
    assert.equal(
      result.cleaned.filter((c) => c.kind === 'auto_fork_base').length,
      0,
    );
  });
});
