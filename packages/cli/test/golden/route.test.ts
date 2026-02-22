/**
 * Golden pattern tests for arete route command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli, runCliRaw } from '../helpers.js';

describe('golden: route command', () => {
  it('route produces JSON with query, skill, model', () => {
    const stdout = runCli(['route', 'create a PRD for search', '--json']);
    const json = JSON.parse(stdout);
    assert.equal(json.success, true);
    assert.ok(typeof json.query === 'string');
    assert.ok(typeof json.model === 'object');
    assert.ok(typeof json.model.tier === 'string');
    assert.ok(typeof json.model.reason === 'string');
    assert.ok(
      /^(fast|balanced|powerful)$/.test(json.model.tier),
      'Model tier should be fast, balanced, or powerful',
    );
  });

  it('route human output has Skill/Tool and Model lines', () => {
    const stdout = runCli(['route', 'help me with a meeting']);
    assert.ok(
      /Skill\/Tool:/.test(stdout) || /Model:/.test(stdout),
      'Should have Skill/Tool or Model section',
    );
    assert.ok(
      /Model:\s+\w+\s+—/.test(stdout),
      'Should have Model: tier — reason format',
    );
  });

  describe('tool routing (temp workspace)', () => {
    let wsDir: string;

    beforeEach(() => {
      wsDir = mkdtempSync(join(tmpdir(), 'arete-golden-route-'));
      // Minimal workspace: arete.yaml + tools + skills
      writeFileSync(join(wsDir, 'arete.yaml'), 'version: 1\n', 'utf8');

      // Create a tool
      const toolDir = join(wsDir, '.cursor', 'tools', 'onboarding');
      mkdirSync(toolDir, { recursive: true });
      writeFileSync(
        join(toolDir, 'TOOL.md'),
        [
          '---',
          'name: onboarding',
          'description: 30/60/90 day plan for thriving at a new job - learn, contribute, lead',
          'lifecycle: time-bound',
          'duration: 90-150 days',
          'triggers:',
          '  - "I\'m starting a new job"',
          '  - "onboarding"',
          '  - "30/60/90"',
          '  - "new role"',
          '  - "ramp up"',
          '---',
          '# Onboarding Tool',
        ].join('\n'),
        'utf8',
      );

      // Create a skill so we know routing works for both
      const skillDir = join(wsDir, '.agents', 'skills', 'meeting-prep');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        [
          '---',
          'name: meeting-prep',
          'description: Build a prep brief for meetings',
          'triggers:',
          '  - "meeting prep"',
          '  - "prep for meeting"',
          '---',
          '# Meeting Prep',
        ].join('\n'),
        'utf8',
      );
    });

    afterEach(() => {
      rmSync(wsDir, { recursive: true, force: true });
    });

    it('route JSON includes type field for tool routing', () => {
      const stdout = runCli(['route', "I'm starting a new job", '--json'], { cwd: wsDir });
      const json = JSON.parse(stdout);
      assert.equal(json.success, true);
      assert.ok(json.skill, 'Should have a skill/tool match');
      assert.ok(
        typeof json.skill.type === 'string',
        'Routing result should include type field',
      );
      assert.ok(
        ['skill', 'tool'].includes(json.skill.type),
        `type should be "skill" or "tool", got "${json.skill.type}"`,
      );
    });

    it('route routes job-related query to onboarding tool', () => {
      const stdout = runCli(['route', "I'm starting a new job", '--json'], { cwd: wsDir });
      const json = JSON.parse(stdout);
      assert.equal(json.success, true);
      assert.ok(json.skill, 'Should match a candidate');
      assert.equal(json.skill.skill, 'onboarding', 'Should route to onboarding tool');
      assert.equal(json.skill.type, 'tool', 'onboarding should be a tool');
      assert.equal(json.skill.action, 'activate', 'tools should have action=activate');
    });

    it('route routes meeting query to meeting-prep skill (not tool)', () => {
      const stdout = runCli(['route', 'prep for meeting with Jane', '--json'], { cwd: wsDir });
      const json = JSON.parse(stdout);
      assert.equal(json.success, true);
      assert.ok(json.skill, 'Should match a candidate');
      assert.equal(json.skill.skill, 'meeting-prep', 'Should route to meeting-prep skill');
      assert.equal(json.skill.type, 'skill', 'meeting-prep should be a skill');
      assert.equal(json.skill.action, 'load', 'skills should have action=load');
    });
  });
});
