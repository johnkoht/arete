import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

import { createTmpDir, cleanupTmpDir, runCli, runCliRaw } from '../helpers.js';

describe('skill command', () => {
  let workspaceDir: string;
  let fixtureDir: string;

  beforeEach(() => {
    workspaceDir = createTmpDir('arete-test-skill-workspace');
    fixtureDir = createTmpDir('arete-test-skill-fixture');

    runCli(['install', workspaceDir, '--json', '--ide', 'cursor']);

    const skillDir = join(fixtureDir, 'local-test-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---\nname: Local Test Skill\ndescription: Local fixture skill\n---\n\n# Local Test Skill\n`,
      'utf8',
    );
  });

  afterEach(() => {
    cleanupTmpDir(workspaceDir);
    cleanupTmpDir(fixtureDir);
  });

  it('supports skill add as an alias of skill install', () => {
    const skillSource = join(fixtureDir, 'local-test-skill');

    const output = runCli(
      ['skill', 'add', skillSource, '--json'],
      { cwd: workspaceDir },
    );
    const parsed = JSON.parse(output) as { success: boolean; skill: string; path: string };

    assert.equal(parsed.success, true, 'should report success');
    assert.equal(parsed.skill, 'Local Test Skill', 'should use skill name from metadata');
    assert.ok(parsed.path.endsWith(join('.agents', 'skills', 'local-test-skill')));
    assert.ok(
      existsSync(join(workspaceDir, '.agents', 'skills', 'local-test-skill', 'SKILL.md')),
      'installed skill should exist in workspace',
    );
  });

  it('shows add in skill help output', () => {
    const result = runCliRaw(['skill', '--help'], { cwd: workspaceDir });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /add \[options\] <source>/, 'help should include add alias');
  });

  it('supports skills as an alias of skill', () => {
    const result = runCliRaw(['skills', '--help'], { cwd: workspaceDir });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Manage skills/);
    assert.match(result.stdout, /list \[options\]/);
  });
});
