/**
 * Tests for `arete hygiene` commands.
 *
 * Uses a real temp workspace created by `arete install`.
 * Fixtures are created by writing meeting files with old dates directly.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a meeting file with an old date so it triggers the stale-meetings scan. */
function writeStaleMeeting(
  workspaceDir: string,
  filename: string,
  opts: { title: string; date: string; status: string },
): void {
  const meetingsDir = join(workspaceDir, 'resources', 'meetings');
  mkdirSync(meetingsDir, { recursive: true });
  const content = `---
title: "${opts.title}"
date: "${opts.date}"
status: "${opts.status}"
---

# ${opts.title}

Meeting notes here.
`;
  writeFileSync(join(meetingsDir, filename), content, 'utf8');
}

/** Write resolved commitments to trigger the commitments scan. */
function writeResolvedCommitments(
  workspaceDir: string,
  commitments: Array<{
    id: string;
    text: string;
    status: string;
    resolvedAt: string;
    date: string;
  }>,
): void {
  const areteDir = join(workspaceDir, '.arete');
  mkdirSync(areteDir, { recursive: true });
  const file = {
    commitments: commitments.map((c) => ({
      ...c,
      direction: 'i_owe_them',
      personSlug: 'alice',
      personName: 'Alice Smith',
      source: 'test',
    })),
  };
  writeFileSync(
    join(areteDir, 'commitments.json'),
    JSON.stringify(file, null, 2),
    'utf8',
  );
}

// ---------------------------------------------------------------------------
// hygiene scan
// ---------------------------------------------------------------------------

describe('hygiene scan command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-hygiene-scan');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('returns empty report on clean workspace with --json', () => {
    const raw = runCli(['hygiene', 'scan', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as {
      success: boolean;
      report: { items: unknown[]; summary: { total: number } };
    };
    assert.equal(parsed.success, true);
    assert.equal(parsed.report.summary.total, 0);
    assert.equal(parsed.report.items.length, 0);
  });

  it('detects stale meetings with old dates', () => {
    // Create a meeting from 120 days ago (older than 90-day default threshold)
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 120);
    const dateStr = oldDate.toISOString().split('T')[0];

    writeStaleMeeting(tmpDir, 'old-meeting.md', {
      title: 'Old Planning Session',
      date: dateStr,
      status: 'processed',
    });

    const raw = runCli(['hygiene', 'scan', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as {
      success: boolean;
      report: {
        items: Array<{
          tier: number;
          category: string;
          description: string;
          actionType: string;
        }>;
        summary: { total: number; byTier: Record<string, number> };
      };
    };
    assert.equal(parsed.success, true);
    assert.ok(parsed.report.summary.total >= 1, `Expected at least 1 item, got ${parsed.report.summary.total}`);

    // Find the meeting item
    const meetingItem = parsed.report.items.find(
      (i) => i.category === 'meetings',
    );
    assert.ok(meetingItem, 'Expected a meetings category item');
    assert.equal(meetingItem.tier, 1);
    assert.equal(meetingItem.actionType, 'archive');
    assert.ok(
      meetingItem.description.includes('Old Planning Session'),
      `Expected description to mention meeting title: ${meetingItem.description}`,
    );
  });

  it('filters by --tier', () => {
    // Create stale meeting (tier 1)
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 120);
    const dateStr = oldDate.toISOString().split('T')[0];

    writeStaleMeeting(tmpDir, 'old-meeting.md', {
      title: 'Old Meeting',
      date: dateStr,
      status: 'processed',
    });

    // Scan only tier 2 — should not include the tier 1 meeting item
    const raw = runCli(['hygiene', 'scan', '--tier', '2', '--json'], {
      cwd: tmpDir,
    });
    const parsed = JSON.parse(raw) as {
      success: boolean;
      report: {
        items: Array<{ tier: number }>;
        summary: { total: number };
      };
    };
    assert.equal(parsed.success, true);
    // Should have no tier 1 items
    const tier1Items = parsed.report.items.filter((i) => i.tier === 1);
    assert.equal(tier1Items.length, 0, 'Expected no tier 1 items when filtering by tier 2');
  });

  it('shows human-readable output for clean workspace', () => {
    const stdout = runCli(['hygiene', 'scan'], { cwd: tmpDir });
    assert.ok(
      stdout.includes('no issues found'),
      `Expected "no issues found" in output: ${stdout}`,
    );
  });

  it('returns JSON error when not in workspace', () => {
    const { stdout, code } = runCliRaw(['hygiene', 'scan', '--json'], {
      cwd: '/tmp',
    });
    assert.equal(code, 1);
    const parsed = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(parsed.success, false);
    assert.ok(
      parsed.error.includes('workspace'),
      `Expected workspace error: ${parsed.error}`,
    );
  });
});

