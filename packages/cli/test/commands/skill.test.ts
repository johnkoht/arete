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

    runCli(['install', workspaceDir, '--skip-qmd', '--json', '--ide', 'cursor']);

    const skillDir = join(fixtureDir, 'local-test-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---\nname: Local Test Skill\ndescription: Local fixture skill\n---\n\n# Local Test Skill\n`,
      'utf8',
    );
  });

  function createSkillWithIntegration(name: string, integrationYaml: string): string {
    const skillDir = join(fixtureDir, name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---\nname: ${name}\ndescription: Skill with integration\nintegration:\n${integrationYaml}---\n\n# ${name}\n`,
      'utf8',
    );
    return skillDir;
  }

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

  it('shows override guidance in set-default help output', () => {
    const result = runCliRaw(['skill', 'set-default', '--help'], { cwd: workspaceDir });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /routing preference only/i);
    assert.match(result.stdout, /skills\.overrides/i);
  });

  it('prints .arete-meta.yaml guidance after install (no integration)', () => {
    const skillSource = join(fixtureDir, 'local-test-skill');
    const result = runCliRaw(['skill', 'install', skillSource, '--yes'], { cwd: workspaceDir });
    assert.equal(result.code, 0);
    assert.match(
      result.stdout,
      /\.arete-meta\.yaml to customize integration/,
      'should print guidance about editing .arete-meta.yaml',
    );
  });

  it('prints .arete-meta.yaml guidance even when --yes is passed', () => {
    const skillSource = join(fixtureDir, 'local-test-skill');
    const result = runCliRaw(['skill', 'install', skillSource, '--yes'], { cwd: workspaceDir });
    assert.equal(result.code, 0);
    assert.match(
      result.stdout,
      /\.arete-meta\.yaml to customize integration/,
      'should print guidance with --yes (informational, not interactive)',
    );
  });

  it('prints output type when skill has integration profile', () => {
    const skillSource = createSkillWithIntegration(
      'integration-skill',
      '  outputs:\n    - type: project\n      path: projects/\n',
    );
    const result = runCliRaw(['skill', 'install', skillSource, '--yes'], { cwd: workspaceDir });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Output type.*project/i, 'should print output type');
    assert.match(result.stdout, /Output path.*projects\//i, 'should print output path');
  });

  it('prints arete index hint when skill has index: true output', () => {
    const skillSource = createSkillWithIntegration(
      'index-skill',
      '  outputs:\n    - type: resource\n      path: resources/\n      index: true\n',
    );
    const result = runCliRaw(['skill', 'install', skillSource, '--yes'], { cwd: workspaceDir });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /arete index/, 'should hint to run arete index');
  });

  it('does not print arete index hint when no outputs have index: true', () => {
    const skillSource = createSkillWithIntegration(
      'no-index-skill',
      '  outputs:\n    - type: project\n      path: projects/\n',
    );
    const result = runCliRaw(['skill', 'install', skillSource, '--yes'], { cwd: workspaceDir });
    assert.equal(result.code, 0);
    assert.doesNotMatch(result.stdout, /arete index/, 'should not hint arete index when no index outputs');
  });

  it('includes integration in --json output when skill has integration profile', () => {
    const skillSource = createSkillWithIntegration(
      'json-integration-skill',
      '  outputs:\n    - type: resource\n      path: resources/insights/\n      index: true\n',
    );
    const output = runCli(['skill', 'install', skillSource, '--json'], { cwd: workspaceDir });
    const parsed = JSON.parse(output) as {
      success: boolean;
      skill: string;
      path: string;
      integration?: { outputs: Array<{ type: string; path?: string; index?: boolean }> };
    };
    assert.equal(parsed.success, true);
    assert.ok(parsed.integration, 'JSON output should include integration key');
    assert.equal(parsed.integration?.outputs[0].type, 'resource');
    assert.equal(parsed.integration?.outputs[0].path, 'resources/insights/');
    assert.equal(parsed.integration?.outputs[0].index, true);
  });

  it('omits integration key in --json output when skill has no integration profile', () => {
    const skillSource = join(fixtureDir, 'local-test-skill');
    const output = runCli(['skill', 'install', skillSource, '--json'], { cwd: workspaceDir });
    const parsed = JSON.parse(output) as {
      success: boolean;
      skill: string;
      path: string;
      integration?: unknown;
    };
    assert.equal(parsed.success, true);
    assert.equal(parsed.integration, undefined, 'JSON output should not include integration key when none exists');
  });
});
