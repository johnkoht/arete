/**
 * Tests for two-tier skill-resolver functions (Phase 3 Step 2 + Step 9).
 *
 * Covers:
 * - resolveSkillDirTwoTier: user wins, managed fallback, missing
 * - resolveSkillFileTwoTier: returns SKILL.md path in the resolved tier
 *
 * Note: post Phase 3 Step 9 / MC5 sunset, the legacy
 * `ARETE_LEGACY_SKILL_PROSE` routing has been removed. This test file
 * previously asserted that path; those cases are gone.
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
    );
    assert.equal(result.tier, 'user');
    assert.equal(result.path, join(userDir, 'SKILL.md'));
  });

  it('returns managed SKILL.md when no user fork', async () => {
    const managedDir = join(root, '.arete', 'skills', 'foo');
    mkdirSync(managedDir, { recursive: true });
    writeFileSync(join(managedDir, 'SKILL.md'), '# managed');
    const result = await resolveSkillFileTwoTier(
      root,
      'foo',
      (p) => existsSync(p),
    );
    assert.equal(result.tier, 'managed');
    assert.equal(result.path, join(managedDir, 'SKILL.md'));
  });

  it('returns missing tier with userDir path when neither exists', async () => {
    const result = await resolveSkillFileTwoTier(
      root,
      'foo',
      (p) => existsSync(p),
    );
    assert.equal(result.tier, 'missing');
    assert.equal(result.path, join(root, '.agents', 'skills', 'foo', 'SKILL.md'));
  });

  it('user tier still wins when both tiers have a SKILL.md (was: legacy override scenario)', async () => {
    // Pre-MC5 sunset, this test exercised SKILL.legacy.md routing.
    // Post-sunset: just confirm two-tier precedence under the simpler
    // resolver.
    const userDir = join(root, '.agents', 'skills', 'foo');
    const managedDir = join(root, '.arete', 'skills', 'foo');
    mkdirSync(userDir, { recursive: true });
    mkdirSync(managedDir, { recursive: true });
    writeFileSync(join(userDir, 'SKILL.md'), '# user');
    writeFileSync(join(managedDir, 'SKILL.md'), '# managed');
    const result = await resolveSkillFileTwoTier(
      root,
      'foo',
      (p) => existsSync(p),
    );
    assert.equal(result.tier, 'user');
    assert.equal(result.path, join(userDir, 'SKILL.md'));
  });
});
