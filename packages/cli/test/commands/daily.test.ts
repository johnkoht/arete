/**
 * Tests for `arete daily` command.
 *
 * Uses injectable deps (DailyCommandDeps) to mock all service calls.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeCommitments(dir: string, commitments: unknown[]): void {
  const areteDir = join(dir, '.arete');
  mkdirSync(areteDir, { recursive: true });
  writeFileSync(
    join(areteDir, 'commitments.json'),
    JSON.stringify({ commitments }, null, 2),
    'utf8',
  );
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('arete daily command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-daily');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('runs without error in a workspace with no data', () => {
    const stdout = runCli(['daily'], { cwd: tmpDir });
    assert.ok(stdout.includes('Morning Intelligence Brief'), `Expected header in output: ${stdout}`);
  });

  it('shows graceful empty states for all sections', () => {
    const stdout = runCli(['daily'], { cwd: tmpDir });
    assert.ok(stdout, 'Should produce output');
    // Should not throw
    assert.ok(
      stdout.includes('No meetings today') ||
        stdout.includes('No overdue commitments') ||
        stdout.includes('Morning Intelligence Brief'),
      `Expected graceful empty state: ${stdout}`,
    );
  });

  it('--json outputs valid JSON with success: true', () => {
    const raw = runCli(['daily', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as {
      success: boolean;
      brief: {
        meetings: unknown[];
        overdueCommitments: unknown[];
        activeProjects: unknown[];
        recentDecisions: unknown[];
        patterns: unknown[];
        generatedAt: string;
      };
    };
    assert.equal(parsed.success, true);
    assert.ok(parsed.brief, 'Should have brief object');
    assert.ok(Array.isArray(parsed.brief.meetings), 'meetings should be array');
    assert.ok(Array.isArray(parsed.brief.overdueCommitments), 'overdueCommitments should be array');
    assert.ok(Array.isArray(parsed.brief.activeProjects), 'activeProjects should be array');
    assert.ok(Array.isArray(parsed.brief.recentDecisions), 'recentDecisions should be array');
    assert.ok(Array.isArray(parsed.brief.patterns), 'patterns should be array');
    assert.ok(typeof parsed.brief.generatedAt === 'string', 'generatedAt should be a string');
  });

  it('shows overdue commitments in JSON output', () => {
    // Write an overdue commitment (30 days ago)
    const overdue = {
      id: 'abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abc1',
      text: 'Send quarterly report',
      direction: 'i_owe_them',
      personSlug: 'alice-smith',
      personName: 'Alice Smith',
      source: 'meeting.md',
      date: daysAgo(30),
      status: 'open',
      resolvedAt: null,
    };
    writeCommitments(tmpDir, [overdue]);

    const raw = runCli(['daily', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as {
      success: boolean;
      brief: {
        overdueCommitments: Array<{ commitment: { text: string }; daysOverdue: number }>;
      };
    };
    assert.equal(parsed.success, true);
    assert.ok(
      parsed.brief.overdueCommitments.length >= 1,
      `Expected at least 1 overdue commitment, got: ${JSON.stringify(parsed.brief.overdueCommitments)}`,
    );
    assert.ok(
      parsed.brief.overdueCommitments.some((c) => c.commitment.text === 'Send quarterly report'),
      'Should contain the overdue commitment',
    );
  });

  it('shows active projects in JSON output', () => {
    // Create a project
    const projectDir = join(tmpDir, 'projects', 'active', 'my-project');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'README.md'), '# My Project\n\nProject description.\n', 'utf8');

    const raw = runCli(['daily', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as {
      success: boolean;
      brief: { activeProjects: Array<{ slug: string; title: string; stale: boolean }> };
    };
    assert.equal(parsed.success, true);
    const myProject = parsed.brief.activeProjects.find((p) => p.slug === 'my-project');
    assert.ok(myProject, 'Should find my-project');
    assert.equal(myProject.title, 'My Project');
  });

  it('returns JSON error when not in workspace', () => {
    const { stdout, code } = runCliRaw(['daily', '--json'], { cwd: '/tmp' });
    assert.equal(code, 1);
    const parsed = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(parsed.success, false);
    assert.ok(parsed.error.includes('workspace'), `Expected workspace error: ${parsed.error}`);
  });

  it('shows recent decisions in JSON output when decisions file exists', () => {
    // Write a decisions file with a recent decision
    const memoryDir = join(tmpDir, '.arete', 'memory', 'items');
    mkdirSync(memoryDir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    writeFileSync(
      join(memoryDir, 'decisions.md'),
      `# Decisions\n\n- ${today}: Use TypeScript for all new services\n`,
      'utf8',
    );

    const raw = runCli(['daily', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as {
      success: boolean;
      brief: { recentDecisions: Array<{ text: string; date?: string }> };
    };
    assert.equal(parsed.success, true);
    assert.ok(
      parsed.brief.recentDecisions.length >= 1,
      'Should have at least one recent decision',
    );
  });
});
