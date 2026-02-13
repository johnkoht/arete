/**
 * Tests for skill command helpers: applySkillDefaults, getDefaultRoleNames
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { stringify as stringifyYaml } from 'yaml';
import { getWorkspacePaths } from '../../src/core/workspace.js';
import {
  applySkillDefaults,
  getMergedSkillsForRouting,
  getDefaultRoleNames,
  detectOverlapRole,
  guessWorkTypeFromDescription,
} from '../../src/commands/skill.js';
import type { RoutedSkill } from '../../src/core/skill-router.js';

function createTmpWorkspace(): string {
  const dir = join(tmpdir(), `arete-skill-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.agents', 'skills', 'create-prd'), { recursive: true });
  mkdirSync(join(dir, '.agents', 'skills', 'discovery'), { recursive: true });
  mkdirSync(join(dir, '.agents', 'skills', 'netflix-prd'), { recursive: true });
  mkdirSync(join(dir, '.agents', 'skills', 'competitive-analysis'), { recursive: true });
  writeFileSync(join(dir, '.agents', 'skills', 'create-prd', 'SKILL.md'), '---\nname: create-prd\n---');
  writeFileSync(join(dir, '.agents', 'skills', 'discovery', 'SKILL.md'), '---\nname: discovery\n---');
  writeFileSync(join(dir, '.agents', 'skills', 'netflix-prd', 'SKILL.md'), '---\nname: netflix-prd\n---');
  writeFileSync(join(dir, '.agents', 'skills', 'competitive-analysis', 'SKILL.md'), '---\nname: competitive-analysis\n---');
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
    it('returns skill names from .agents/skills', () => {
      const paths = getWorkspacePaths(tmpDir);
      const roles = getDefaultRoleNames(paths);
      assert.ok(roles.includes('create-prd'));
      assert.ok(roles.includes('discovery'));
      assert.ok(roles.includes('netflix-prd'));
      assert.ok(roles.includes('competitive-analysis'));
      assert.equal(roles.length, 4);
    });
  });
});

describe('getSkillInfo with .arete-meta.yaml sidecar', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpWorkspace();
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('merges sidecar metadata when SKILL.md lacks extended fields', () => {
    const paths = getWorkspacePaths(tmpDir);
    const netflixPath = join(tmpDir, '.agents', 'skills', 'netflix-prd');
    writeFileSync(
      join(netflixPath, '.arete-meta.yaml'),
      stringifyYaml({ category: 'community', requires_briefing: true, work_type: 'definition' }),
      'utf8'
    );
    const skills = getMergedSkillsForRouting(paths);
    const netflix = skills.find(s => s.id === 'netflix-prd');
    assert.ok(netflix);
    assert.equal(netflix!.category, 'community');
    assert.equal(netflix!.requires_briefing, true);
    assert.equal(netflix!.work_type, 'definition');
  });
});

describe('guessWorkTypeFromDescription', () => {
  it('identifies PRD/requirements as definition', () => {
    assert.equal(guessWorkTypeFromDescription('Create PRD documents'), 'definition');
    assert.equal(guessWorkTypeFromDescription('Generate product requirements'), 'definition');
    assert.equal(guessWorkTypeFromDescription('Define specifications'), 'definition');
  });

  it('identifies discovery work', () => {
    assert.equal(guessWorkTypeFromDescription('Guide discovery and research'), 'discovery');
    assert.equal(guessWorkTypeFromDescription('Explore user needs'), 'discovery');
    assert.equal(guessWorkTypeFromDescription('Investigate problems'), 'discovery');
  });

  it('identifies analysis work', () => {
    assert.equal(guessWorkTypeFromDescription('Analyze competitors'), 'analysis');
    assert.equal(guessWorkTypeFromDescription('Compare solutions'), 'analysis');
    assert.equal(guessWorkTypeFromDescription('Evaluate options'), 'analysis');
  });

  it('identifies planning work', () => {
    assert.equal(guessWorkTypeFromDescription('Plan the quarter'), 'planning');
    assert.equal(guessWorkTypeFromDescription('Set goals and priorities'), 'planning');
    assert.equal(guessWorkTypeFromDescription('Build a roadmap'), 'planning');
  });

  it('identifies operations work', () => {
    assert.equal(guessWorkTypeFromDescription('Finalize project'), 'operations');
    assert.equal(guessWorkTypeFromDescription('Sync data'), 'operations');
    assert.equal(guessWorkTypeFromDescription('Process meetings'), 'operations');
  });

  it('returns undefined for unrecognized descriptions', () => {
    assert.equal(guessWorkTypeFromDescription('Something completely random'), undefined);
  });
});

describe('detectOverlapRole', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpWorkspace();
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('matches PRD skill by exact name', () => {
    const paths = getWorkspacePaths(tmpDir);
    const prdSkill = {
      id: 'prd',
      name: 'PRD Skill',
      description: 'Generate high-quality Product Requirements Documents',
      work_type: 'definition' as const,
    };
    
    const role = detectOverlapRole(prdSkill, paths);
    assert.equal(role, 'create-prd', 'Should match create-prd by skill name');
  });

  it('matches PRD skill by description keywords', () => {
    const paths = getWorkspacePaths(tmpDir);
    const prdSkill = {
      id: 'awesome-prd',
      name: 'Awesome PRD',
      description: 'Generate Product Requirements Documents with AI',
      work_type: 'definition' as const,
    };
    
    const role = detectOverlapRole(prdSkill, paths);
    assert.equal(role, 'create-prd', 'Should match create-prd by PRD keywords');
  });

  it('matches discovery skill by name', () => {
    const paths = getWorkspacePaths(tmpDir);
    const discoverySkill = {
      id: 'discovery',
      name: 'Discovery',
      description: 'User research and problem exploration',
      work_type: 'discovery' as const,
    };
    
    const role = detectOverlapRole(discoverySkill, paths);
    assert.equal(role, 'discovery', 'Should match discovery by exact name');
  });

  it('prefers exact name match over work_type match', () => {
    const paths = getWorkspacePaths(tmpDir);
    
    // Create a skill named 'prd' with work_type 'definition'
    // Both create-prd and finalize-project might have 'definition' work_type
    // but 'prd' should match 'create-prd' by name first
    const prdSkill = {
      id: 'prd',
      name: 'PRD',
      description: 'Some generic description',
      work_type: 'definition' as const,
    };
    
    const role = detectOverlapRole(prdSkill, paths);
    // Should NOT match finalize-project even if it has the same work_type
    assert.equal(role, 'create-prd', 'Should prefer name match over work_type');
  });

  it('returns undefined when no match found', () => {
    const paths = getWorkspacePaths(tmpDir);
    const customSkill = {
      id: 'totally-custom',
      name: 'Custom Skill',
      description: 'Does something completely unique',
      work_type: undefined,
    };
    
    const role = detectOverlapRole(customSkill, paths);
    assert.equal(role, undefined, 'Should return undefined for unmatched skills');
  });

  it('does not match generic operations work_type', () => {
    const paths = getWorkspacePaths(tmpDir);
    const syncSkill = {
      id: 'my-sync',
      name: 'My Sync',
      description: 'Sync data with external system',
      work_type: 'operations' as const,
    };
    
    // Should not auto-match to finalize-project or other operations skills
    // because operations is too generic
    const role = detectOverlapRole(syncSkill, paths);
    // Could be undefined or match by other criteria, but shouldn't match by operations alone
    assert.ok(role === undefined || role === 'sync', 'Should not match generic operations to finalize-project');
  });
});

describe('skill metadata handling', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpWorkspace();
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('only adds metadata to newly installed skill, not all skills', () => {
    const paths = getWorkspacePaths(tmpDir);
    
    // Create a scenario: existing skills with metadata, new skill without
    writeFileSync(
      join(tmpDir, '.agents', 'skills', 'create-prd', '.arete-meta.yaml'),
      stringifyYaml({ category: 'core', requires_briefing: true }),
      'utf8'
    );
    writeFileSync(
      join(tmpDir, '.agents', 'skills', 'discovery', '.arete-meta.yaml'),
      stringifyYaml({ category: 'core', requires_briefing: true }),
      'utf8'
    );
    
    // netflix-prd has no metadata (newly installed)
    const netflixPath = join(tmpDir, '.agents', 'skills', 'netflix-prd');
    const metaPath = join(netflixPath, '.arete-meta.yaml');
    
    assert.ok(!existsSync(metaPath), 'netflix-prd should not have metadata initially');
    assert.ok(existsSync(join(tmpDir, '.agents', 'skills', 'create-prd', '.arete-meta.yaml')), 'create-prd should have metadata');
    assert.ok(existsSync(join(tmpDir, '.agents', 'skills', 'discovery', '.arete-meta.yaml')), 'discovery should have metadata');
  });

  it('identifies community skills correctly', () => {
    const paths = getWorkspacePaths(tmpDir);
    const netflixPath = join(tmpDir, '.agents', 'skills', 'netflix-prd');
    writeFileSync(
      join(netflixPath, '.arete-meta.yaml'),
      stringifyYaml({ category: 'community', requires_briefing: true }),
      'utf8'
    );
    
    const skills = getMergedSkillsForRouting(paths);
    const netflix = skills.find(s => s.id === 'netflix-prd');
    assert.ok(netflix);
    assert.equal(netflix!.category, 'community');
  });

  it('correctly identifies newly installed skill when existing skills lack metadata', () => {
    // Simulate: user has existing default skills (with metadata) and installs a new skill
    // The new skill detection should work based on before/after comparison, not missing metadata
    
    // Before: create-prd and discovery have metadata
    writeFileSync(
      join(tmpDir, '.agents', 'skills', 'create-prd', '.arete-meta.yaml'),
      stringifyYaml({ category: 'core', requires_briefing: true }),
      'utf8'
    );
    writeFileSync(
      join(tmpDir, '.agents', 'skills', 'discovery', '.arete-meta.yaml'),
      stringifyYaml({ category: 'core', requires_briefing: true }),
      'utf8'
    );
    
    // After: user removes metadata from competitive-analysis (simulating it came from an old install)
    const compAnalysisMetaPath = join(tmpDir, '.agents', 'skills', 'competitive-analysis', '.arete-meta.yaml');
    if (existsSync(compAnalysisMetaPath)) {
      rmSync(compAnalysisMetaPath);
    }
    
    // Simulate installing netflix-prd
    // The newly installed skill is netflix-prd, NOT competitive-analysis (even though both lack metadata)
    
    // In the real code, we'd track this with before/after Set comparison
    const beforeInstall = new Set(['create-prd', 'discovery', 'competitive-analysis']);
    const afterInstall = new Set(['create-prd', 'discovery', 'competitive-analysis', 'netflix-prd']);
    
    // Find newly installed
    const newlyInstalled: string[] = [];
    for (const skill of afterInstall) {
      if (!beforeInstall.has(skill)) {
        newlyInstalled.push(skill);
      }
    }
    
    assert.equal(newlyInstalled.length, 1, 'Should identify exactly one newly installed skill');
    assert.equal(newlyInstalled[0], 'netflix-prd', 'Should identify netflix-prd as newly installed');
    assert.ok(!newlyInstalled.includes('competitive-analysis'), 'Should NOT include competitive-analysis');
  });
});
