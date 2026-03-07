/**
 * Tests for status command — ide_target path resolution + rich intelligence stats
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import {
  runCli,
  createTmpDir,
  cleanupTmpDir,
} from '../helpers.js';

describe('status command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-status');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  describe('ide_target path resolution', () => {
    it('uses adapter from config so ide_target is respected when both .cursor and .claude exist', async () => {
      runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);

      const claudeConfigsDir = join(
        tmpDir,
        '.claude',
        'integrations',
        'configs',
      );
      mkdirSync(claudeConfigsDir, { recursive: true });
      writeFileSync(
        join(claudeConfigsDir, 'fathom.yaml'),
        'name: Fathom\nstatus: active\ntype: meetings\n',
        'utf8',
      );

      const configPath = join(tmpDir, 'arete.yaml');
      const config = parseYaml(readFileSync(configPath, 'utf8')) as Record<
        string,
        unknown
      >;
      config.ide_target = 'claude';
      writeFileSync(configPath, stringifyYaml(config), 'utf8');

      const stdout = runCli(['status', '--json'], { cwd: tmpDir });
      const result = JSON.parse(stdout);
      assert.equal(result.success, true);
      assert.equal(result.workspace.ide, 'claude');
      assert.ok(
        Array.isArray(result.integrations),
        'integrations should be an array',
      );
      assert.equal(
        result.integrations.length,
        1,
        'should find the integration in .claude/integrations/configs/',
      );
      assert.equal(result.integrations[0].name, 'Fathom');
      assert.equal(result.integrations[0].status, 'active');
    });
  });

  describe('enhanced intelligence stats', () => {
    let tmpDir2: string;

    beforeEach(() => {
      tmpDir2 = createTmpDir('arete-test-status-enhanced');
      runCli(['install', tmpDir2, '--skip-qmd', '--json', '--ide', 'cursor']);
    });

    afterEach(() => {
      cleanupTmpDir(tmpDir2);
    });

    it('returns JSON with people, meetings, commitments, projects, memory, intelligence', () => {
      const stdout = runCli(['status', '--json'], { cwd: tmpDir2 });
      const result = JSON.parse(stdout) as {
        success: boolean;
        people: { total: number; internal: number; customers: number; users: number };
        meetings: { total: number; unprocessed: number };
        commitments: { open: number; overdue: number };
        projects: { active: number };
        memory: { decisions: number; learnings: number };
        intelligence: { patterns: number };
      };
      assert.equal(result.success, true);
      // All stat sections should be present
      assert.ok('people' in result, 'Should have people stats');
      assert.ok('meetings' in result, 'Should have meetings stats');
      assert.ok('commitments' in result, 'Should have commitments stats');
      assert.ok('projects' in result, 'Should have projects stats');
      assert.ok('memory' in result, 'Should have memory stats');
      assert.ok('intelligence' in result, 'Should have intelligence stats');
      // All counts should be numbers >= 0
      assert.ok(typeof result.people.total === 'number' && result.people.total >= 0);
      assert.ok(typeof result.meetings.total === 'number' && result.meetings.total >= 0);
      assert.ok(typeof result.commitments.open === 'number' && result.commitments.open >= 0);
      assert.ok(typeof result.projects.active === 'number' && result.projects.active >= 0);
      assert.ok(typeof result.intelligence.patterns === 'number' && result.intelligence.patterns >= 0);
    });

    it('counts people files correctly', () => {
      // Add a person file
      const internalDir = join(tmpDir2, 'people', 'internal');
      mkdirSync(internalDir, { recursive: true });
      writeFileSync(join(internalDir, 'alice.md'), '# Alice\n', 'utf8');

      const stdout = runCli(['status', '--json'], { cwd: tmpDir2 });
      const result = JSON.parse(stdout) as { people: { internal: number; total: number } };
      assert.ok(result.people.internal >= 1, 'Should count internal person');
      assert.ok(result.people.total >= 1, 'Total should include internal');
    });

    it('counts unprocessed meetings (status: synced)', () => {
      const meetingsDir = join(tmpDir2, 'resources', 'meetings');
      mkdirSync(meetingsDir, { recursive: true });
      writeFileSync(
        join(meetingsDir, '2026-03-01-team-sync.md'),
        `---
title: Team Sync
date: 2026-03-01
status: synced
---

Meeting content.
`,
        'utf8',
      );
      writeFileSync(
        join(meetingsDir, '2026-02-01-processed.md'),
        `---
title: Processed
date: 2026-02-01
status: processed
---

Meeting content.
`,
        'utf8',
      );

      const stdout = runCli(['status', '--json'], { cwd: tmpDir2 });
      const result = JSON.parse(stdout) as { meetings: { total: number; unprocessed: number } };
      assert.equal(result.meetings.total, 2);
      assert.equal(result.meetings.unprocessed, 1, 'Should count only synced meetings');
    });

    it('counts active projects', () => {
      const projectDir = join(tmpDir2, 'projects', 'active', 'my-project');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'README.md'), '# My Project\n', 'utf8');

      const stdout = runCli(['status', '--json'], { cwd: tmpDir2 });
      const result = JSON.parse(stdout) as { projects: { active: number } };
      assert.equal(result.projects.active, 1, 'Should count active project');
    });

    it('output includes recommendation to run arete daily', () => {
      const stdout = runCli(['status'], { cwd: tmpDir2 });
      assert.ok(
        stdout.includes('arete daily') || stdout.includes('daily'),
        `Expected mention of 'arete daily' in output: ${stdout}`,
      );
    });
  });
});
