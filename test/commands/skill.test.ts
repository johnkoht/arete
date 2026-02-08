/**
 * Tests for skill command helpers: applySkillDefaults, getDefaultRoleNames
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { getWorkspacePaths } from '../../src/core/workspace.js';
import {
  applySkillDefaults,
  getMergedSkillsForRouting,
  getDefaultRoleNames,
} from '../../src/commands/skill.js';
import type { RoutedSkill } from '../../src/core/skill-router.js';

function createTmpWorkspace(): string {
  const dir = join(tmpdir(), `arete-skill-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.cursor', 'skills-core', 'create-prd'), { recursive: true });
  mkdirSync(join(dir, '.cursor', 'skills-core', 'discovery'), { recursive: true });
  mkdirSync(join(dir, '.cursor', 'skills-local'), { recursive: true });
  writeFileSync(join(dir, '.cursor', 'skills-core', 'create-prd', 'SKILL.md'), '---\nname: create-prd\n---');
  writeFileSync(join(dir, '.cursor', 'skills-core', 'discovery', 'SKILL.md'), '---\nname: discovery\n---');
  mkdirSync(join(dir, '.cursor', 'skills-local', 'netflix-prd'), { recursive: true });
  writeFileSync(join(dir, '.cursor', 'skills-local', 'netflix-prd', 'SKILL.md'), '---\nname: netflix-prd\n---');
  writeFileSync(join(dir, 'arete.yaml'), 'schema: 1\n');
  return dir;
}

describe('skill commands', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpWorkspace();
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('applySkillDefaults', () => {
    it('returns same result when no defaults config', () => {
      const paths = getWorkspacePaths(tmpDir);
      const skills = getMergedSkillsForRouting(paths);
      const routed: RoutedSkill = { skill: 'create-prd', path: '/x/create-prd', reason: 'match' };
      const result = applySkillDefaults(routed, skills, undefined);
      assert.equal(result!.skill, 'create-prd');
      assert.equal(result!.path, '/x/create-prd');
      assert.equal(result!.resolvedFrom, undefined);
    });

    it('resolves to preferred skill when defaults mapping exists', () => {
      const paths = getWorkspacePaths(tmpDir);
      const skills = getMergedSkillsForRouting(paths);
      const routed: RoutedSkill = { skill: 'create-prd', path: '/x/create-prd', reason: 'match' };
      const defaults = { 'create-prd': 'netflix-prd' };
      const result = applySkillDefaults(routed, skills, defaults);
      assert.equal(result!.skill, 'netflix-prd');
      assert.ok(result!.path!.includes('netflix-prd'));
      assert.equal(result!.resolvedFrom, 'create-prd');
    });

    it('returns original when preferred skill not installed', () => {
      const paths = getWorkspacePaths(tmpDir);
      const skills = getMergedSkillsForRouting(paths);
      const routed: RoutedSkill = { skill: 'create-prd', path: '/x/create-prd', reason: 'match' };
      const defaults = { 'create-prd': 'nonexistent-skill' };
      const result = applySkillDefaults(routed, skills, defaults);
      assert.equal(result!.skill, 'create-prd');
      assert.equal(result!.resolvedFrom, undefined);
    });

    it('returns original when role has null default', () => {
      const paths = getWorkspacePaths(tmpDir);
      const skills = getMergedSkillsForRouting(paths);
      const routed: RoutedSkill = { skill: 'discovery', path: '/x/discovery', reason: 'match' };
      const defaults = { discovery: null };
      const result = applySkillDefaults(routed, skills, defaults);
      assert.equal(result!.skill, 'discovery');
      assert.equal(result!.resolvedFrom, undefined);
    });

    it('returns null when routed is null', () => {
      const paths = getWorkspacePaths(tmpDir);
      const skills = getMergedSkillsForRouting(paths);
      const result = applySkillDefaults(null, skills, { 'create-prd': 'netflix-prd' });
      assert.equal(result, null);
    });
  });

  describe('getDefaultRoleNames', () => {
    it('returns skill names from skills-core', () => {
      const paths = getWorkspacePaths(tmpDir);
      const roles = getDefaultRoleNames(paths);
      assert.ok(roles.includes('create-prd'));
      assert.ok(roles.includes('discovery'));
      assert.equal(roles.length, 2);
    });
  });
});