// ---------------------------------------------------------------------------
// hygiene apply
// ---------------------------------------------------------------------------

describe('hygiene apply command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-hygiene-apply');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('applies with --yes --skip-qmd --json on workspace with stale meetings', () => {
    // Create a meeting from 120 days ago
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 120);
    const dateStr = oldDate.toISOString().split('T')[0];

    writeStaleMeeting(tmpDir, 'stale-meeting.md', {
      title: 'Stale Meeting',
      date: dateStr,
      status: 'processed',
    });

    // Verify meeting exists before apply
    assert.ok(
      existsSync(join(tmpDir, 'resources', 'meetings', 'stale-meeting.md')),
      'Meeting file should exist before apply',
    );

    const raw = runCli(
      ['hygiene', 'apply', '--yes', '--skip-qmd', '--json'],
      { cwd: tmpDir },
    );
    const parsed = JSON.parse(raw) as {
      success: boolean;
      applied: string[];
      failed: Array<{ id: string; error: string }>;
      appliedCount: number;
      failedCount: number;
      qmd: { skipped: boolean };
    };

    assert.equal(parsed.success, true);
    assert.ok(
      parsed.appliedCount >= 1,
      `Expected at least 1 applied, got ${parsed.appliedCount}`,
    );
    assert.equal(parsed.failedCount, 0, `Expected 0 failures, got: ${JSON.stringify(parsed.failed)}`);
    assert.equal(parsed.qmd.skipped, true);

    // Verify meeting was moved to archive
    assert.ok(
      !existsSync(join(tmpDir, 'resources', 'meetings', 'stale-meeting.md')),
      'Original meeting file should be removed after archive',
    );

    // Check archive directory exists
    const yearMonth = dateStr.slice(0, 7); // YYYY-MM
    const archivePath = join(
      tmpDir,
      'resources',
      'meetings',
      'archive',
      yearMonth,
      'stale-meeting.md',
    );
    assert.ok(
      existsSync(archivePath),
      `Archived meeting should exist at ${archivePath}`,
    );

    // Verify archived file has archived_at frontmatter
    const archivedContent = readFileSync(archivePath, 'utf8');
    assert.ok(
      archivedContent.includes('archived_at'),
      'Archived meeting should have archived_at frontmatter',
    );
  });

  it('dry-run with --skip-qmd --json makes no filesystem changes', () => {
    // Create a stale meeting
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 120);
    const dateStr = oldDate.toISOString().split('T')[0];

    writeStaleMeeting(tmpDir, 'dry-run-meeting.md', {
      title: 'Dry Run Meeting',
      date: dateStr,
      status: 'processed',
    });

    const raw = runCli(
      ['hygiene', 'apply', '--yes', '--dry-run', '--skip-qmd', '--json'],
      { cwd: tmpDir },
    );
    const parsed = JSON.parse(raw) as {
      success: boolean;
      dryRun: boolean;
      wouldApply: Array<{
        id: string;
        tier: number;
        category: string;
        actionType: string;
        description: string;
      }>;
      count: number;
    };

    assert.equal(parsed.success, true);
    assert.equal(parsed.dryRun, true);
    assert.ok(parsed.count >= 1, `Expected at least 1 item in dry-run, got ${parsed.count}`);

    // Verify original meeting is still there (not moved)
    assert.ok(
      existsSync(join(tmpDir, 'resources', 'meetings', 'dry-run-meeting.md')),
      'Meeting file should still exist after dry-run',
    );
  });

  it('reports nothing to apply on clean workspace with --json', () => {
    const raw = runCli(
      ['hygiene', 'apply', '--yes', '--skip-qmd', '--json'],
      { cwd: tmpDir },
    );
    const parsed = JSON.parse(raw) as {
      success: boolean;
      applied: string[];
      message: string;
    };
    assert.equal(parsed.success, true);
    assert.ok(
      parsed.message.includes('Nothing to apply'),
      `Expected "Nothing to apply" message: ${parsed.message}`,
    );
  });

  it('returns JSON error when not in workspace', () => {
    const { stdout, code } = runCliRaw(
      ['hygiene', 'apply', '--yes', '--skip-qmd', '--json'],
      { cwd: '/tmp' },
    );
    assert.equal(code, 1);
    const parsed = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(parsed.success, false);
    assert.ok(
      parsed.error.includes('workspace'),
      `Expected workspace error: ${parsed.error}`,
    );
  });
});
