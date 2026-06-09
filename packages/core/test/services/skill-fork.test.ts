/**
 * Tests for skill-fork service (Phase 3 Steps 3, 5, 6, 7).
 *
 * Covers:
 * - forkSkill: managed → user copy + .fork-base snapshot
 * - forkSkill: idempotent on existing fork (warn, don't overwrite)
 * - forkSkill: --force re-records base hash
 * - diffSkill: upToDate / changes / baseMissing
 * - mergeSkill: clean merge + conflict + interactive callback
 * - migratePreSplitAgentSkills: removes byte-equal copies, preserves edits
 * - summarizeUpstreamChanges: reports forks with upstream diff
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import {
  forkSkill,
  diffSkill,
  mergeSkill,
  migratePreSplitAgentSkills,
  summarizeUpstreamChanges,
} from '../../src/services/skill-fork.js';

const SKILL_NAME = 'daily-winddown';
const MANAGED_SKILL_BODY = '---\nname: daily-winddown\n---\n\n# Read first\n\nstanza\n\n## Steps\n\nSteps body\n';

function setupWorkspace(): { root: string; storage: FileStorageAdapter; managedDir: string; userDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'skill-fork-'));
  const storage = new FileStorageAdapter();
  const managedDir = join(root, '.arete', 'skills', SKILL_NAME);
  const userDir = join(root, '.agents', 'skills', SKILL_NAME);
  mkdirSync(managedDir, { recursive: true });
  writeFileSync(join(managedDir, 'SKILL.md'), MANAGED_SKILL_BODY);
  return { root, storage, managedDir, userDir };
}

function cleanupWorkspace(root: string): void {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

describe('forkSkill', () => {
  let ws: ReturnType<typeof setupWorkspace>;
  beforeEach(() => {
    ws = setupWorkspace();
  });
  afterEach(() => {
    cleanupWorkspace(ws.root);
  });

  it('copies managed skill into .agents/skills and records .fork-base', async () => {
    const result = await forkSkill(ws.storage, {
      workspaceRoot: ws.root,
      name: SKILL_NAME,
    });
    assert.equal(result.ok, true);
    assert.equal(result.alreadyExisted, false);
    assert.ok(result.baseHash);
    assert(existsSync(join(ws.userDir, 'SKILL.md')));
    assert(existsSync(join(ws.userDir, '.fork-base', 'SKILL.md')));
    assert(existsSync(join(ws.userDir, '.fork-base', '.fork-base.yaml')));

    const forkContent = readFileSync(join(ws.userDir, 'SKILL.md'), 'utf8');
    assert.equal(forkContent, MANAGED_SKILL_BODY);
  });

  it('returns ok=true with alreadyExisted=true when fork exists (idempotent)', async () => {
    await forkSkill(ws.storage, { workspaceRoot: ws.root, name: SKILL_NAME });
    // Edit the user fork.
    writeFileSync(join(ws.userDir, 'SKILL.md'), MANAGED_SKILL_BODY + '\n## User addition\nuser body\n');
    // Run again without --force.
    const result = await forkSkill(ws.storage, { workspaceRoot: ws.root, name: SKILL_NAME });
    assert.equal(result.ok, true);
    assert.equal(result.alreadyExisted, true);
    // Edit preserved.
    const after = readFileSync(join(ws.userDir, 'SKILL.md'), 'utf8');
    assert.match(after, /User addition/);
  });

  it('returns ok=false when managed skill missing', async () => {
    const result = await forkSkill(ws.storage, {
      workspaceRoot: ws.root,
      name: 'never-existed',
    });
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /Managed skill not found/);
  });

  it('records .fork-base for a fork that has none (legacy recovery)', async () => {
    // Simulate a fork without .fork-base (e.g., pre-Phase-3 user-edited state).
    mkdirSync(ws.userDir, { recursive: true });
    writeFileSync(join(ws.userDir, 'SKILL.md'), MANAGED_SKILL_BODY + '\n## My add\n');
    assert(!existsSync(join(ws.userDir, '.fork-base')));
    const result = await forkSkill(ws.storage, { workspaceRoot: ws.root, name: SKILL_NAME });
    assert.equal(result.ok, true);
    assert.equal(result.alreadyExisted, true);
    assert.ok(result.baseHash);
    assert(existsSync(join(ws.userDir, '.fork-base', 'SKILL.md')));
    // User's SKILL.md still present and unchanged.
    const userContent = readFileSync(join(ws.userDir, 'SKILL.md'), 'utf8');
    assert.match(userContent, /My add/);
  });

  it('--force refreshes the recorded base hash without overwriting fork SKILL.md', async () => {
    const r1 = await forkSkill(ws.storage, { workspaceRoot: ws.root, name: SKILL_NAME });
    const firstHash = r1.baseHash!;
    // Change managed content.
    writeFileSync(join(ws.managedDir, 'SKILL.md'), MANAGED_SKILL_BODY + '\n## Newly shipped\n');
    // User edits their fork.
    writeFileSync(join(ws.userDir, 'SKILL.md'), MANAGED_SKILL_BODY + '\n## User edit\n');
    const r2 = await forkSkill(ws.storage, {
      workspaceRoot: ws.root,
      name: SKILL_NAME,
      force: true,
    });
    assert.equal(r2.ok, true);
    assert.notEqual(r2.baseHash, firstHash);
    // User edit preserved.
    const userContent = readFileSync(join(ws.userDir, 'SKILL.md'), 'utf8');
    assert.match(userContent, /User edit/);
    // New base reflects new managed content.
    const baseContent = readFileSync(join(ws.userDir, '.fork-base', 'SKILL.md'), 'utf8');
    assert.match(baseContent, /Newly shipped/);
  });
});

describe('diffSkill', () => {
  let ws: ReturnType<typeof setupWorkspace>;
  beforeEach(() => {
    ws = setupWorkspace();
  });
  afterEach(() => {
    cleanupWorkspace(ws.root);
  });

  it('reports upToDate=true when fork base matches current managed', async () => {
    await forkSkill(ws.storage, { workspaceRoot: ws.root, name: SKILL_NAME });
    const diff = await diffSkill(ws.storage, ws.root, SKILL_NAME);
    assert.equal(diff.upToDate, true);
    assert.equal(diff.baseMissing, false);
    assert.equal(diff.diff.changes.length, 0);
  });

  it('reports changes when managed has been updated since fork', async () => {
    await forkSkill(ws.storage, { workspaceRoot: ws.root, name: SKILL_NAME });
    writeFileSync(
      join(ws.managedDir, 'SKILL.md'),
      MANAGED_SKILL_BODY.replace('Steps body', 'Reworded steps body'),
    );
    const diff = await diffSkill(ws.storage, ws.root, SKILL_NAME);
    assert.equal(diff.upToDate, false);
    assert.ok(diff.diff.changes.length > 0);
    assert(diff.diff.changes.some((c) => c.kind === 'modified' && c.heading === '## Steps'));
  });

  it('reports baseMissing when fork has no .fork-base', async () => {
    mkdirSync(ws.userDir, { recursive: true });
    writeFileSync(join(ws.userDir, 'SKILL.md'), MANAGED_SKILL_BODY + '\n## Mine\n');
    const diff = await diffSkill(ws.storage, ws.root, SKILL_NAME);
    assert.equal(diff.baseMissing, true);
  });
});

describe('mergeSkill', () => {
  let ws: ReturnType<typeof setupWorkspace>;
  beforeEach(() => {
    ws = setupWorkspace();
  });
  afterEach(() => {
    cleanupWorkspace(ws.root);
  });

  it('clean merge applies upstream changes and advances .fork-base', async () => {
    await forkSkill(ws.storage, { workspaceRoot: ws.root, name: SKILL_NAME });
    // Upstream rewords Steps; user has not touched it.
    const newManaged = MANAGED_SKILL_BODY.replace('Steps body', 'Reworded steps body');
    writeFileSync(join(ws.managedDir, 'SKILL.md'), newManaged);

    const result = await mergeSkill(ws.storage, {
      workspaceRoot: ws.root,
      name: SKILL_NAME,
    });
    assert.equal(result.ran, true);
    assert.equal(result.clean, true);
    assert.equal(result.conflicts.length, 0);
    const merged = readFileSync(join(ws.userDir, 'SKILL.md'), 'utf8');
    assert.match(merged, /Reworded steps body/);
    assert.equal(result.baseUpdated, true);
  });

  it('conflict emits git-style markers and does NOT advance base', async () => {
    await forkSkill(ws.storage, { workspaceRoot: ws.root, name: SKILL_NAME });
    // Both sides edit ## Steps.
    writeFileSync(
      join(ws.userDir, 'SKILL.md'),
      MANAGED_SKILL_BODY.replace('Steps body', 'My fork steps'),
    );
    writeFileSync(
      join(ws.managedDir, 'SKILL.md'),
      MANAGED_SKILL_BODY.replace('Steps body', 'Upstream rewrite'),
    );
    const result = await mergeSkill(ws.storage, {
      workspaceRoot: ws.root,
      name: SKILL_NAME,
    });
    assert.equal(result.ran, true);
    assert.equal(result.clean, false);
    assert.equal(result.conflicts.length, 1);
    const merged = readFileSync(join(ws.userDir, 'SKILL.md'), 'utf8');
    assert.match(merged, /<<<<<<< local/);
    assert.match(merged, /My fork steps/);
    assert.match(merged, /Upstream rewrite/);
    assert.match(merged, />>>>>>> incoming/);
    assert.equal(result.baseUpdated, false);
  });

  it('returns error when fork is missing', async () => {
    const result = await mergeSkill(ws.storage, {
      workspaceRoot: ws.root,
      name: SKILL_NAME,
    });
    assert.equal(result.ran, false);
    assert.match(result.error ?? '', /User fork not found/);
  });

  it('interactive callback is invoked for non-trivial hunks', async () => {
    await forkSkill(ws.storage, { workspaceRoot: ws.root, name: SKILL_NAME });
    writeFileSync(
      join(ws.managedDir, 'SKILL.md'),
      MANAGED_SKILL_BODY.replace('Steps body', 'Reworded steps body'),
    );
    const seenKinds: string[] = [];
    const result = await mergeSkill(ws.storage, {
      workspaceRoot: ws.root,
      name: SKILL_NAME,
      onHunk: async (hunk) => {
        seenKinds.push(hunk.kind);
        if (hunk.heading === '## Steps') return 'keep-local';
        return 'accept';
      },
    });
    assert.equal(result.ran, true);
    assert(seenKinds.includes('incoming-only'));
    // Because we kept-local on the only incoming-changed section,
    // upstream change should NOT be in the merged output.
    const merged = readFileSync(join(ws.userDir, 'SKILL.md'), 'utf8');
    assert.doesNotMatch(merged, /Reworded steps body/);
    // Base advances on clean merge — the user explicitly chose
    // keep-local on a non-conflicting hunk; no conflicts so base updates.
    assert.equal(result.clean, true);
  });
});

describe('migratePreSplitAgentSkills', () => {
  let root: string;
  let storage: FileStorageAdapter;
  let managedDir: string;
  let agentDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pre-split-'));
    storage = new FileStorageAdapter();
    managedDir = join(root, '.arete', 'skills');
    agentDir = join(root, '.agents', 'skills');
    mkdirSync(managedDir, { recursive: true });
    mkdirSync(agentDir, { recursive: true });
  });
  afterEach(() => {
    cleanupWorkspace(root);
  });

  it('removes .agents/skills/<name>/ when its SKILL.md byte-equals managed', async () => {
    mkdirSync(join(managedDir, 'foo'));
    mkdirSync(join(agentDir, 'foo'));
    writeFileSync(join(managedDir, 'foo', 'SKILL.md'), 'shared content');
    writeFileSync(join(agentDir, 'foo', 'SKILL.md'), 'shared content');

    const result = await migratePreSplitAgentSkills(storage, agentDir, managedDir);
    assert.deepEqual(result.removed, ['foo']);
    assert.deepEqual(result.preserved, []);
    assert(!existsSync(join(agentDir, 'foo')));
  });

  it('preserves .agents/skills/<name>/ when content differs (user fork)', async () => {
    mkdirSync(join(managedDir, 'foo'));
    mkdirSync(join(agentDir, 'foo'));
    writeFileSync(join(managedDir, 'foo', 'SKILL.md'), 'managed content');
    writeFileSync(join(agentDir, 'foo', 'SKILL.md'), 'user-edited content');

    const result = await migratePreSplitAgentSkills(storage, agentDir, managedDir);
    assert.deepEqual(result.removed, []);
    assert.deepEqual(result.preserved, ['foo']);
    assert(existsSync(join(agentDir, 'foo', 'SKILL.md')));
  });

  it('preserves .agents/skills/<name>/ when no matching managed entry (community)', async () => {
    mkdirSync(join(agentDir, 'community-skill'));
    writeFileSync(join(agentDir, 'community-skill', 'SKILL.md'), 'community content');

    const result = await migratePreSplitAgentSkills(storage, agentDir, managedDir);
    assert.deepEqual(result.removed, []);
    assert.deepEqual(result.preserved, ['community-skill']);
    assert(existsSync(join(agentDir, 'community-skill', 'SKILL.md')));
  });

  it('handles mixed scenario across multiple skills', async () => {
    // a: byte-equal → remove
    // b: edited → preserve
    // c: community (no managed) → preserve
    mkdirSync(join(managedDir, 'a'));
    mkdirSync(join(managedDir, 'b'));
    mkdirSync(join(agentDir, 'a'));
    mkdirSync(join(agentDir, 'b'));
    mkdirSync(join(agentDir, 'c'));
    writeFileSync(join(managedDir, 'a', 'SKILL.md'), 'A');
    writeFileSync(join(managedDir, 'b', 'SKILL.md'), 'B managed');
    writeFileSync(join(agentDir, 'a', 'SKILL.md'), 'A');
    writeFileSync(join(agentDir, 'b', 'SKILL.md'), 'B user');
    writeFileSync(join(agentDir, 'c', 'SKILL.md'), 'C community');

    const result = await migratePreSplitAgentSkills(storage, agentDir, managedDir);
    assert.deepEqual(result.removed.sort(), ['a']);
    assert.deepEqual(result.preserved.sort(), ['b', 'c']);
  });

  it('is a no-op when .agents/skills/ does not exist', async () => {
    rmSync(agentDir, { recursive: true });
    const result = await migratePreSplitAgentSkills(storage, agentDir, managedDir);
    assert.deepEqual(result.removed, []);
    assert.deepEqual(result.preserved, []);
  });

  it('preserves a byte-equal fork that has an explicit .fork-base (user ran `arete skill fork`)', async () => {
    mkdirSync(join(managedDir, 'foo'));
    mkdirSync(join(agentDir, 'foo'));
    writeFileSync(join(managedDir, 'foo', 'SKILL.md'), 'shared');
    writeFileSync(join(agentDir, 'foo', 'SKILL.md'), 'shared');
    // Add a .fork-base/ marker — this signals the user has explicitly
    // forked, and the byte-equality is incidental (they may edit later).
    mkdirSync(join(agentDir, 'foo', '.fork-base'));
    writeFileSync(join(agentDir, 'foo', '.fork-base', 'SKILL.md'), 'shared');

    const result = await migratePreSplitAgentSkills(storage, agentDir, managedDir);
    assert.deepEqual(result.removed, []);
    assert.deepEqual(result.preserved, ['foo']);
    assert(existsSync(join(agentDir, 'foo', 'SKILL.md')));
  });

  it('is idempotent — second run returns empty lists', async () => {
    mkdirSync(join(managedDir, 'foo'));
    mkdirSync(join(agentDir, 'foo'));
    writeFileSync(join(managedDir, 'foo', 'SKILL.md'), 'x');
    writeFileSync(join(agentDir, 'foo', 'SKILL.md'), 'x');
    await migratePreSplitAgentSkills(storage, agentDir, managedDir);
    const result2 = await migratePreSplitAgentSkills(storage, agentDir, managedDir);
    assert.deepEqual(result2.removed, []);
    assert.deepEqual(result2.preserved, []);
  });
});

describe('summarizeUpstreamChanges', () => {
  let ws: ReturnType<typeof setupWorkspace>;
  beforeEach(() => {
    ws = setupWorkspace();
  });
  afterEach(() => {
    cleanupWorkspace(ws.root);
  });

  it('returns [] when no forks present', async () => {
    const result = await summarizeUpstreamChanges(ws.storage, ws.root);
    assert.deepEqual(result, []);
  });

  it('returns [] when fork is up-to-date with managed', async () => {
    await forkSkill(ws.storage, { workspaceRoot: ws.root, name: SKILL_NAME });
    const result = await summarizeUpstreamChanges(ws.storage, ws.root);
    assert.deepEqual(result, []);
  });

  it('reports forks where managed has changed since fork base', async () => {
    await forkSkill(ws.storage, { workspaceRoot: ws.root, name: SKILL_NAME });
    writeFileSync(
      join(ws.managedDir, 'SKILL.md'),
      MANAGED_SKILL_BODY + '\n## New shipped\n',
    );
    const result = await summarizeUpstreamChanges(ws.storage, ws.root);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, SKILL_NAME);
    assert.equal(result[0].hasFork, true);
    assert.equal(result[0].baseMissing, false);
    assert(result[0].changeCount >= 1);
  });

  it('reports forks with missing fork-base when content differs from managed', async () => {
    // Simulate pre-Phase-3 fork without a fork-base.
    mkdirSync(ws.userDir, { recursive: true });
    writeFileSync(join(ws.userDir, 'SKILL.md'), MANAGED_SKILL_BODY + '\n## User add\n');
    const result = await summarizeUpstreamChanges(ws.storage, ws.root);
    assert.equal(result.length, 1);
    assert.equal(result[0].baseMissing, true);
  });
});

describe('integration: full fork → edit → upstream-update → diff → merge', () => {
  let ws: ReturnType<typeof setupWorkspace>;
  beforeEach(() => {
    ws = setupWorkspace();
  });
  afterEach(() => {
    cleanupWorkspace(ws.root);
  });

  it('round-trips: fork, edit, upstream change in different section, merge clean', async () => {
    // Step 1: fork.
    const forkResult = await forkSkill(ws.storage, {
      workspaceRoot: ws.root,
      name: SKILL_NAME,
    });
    assert.equal(forkResult.ok, true);

    // Step 2: user edits the "Read first" section.
    const userEdited = MANAGED_SKILL_BODY.replace('stanza', 'my custom stanza');
    writeFileSync(join(ws.userDir, 'SKILL.md'), userEdited);

    // Step 3: upstream ships an update to "Steps".
    const newManaged = MANAGED_SKILL_BODY.replace('Steps body', 'Upstream-improved steps');
    writeFileSync(join(ws.managedDir, 'SKILL.md'), newManaged);

    // Step 4: diff shows the upstream change.
    const diff = await diffSkill(ws.storage, ws.root, SKILL_NAME);
    assert.equal(diff.upToDate, false);
    assert(diff.diff.changes.some((c) => c.heading === '## Steps' && c.kind === 'modified'));

    // Step 5: merge. Should be clean (different sections changed).
    const mergeResult = await mergeSkill(ws.storage, {
      workspaceRoot: ws.root,
      name: SKILL_NAME,
    });
    assert.equal(mergeResult.clean, true);
    const merged = readFileSync(join(ws.userDir, 'SKILL.md'), 'utf8');
    assert.match(merged, /my custom stanza/);
    assert.match(merged, /Upstream-improved steps/);

    // Step 6: re-running diff returns upToDate.
    const diff2 = await diffSkill(ws.storage, ws.root, SKILL_NAME);
    assert.equal(diff2.upToDate, true);
  });
});
