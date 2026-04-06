/**
 * Tests for CLAUDE.md generator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateClaudeMd } from '../../src/generators/claude-md.js';
import type { AreteConfig } from '../../src/models/workspace.js';
import type { SkillDefinition } from '../../src/models/skills.js';

function makeConfig(overrides?: Partial<AreteConfig>): AreteConfig {
  return {
    schema: 1,
    version: '0.5.0',
    source: 'test',
    skills: { core: [], overrides: [] },
    tools: [],
    integrations: {},
    settings: {
      memory: {
        decisions: { prompt_before_save: true },
        learnings: { prompt_before_save: true },
      },
      conversations: { peopleProcessing: 'ask' },
    },
    ...overrides,
  };
}

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

describe('generateClaudeMd', () => {
  it('contains Arete identity section', () => {
    const output = generateClaudeMd(makeConfig(), []);
    assert.ok(output.includes('Arete PM Workspace'));
    assert.ok(output.includes('excellence'));
  });

  it('contains workspace structure tree', () => {
    const output = generateClaudeMd(makeConfig(), []);
    assert.ok(output.includes('now/'));
    assert.ok(output.includes('goals/'));
    assert.ok(output.includes('context/'));
    assert.ok(output.includes('.arete/'));
    assert.ok(output.includes('.agents/'));
  });

  it('contains slash commands table when skills provided', () => {
    const skills = [
      makeSkill(),
      makeSkill({ id: 'daily-winddown', name: 'Daily Winddown', description: 'End of day reflection.' }),
    ];
    const output = generateClaudeMd(makeConfig(), skills);
    assert.ok(output.includes('| /week-plan |'));
    assert.ok(output.includes('| /daily-winddown |'));
    assert.ok(output.includes('| Command | Description |'));
  });

  it('contains intelligence services section', () => {
    const output = generateClaudeMd(makeConfig(), []);
    assert.ok(output.includes('arete search'));
    assert.ok(output.includes('arete brief'));
    assert.ok(output.includes('arete resolve'));
    assert.ok(output.includes('arete commitments list'));
  });

  it('contains memory section', () => {
    const output = generateClaudeMd(makeConfig(), []);
    assert.ok(output.includes('decisions.md'));
    assert.ok(output.includes('learnings.md'));
  });

  it('contains version footer with config version', () => {
    const output = generateClaudeMd(makeConfig({ version: '0.5.0' }), []);
    assert.ok(output.includes('Arete v0.5.0'));
  });

  it('does NOT contain STOP or routing-mandatory language', () => {
    const skills = [makeSkill()];
    const output = generateClaudeMd(makeConfig(), skills);
    assert.ok(!output.includes('STOP'));
    assert.ok(!output.includes('routing-mandatory'));
    assert.ok(!output.includes('MANDATORY'));
  });

  it('is under 300 lines with a reasonable skill list', () => {
    const skills = Array.from({ length: 15 }, (_, i) =>
      makeSkill({ id: `skill-${i}`, name: `Skill ${i}`, description: `Description for skill ${i}.` })
    );
    const output = generateClaudeMd(makeConfig(), skills);
    const lineCount = output.split('\n').length;
    assert.ok(lineCount < 300, `Output was ${lineCount} lines, expected < 300`);
  });

  it('handles null version gracefully', () => {
    const output = generateClaudeMd(makeConfig({ version: null }), []);
    assert.ok(output.includes('Arete vunknown'));
  });

  it('references agent profiles path when skill has profile field', () => {
    const skillWithProfile = makeSkill({ profile: 'executive-coach' });
    const output = generateClaudeMd(makeConfig(), [skillWithProfile]);
    assert.ok(
      output.includes('.agents/profiles/'),
      'Should reference .agents/profiles/ directory'
    );
  });
});
