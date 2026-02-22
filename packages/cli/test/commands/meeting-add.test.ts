import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  runCli,
  runCliRaw,
  createTmpDir,
  cleanupTmpDir,
} from '../helpers.js';

const VALID_MEETING_JSON = JSON.stringify({
  title: 'Sprint Planning',
  date: '2026-02-20',
  duration_minutes: 60,
  summary: 'Discussed upcoming sprint goals and priorities.',
  attendees: ['Alice Smith <alice@acme.com>', 'Bob Jones'],
  action_items: ['Bob to write specs'],
  transcript: 'Alice: Let\'s plan the sprint. Bob: Sounds good.',
});

describe('meeting add command', () => {
  let tmpDir: string;
  let inputFile: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-meeting-add');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    mkdirSync(join(tmpDir, 'resources', 'meetings'), { recursive: true });
    inputFile = join(tmpDir, 'meeting-input.json');
    writeFileSync(inputFile, VALID_MEETING_JSON, 'utf8');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('saves a meeting from a JSON file and returns success', () => {
    const stdout = runCli(
      ['meeting', 'add', '--file', inputFile, '--skip-qmd', '--json'],
      { cwd: tmpDir },
    );
    const result = JSON.parse(stdout) as {
      success: boolean;
      saved: boolean;
      path: string | null;
      filename: string | null;
    };

    assert.equal(result.success, true);
    assert.equal(result.saved, true);
    assert.ok(result.path !== null);
    assert.ok(result.filename !== null);
    assert.ok(result.filename?.includes('sprint-planning'));
  });

  it('skips duplicate meeting (already exists) and returns saved:false', () => {
    // First add
    runCli(['meeting', 'add', '--file', inputFile, '--skip-qmd', '--json'], { cwd: tmpDir });

    // Second add — same meeting, should be skipped
    const stdout = runCli(
      ['meeting', 'add', '--file', inputFile, '--skip-qmd', '--json'],
      { cwd: tmpDir },
    );
    const result = JSON.parse(stdout) as {
      success: boolean;
      saved: boolean;
      path: string | null;
    };

    assert.equal(result.success, false);
    assert.equal(result.saved, false);
    assert.equal(result.path, null);
  });

  it('errors without --file or --stdin', () => {
    const { stdout, code } = runCliRaw(
      ['meeting', 'add', '--skip-qmd', '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 1);
    const result = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(result.success, false);
    assert.ok(result.error.includes('--file') || result.error.includes('stdin'));
  });

  describe('qmd integration', () => {
    it('--skip-qmd produces qmd.skipped:true in JSON output when meeting is saved', () => {
      const stdout = runCli(
        ['meeting', 'add', '--file', inputFile, '--skip-qmd', '--json'],
        { cwd: tmpDir },
      );
      const result = JSON.parse(stdout) as {
        success: boolean;
        saved: boolean;
        qmd: { indexed: boolean; skipped: boolean };
      };

      assert.equal(result.success, true);
      assert.equal(result.saved, true);
      assert.equal(result.qmd.skipped, true);
      assert.equal(result.qmd.indexed, false);
    });

    it('qmd.skipped:true when meeting already exists (no write)', () => {
      // First add
      runCli(['meeting', 'add', '--file', inputFile, '--skip-qmd', '--json'], { cwd: tmpDir });

      // Second add — duplicate, qmd should be skipped since nothing was written
      const stdout = runCli(
        ['meeting', 'add', '--file', inputFile, '--json'],
        { cwd: tmpDir },
      );
      const result = JSON.parse(stdout) as {
        success: boolean;
        saved: boolean;
        qmd: { indexed: boolean; skipped: boolean };
      };

      assert.equal(result.saved, false);
      // qmdResult is undefined when fullPath is null, so JSON shows skipped:true
      assert.equal(result.qmd.skipped, true);
      assert.equal(result.qmd.indexed, false);
    });
  });
});
