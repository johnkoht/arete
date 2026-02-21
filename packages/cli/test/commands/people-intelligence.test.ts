import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  runCli,
  createTmpDir,
  cleanupTmpDir,
} from '../helpers.js';

describe('people intelligence digest command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-people-intelligence');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    mkdirSync(join(tmpDir, 'context'), { recursive: true });
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('returns digest mode with unknown queue defaults in JSON output', () => {
    const candidatePath = join(tmpDir, 'inputs', 'people-candidates.json');
    mkdirSync(join(tmpDir, 'inputs'), { recursive: true });
    writeFileSync(
      candidatePath,
      JSON.stringify([
        {
          name: 'Mystery Person',
          text: 'met someone briefly',
          source: 'meeting-a.md',
        },
      ], null, 2),
      'utf8',
    );

    const stdout = runCli([
      'people',
      'intelligence',
      'digest',
      '--input',
      'inputs/people-candidates.json',
      '--json',
    ], { cwd: tmpDir });

    const result = JSON.parse(stdout);
    assert.equal(result.success, true);
    assert.equal(result.mode, 'digest');
    assert.equal(result.unknownQueueCount, 1);
    assert.equal(result.suggestions[0].recommendation.category, 'unknown_queue');
    assert.equal(result.suggestions[0].status, 'needs-review');
  });

  it('uses domain hints to classify internal candidates', () => {
    writeFileSync(
      join(tmpDir, 'context', 'profile.md'),
      `---\nname: "Jane"\nemail: "jane@acme.com"\ncompany: "Acme"\n---\n`,
      'utf8',
    );
    writeFileSync(
      join(tmpDir, 'context', 'domain-hints.md'),
      `---\ndomains:\n  - acme.com\n---\n`,
      'utf8',
    );

    const candidatePath = join(tmpDir, 'inputs', 'people-candidates.json');
    mkdirSync(join(tmpDir, 'inputs'), { recursive: true });
    writeFileSync(
      candidatePath,
      JSON.stringify([
        {
          name: 'Sam Teammate',
          email: 'sam@acme.com',
          text: 'joined internal planning sync',
          source: 'meeting-b.md',
        },
      ], null, 2),
      'utf8',
    );

    const stdout = runCli([
      'people',
      'intelligence',
      'digest',
      '--input',
      'inputs/people-candidates.json',
      '--json',
    ], { cwd: tmpDir });

    const result = JSON.parse(stdout);
    assert.equal(result.success, true);
    assert.equal(result.suggestions[0].recommendation.affiliation, 'internal');
    assert.equal(result.suggestions[0].recommendation.category, 'internal');
  });
});
