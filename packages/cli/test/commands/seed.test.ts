import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { createTmpDir, cleanupTmpDir, runCli, runCliRaw } from '../helpers.js';

describe('seed command', () => {
  let workspaceDir: string;
  let nonWorkspaceDir: string;

  beforeEach(() => {
    workspaceDir = createTmpDir('arete-test-seed');
    nonWorkspaceDir = createTmpDir('arete-test-seed-non-workspace');
  });

  afterEach(() => {
    cleanupTmpDir(workspaceDir);
    cleanupTmpDir(nonWorkspaceDir);
  });

  it('seeds test-data fixtures into a workspace', () => {
    runCli(['install', workspaceDir, '--json', '--ide', 'cursor']);

    const output = runCli(['seed', 'test-data', '--json'], { cwd: workspaceDir });
    const result = JSON.parse(output) as {
      success: boolean;
      source: string;
      people: number;
      meetings: number;
      projects: number;
    };

    assert.equal(result.success, true);
    assert.equal(result.source, 'test-data');
    assert.ok(result.people > 0, 'should copy people fixtures');
    assert.ok(result.meetings > 0, 'should copy meeting fixtures');
    assert.ok(result.projects > 0, 'should copy project fixtures');

    assert.equal(existsSync(join(workspaceDir, 'people', 'internal', 'jane-doe.md')), true);
    assert.equal(existsSync(join(workspaceDir, 'resources', 'meetings')), true);
    assert.equal(existsSync(join(workspaceDir, 'people', 'index.md')), true);
    assert.equal(existsSync(join(workspaceDir, 'TEST-SCENARIOS.md')), true);

    // seeded context corpus should include canonical context files
    assert.equal(existsSync(join(workspaceDir, 'context', 'business-overview.md')), true);
    assert.equal(existsSync(join(workspaceDir, 'context', 'business-model.md')), true);
    assert.equal(existsSync(join(workspaceDir, 'context', 'competitive-landscape.md')), true);
    assert.equal(existsSync(join(workspaceDir, 'context', 'products-services.md')), true);
    assert.equal(existsSync(join(workspaceDir, 'context', 'users-personas.md')), true);

    // lifecycle-aware projects layout
    assert.equal(
      existsSync(join(workspaceDir, 'projects', 'active', 'onboarding-discovery', 'README.md')),
      true,
    );
    assert.equal(
      existsSync(join(workspaceDir, 'projects', 'archive', 'design-system', 'README.md')),
      true,
    );

    // backward-compat legacy flat project should still land under active/
    assert.equal(
      existsSync(join(workspaceDir, 'projects', 'active', 'legacy-prototype', 'README.md')),
      true,
    );

    const peopleListOutput = runCli(['people', 'list', '--json'], { cwd: workspaceDir });
    const peopleList = JSON.parse(peopleListOutput) as {
      success: boolean;
      people: Array<{ slug: string }>;
    };
    assert.equal(peopleList.success, true);
    assert.ok(
      peopleList.people.some((person) => person.slug === 'jane-doe'),
      'jane-doe should be available after fixture seed',
    );

    const manifest = parseYaml(readFileSync(join(workspaceDir, 'arete.yaml'), 'utf8')) as {
      schema: number;
    };
    assert.equal(manifest.schema, 1);
  });

  it('returns an error when run outside a workspace', () => {
    const result = runCliRaw(['seed', 'test-data', '--json'], { cwd: nonWorkspaceDir });
    assert.equal(result.code, 1);

    const parsed = JSON.parse(result.stdout) as { success: boolean; error: string };
    assert.equal(parsed.success, false);
    assert.equal(parsed.error, 'Not in an Areté workspace');
  });
});
