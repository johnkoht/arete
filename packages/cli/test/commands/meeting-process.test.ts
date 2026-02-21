import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
  runCli,
  createTmpDir,
  cleanupTmpDir,
} from '../helpers.js';

describe('meeting process command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-meeting-process');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    mkdirSync(join(tmpDir, 'resources', 'meetings'), { recursive: true });
    mkdirSync(join(tmpDir, 'context'), { recursive: true });
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('processes latest meeting and keeps uncertain attendees in unknown queue', () => {
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-02-18-team-sync.md'),
      `---\ntitle: "Team Sync"\ndate: "2026-02-18"\n---\n\n# Team Sync\n\n**Attendees**: Mystery Person\n\n## Transcript\n**Mystery Person**: quick update\n`,
      'utf8',
    );

    const stdout = runCli([
      'meeting',
      'process',
      '--latest',
      '--dry-run',
      '--json',
    ], { cwd: tmpDir });

    const result = JSON.parse(stdout) as {
      success: boolean;
      candidates: number;
      unknownQueue: Array<{ name: string | null }>;
      applied: Array<{ slug: string }>;
    };

    assert.equal(result.success, true);
    assert.ok(result.candidates >= 1);
    assert.ok(result.unknownQueue.length >= 1);
    assert.equal(result.applied.length, 0);
  });

  it('uses intelligence classification to create internal person and writes attendee_ids', () => {
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

    const meetingPath = join(tmpDir, 'resources', 'meetings', '2026-02-19-product-review.md');
    writeFileSync(
      meetingPath,
      `---\ntitle: "Product Review"\ndate: "2026-02-19"\n---\n\n# Product Review\n\n**Attendees**: Sam Teammate <sam@acme.com>\n`,
      'utf8',
    );

    const stdout = runCli([
      'meeting',
      'process',
      '--file',
      'resources/meetings/2026-02-19-product-review.md',
      '--json',
    ], { cwd: tmpDir });

    const result = JSON.parse(stdout) as {
      success: boolean;
      applied: Array<{ slug: string; category: string }>;
      unknownQueue: Array<unknown>;
    };

    assert.equal(result.success, true);
    assert.ok(result.applied.some((person) => person.slug === 'sam-teammate'));
    assert.ok(result.applied.some((person) => person.category === 'internal'));
    assert.equal(result.unknownQueue.length, 0);

    const personPath = join(tmpDir, 'people', 'internal', 'sam-teammate.md');
    assert.equal(existsSync(personPath), true);

    const meetingContent = readFileSync(meetingPath, 'utf8');
    assert.ok(meetingContent.includes('attendee_ids'));
    assert.ok(meetingContent.includes('sam-teammate'));
  });
});
