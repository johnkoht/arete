/**
 * Tests for two-tier skill-resolver functions (Phase 3 Step 2).
 *
 * Covers:
 * - resolveSkillDirTwoTier: user wins, managed fallback, missing
 * - resolveSkillFileTwoTier: combines tier resolution + legacy routing
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveSkillDirTwoTier,
  resolveSkillFileTwoTier,
} from '../../src/services/skill-resolver.js';

describe('resolveSkillDirTwoTier', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'two-tier-'));
  });
  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('returns user tier when .agents/skills/<name>/ exists', async () => {
    mkdirSync(join(root, '.agents', 'skills', 'foo'), { recursive: true });
    mkdirSync(join(root, '.arete', 'skills', 'foo'), { recursive: true });
    const result = await resolveSkillDirTwoTier(root, 'foo', (p) => existsSync(p));
    assert.equal(result.tier, 'user');
    assert.equal(result.dir, join(root, '.agents', 'skills', 'foo'));
  });

  it('falls back to managed when user dir missing', async () => {
    mkdirSync(join(root, '.arete', 'skills', 'foo'), { recursive: true });
    const result = await resolveSkillDirTwoTier(root, 'foo', (p) => existsSync(p));
    assert.equal(result.tier, 'managed');
    assert.equal(result.dir, join(root, '.arete', 'skills', 'foo'));
  });

  it('returns missing when neither tier has the skill', async () => {
    const result = await resolveSkillDirTwoTier(root, 'foo', (p) => existsSync(p));
    assert.equal(result.tier, 'missing');
    assert.equal(result.userDir, join(root, '.agents', 'skills', 'foo'));
    assert.equal(result.managedDir, join(root, '.arete', 'skills', 'foo'));
  });

  it('user tier still wins when only managed-side SKILL.md present', async () => {
    // User dir exists but is empty (e.g. user manually mkdir'd then
    // never populated). The dir-level resolver returns the user dir;
    // the file-level resolver below confirms behavior at the SKILL.md
    // level.
    mkdirSync(join(root, '.agents', 'skills', 'foo'), { recursive: true });
    const result = await resolveSkillDirTwoTier(root, 'foo', (p) => existsSync(p));
    assert.equal(result.tier, 'user');
  });

  it('handles async existsFn', async () => {
    mkdirSync(join(root, '.arete', 'skills', 'foo'), { recursive: true });
    const result = await resolveSkillDirTwoTier(root, 'foo', async (p) => existsSync(p));
    assert.equal(result.tier, 'managed');
  });
});

describe('resolveSkillFileTwoTier', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'two-tier-file-'));
  });
  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('returns user-tier SKILL.md when fork present', async () => {
    const userDir = join(root, '.agents', 'skills', 'foo');
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, 'SKILL.md'), '# user');
    mkdirSync(join(root, '.arete', 'skills', 'foo'), { recursive: true });
    const result = await resolveSkillFileTwoTier(
      root,
      'foo',
      (p) => existsSync(p),
      {},
    );
    assert.equal(result.tier, 'user');
    assert.equal(result.path, join(userDir, 'SKILL.md'));
    assert.equal(result.legacyRequested, false);
    assert.equal(result.legacyUsed, false);
  });

  it('returns managed SKILL.md when no user fork', async () => {
    const managedDir = join(root, '.arete', 'skills', 'foo');
    mkdirSync(managedDir, { recursive: true });
    writeFileSync(join(managedDir, 'SKILL.md'), '# managed');
    const result = await resolveSkillFileTwoTier(
      root,
      'foo',
      (p) => existsSync(p),
      {},
    );
    assert.equal(result.tier, 'managed');
    assert.equal(result.path, join(managedDir, 'SKILL.md'));
  });

  it('returns missing tier with userDir path when neither exists', async () => {
    const result = await resolveSkillFileTwoTier(
      root,
      'foo',
      (p) => existsSync(p),
      {},
    );
    assert.equal(result.tier, 'missing');
    assert.equal(result.path, join(root, '.agents', 'skills', 'foo', 'SKILL.md'));
  });

  it('routes to legacy SKILL.md when env var lists slug AND legacy file exists in user tier', async () => {
    const userDir = join(root, '.agents', 'skills', 'foo');
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, 'SKILL.md'), '# user');
    writeFileSync(join(userDir, 'SKILL.legacy.md'), '# user-legacy');
    const result = await resolveSkillFileTwoTier(
      root,
      'foo',
      (p) => existsSync(p),
      { ARETE_LEGACY_SKILL_PROSE: 'foo' },
    );
    assert.equal(result.legacyRequested, true);
    assert.equal(result.legacyUsed, true);
    assert.equal(result.path, join(userDir, 'SKILL.legacy.md'));
    assert.equal(result.tier, 'user');
  });

  it('routes to legacy SKILL.md in managed tier when no user fork', async () => {
    const managedDir = join(root, '.arete', 'skills', 'foo');
    mkdirSync(managedDir, { recursive: true });
    writeFileSync(join(managedDir, 'SKILL.md'), '# managed');
    writeFileSync(join(managedDir, 'SKILL.legacy.md'), '# managed-legacy');
    const result = await resolveSkillFileTwoTier(
      root,
      'foo',
      (p) => existsSync(p),
      { ARETE_LEGACY_SKILL_PROSE: 'foo' },
    );
    assert.equal(result.legacyUsed, true);
    assert.equal(result.path, join(managedDir, 'SKILL.legacy.md'));
    assert.equal(result.tier, 'managed');
  });

  it('falls back to live SKILL.md when legacy requested but missing', async () => {
    const userDir = join(root, '.agents', 'skills', 'foo');
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, 'SKILL.md'), '# user');
    const result = await resolveSkillFileTwoTier(
      root,
      'foo',
      (p) => existsSync(p),
      { ARETE_LEGACY_SKILL_PROSE: 'foo' },
    );
    assert.equal(result.legacyRequested, true);
    assert.equal(result.legacyUsed, false);
    assert.ok(result.warning);
    assert.equal(result.path, join(userDir, 'SKILL.md'));
  });

  it('user tier wins for the legacy lookup too (user can override managed legacy)', async () => {
    const userDir = join(root, '.agents', 'skills', 'foo');
    const managedDir = join(root, '.arete', 'skills', 'foo');
    mkdirSync(userDir, { recursive: true });
    mkdirSync(managedDir, { recursive: true });
    writeFileSync(join(userDir, 'SKILL.md'), '# user');
    writeFileSync(join(managedDir, 'SKILL.md'), '# managed');
    writeFileSync(join(managedDir, 'SKILL.legacy.md'), '# managed-legacy');
    // Legacy requested but only managed has the legacy file. User
    // dir is what we're resolving against → fallback warning.
    const result = await resolveSkillFileTwoTier(
      root,
      'foo',
      (p) => existsSync(p),
      { ARETE_LEGACY_SKILL_PROSE: 'foo' },
    );
    assert.equal(result.tier, 'user');
    assert.equal(result.legacyUsed, false);
    assert.ok(result.warning);
  });
});
