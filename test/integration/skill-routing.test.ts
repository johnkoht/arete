/**
 * Integration test: Skill routing should be IDE-agnostic.
 * Both Cursor and Claude workspaces should route the same query to the same skill.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';

import { installCommand } from '../../src/commands/install.js';
import { getWorkspacePaths } from '../../src/core/workspace.js';
import { loadConfig } from '../../src/core/config.js';
import { routeToSkill } from '../../src/core/skill-router.js';
import { getMergedSkillsForRouting, applySkillDefaults } from '../../src/commands/skill.js';

// Helpers
function createTmpDir(): string {
  const dir = join(tmpdir(), `arete-test-routing-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function routeInWorkspace(workspaceRoot: string, query: string) {
  const paths = getWorkspacePaths(workspaceRoot);
  const config = loadConfig(workspaceRoot);
  const skills = getMergedSkillsForRouting(paths);
  const candidates = skills.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    path: s.path,
    triggers: s.triggers,
    primitives: s.primitives as import('../../src/types.js').ProductPrimitive[] | undefined,
    work_type: s.work_type as import('../../src/types.js').WorkType | undefined,
    category: s.category as import('../../src/types.js').SkillCategory | undefined,
    intelligence: s.intelligence,
    requires_briefing: s.requires_briefing,
  }));
  const routed = routeToSkill(query, candidates);
  return applySkillDefaults(routed, skills, config.skills?.defaults);
}

describe('skill routing - IDE agnostic', () => {
  let cursorWorkspace: string;
  let claudeWorkspace: string;

  beforeEach(async () => {
    cursorWorkspace = createTmpDir();
    claudeWorkspace = createTmpDir();
    await installCommand(cursorWorkspace, { json: true, ide: 'cursor' });
    await installCommand(claudeWorkspace, { json: true, ide: 'claude' });
  });

  afterEach(() => {
    if (cursorWorkspace && existsSync(cursorWorkspace)) {
      rmSync(cursorWorkspace, { recursive: true, force: true });
    }
    if (claudeWorkspace && existsSync(claudeWorkspace)) {
      rmSync(claudeWorkspace, { recursive: true, force: true });
    }
  });

  it('returns same skill for same query in both IDEs', () => {
    const query = 'prep me for my meeting with Jane';

    const cursorResult = routeInWorkspace(cursorWorkspace, query);
    const claudeResult = routeInWorkspace(claudeWorkspace, query);

    // Both should find a skill
    assert.ok(cursorResult, 'Cursor workspace should route to a skill');
    assert.ok(claudeResult, 'Claude workspace should route to a skill');

    // Both should route to the same skill
    assert.equal(cursorResult.skill, claudeResult.skill, 
      'Both workspaces should route to the same skill');
    
    // Both should have same metadata
    assert.equal(cursorResult.category, claudeResult.category, 
      'Both should have same category');
    assert.equal(cursorResult.work_type, claudeResult.work_type, 
      'Both should have same work_type');
  });

  it('returns same skill for discovery query in both IDEs', () => {
    const query = 'help me understand this problem';

    const cursorResult = routeInWorkspace(cursorWorkspace, query);
    const claudeResult = routeInWorkspace(claudeWorkspace, query);

    assert.ok(cursorResult, 'Cursor workspace should route to a skill');
    assert.ok(claudeResult, 'Claude workspace should route to a skill');
    assert.equal(cursorResult.skill, claudeResult.skill, 
      'Both workspaces should route to the same skill');
  });

  it('returns same skill for PRD query in both IDEs', () => {
    const query = 'create a PRD for this feature';

    const cursorResult = routeInWorkspace(cursorWorkspace, query);
    const claudeResult = routeInWorkspace(claudeWorkspace, query);

    assert.ok(cursorResult, 'Cursor workspace should route to a skill');
    assert.ok(claudeResult, 'Claude workspace should route to a skill');
    assert.equal(cursorResult.skill, claudeResult.skill, 
      'Both workspaces should route to the same skill');
  });

  it('skills are in IDE-specific location but routing is identical', () => {
    const query = 'analyze this data';

    const cursorResult = routeInWorkspace(cursorWorkspace, query);
    const claudeResult = routeInWorkspace(claudeWorkspace, query);

    // Paths should be different (different IDE directories)
    assert.notEqual(cursorResult?.path, claudeResult?.path, 
      'Paths should differ due to IDE-specific directories');
    
    // But skill ID should be the same
    assert.equal(cursorResult?.skill, claudeResult?.skill, 
      'Skill ID should be identical');

    // Verify paths contain correct IDE directory
    if (cursorResult?.path) {
      assert.ok(cursorResult.path.includes('.agents/skills/'), 
        'Cursor path should use .agents/skills/');
    }
    if (claudeResult?.path) {
      assert.ok(claudeResult.path.includes('.agents/skills/'), 
        'Claude path should use .agents/skills/');
    }
  });

  it('handles no-match consistently across both IDEs', () => {
    const query = 'xyzabc nonsense query that should not match anything';

    const cursorResult = routeInWorkspace(cursorWorkspace, query);
    const claudeResult = routeInWorkspace(claudeWorkspace, query);

    // Both should return null (no match)
    assert.equal(cursorResult, null, 'Cursor workspace should return null for no match');
    assert.equal(claudeResult, null, 'Claude workspace should return null for no match');
  });
});
