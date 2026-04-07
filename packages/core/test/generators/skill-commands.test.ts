/**
 * Tests for skill command generator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSkillCommand, generateAllSkillCommands } from '../../src/generators/skill-commands.js';
import type { SkillDefinition } from '../../src/models/skills.js';

function makeSkill(overrides?: Partial<SkillDefinition>): SkillDefinition {
  return {
    id: 'week-plan',
    name: 'Week Plan',
    description: 'Plan the week and set weekly priorities.',
    path: '/workspace/.agents/skills/week-plan',
    triggers: ['plan my week'],
    category: 'core',
    ...overrides,
  };
}

describe('generateSkillCommand', () => {
  it('references .agents/skills/{name}/SKILL.md', () => {
    const output = generateSkillCommand(makeSkill());
    assert.ok(output.includes('.agents/skills/week-plan/SKILL.md'));
  });

  it('includes $ARGUMENTS', () => {
    const output = generateSkillCommand(makeSkill());
    assert.ok(output.includes('$ARGUMENTS'));
  });

  it('includes description at the top', () => {
    const output = generateSkillCommand(makeSkill());
    const firstLine = output.split('\n')[0];
    assert.equal(firstLine, 'Plan the week and set weekly priorities.');
  });

  it('adds arete brief instruction when requiresBriefing is true', () => {
    const skill = makeSkill({ requiresBriefing: true });
    const output = generateSkillCommand(skill);
    assert.ok(output.includes('arete brief --for "$ARGUMENTS" --skill week-plan --json'));
    assert.ok(output.includes('First, run the briefing:'));
  });

  it('does not add arete brief when requiresBriefing is falsy', () => {
    const skill = makeSkill({ requiresBriefing: false });
    const output = generateSkillCommand(skill);
    assert.ok(!output.includes('arete brief'));
  });

  it('adds profile reference when profile is set', () => {
    const skill = makeSkill({ profile: 'coach' });
    const output = generateSkillCommand(skill);
    assert.ok(output.includes('.agents/profiles/coach.md'));
  });

  it('does not add profile reference when profile is not set', () => {
    const skill = makeSkill();
    const output = generateSkillCommand(skill);
    assert.ok(!output.includes('.agents/profiles/'));
  });
});

describe('generateAllSkillCommands', () => {
  it('returns correct filename mapping', () => {
    const skills = [
      makeSkill({ id: 'week-plan' }),
      makeSkill({ id: 'daily-winddown', name: 'Daily Winddown', description: 'End of day.' }),
    ];
    const result = generateAllSkillCommands(skills);
    assert.ok('week-plan.md' in result);
    assert.ok('daily-winddown.md' in result);
    assert.equal(Object.keys(result).length, 2);
  });

  it('each value contains SKILL.md reference for its skill', () => {
    const skills = [
      makeSkill({ id: 'week-plan' }),
      makeSkill({ id: 'meeting-prep' }),
    ];
    const result = generateAllSkillCommands(skills);
    assert.ok(result['week-plan.md'].includes('.agents/skills/week-plan/SKILL.md'));
    assert.ok(result['meeting-prep.md'].includes('.agents/skills/meeting-prep/SKILL.md'));
  });
});
