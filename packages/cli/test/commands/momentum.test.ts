/**
 * Tests for `arete momentum` command.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeHash(text: string, personSlug: string, direction: string): string {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
  return createHash('sha256')
    .update(`${normalized}${personSlug}${direction}`)
    .digest('hex');
}

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

function writeMeeting(dir: string, filename: string, date: string, attendeeIds: string[]): void {
  const meetingsDir = join(dir, 'resources', 'meetings');
  mkdirSync(meetingsDir, { recursive: true });
  writeFileSync(
    join(meetingsDir, filename),
    `---
title: Test meeting
date: ${date}
status: processed
attendee_ids:
${attendeeIds.map((a) => `  - ${a}`).join('\n')}
---

## Summary
Test meeting summary.
`,
    'utf8',
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('arete momentum command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-momentum');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('runs without error with no data', () => {
    const stdout = runCli(['momentum'], { cwd: tmpDir });
    assert.ok(stdout.includes('Momentum'), `Expected "Momentum" header: ${stdout}`);
  });

  it('--json outputs valid JSON with success: true', () => {
    const raw = runCli(['momentum', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as {
      success: boolean;
      commitments: { hot: unknown[]; stale: unknown[]; critical: unknown[] };
      relationships: { active: unknown[]; cooling: unknown[]; stale: unknown[] };
    };
    assert.equal(parsed.success, true);
    assert.ok(Array.isArray(parsed.commitments.hot));
    assert.ok(Array.isArray(parsed.commitments.stale));
    assert.ok(Array.isArray(parsed.commitments.critical));
    assert.ok(Array.isArray(parsed.relationships.active));
    assert.ok(Array.isArray(parsed.relationships.cooling));
    assert.ok(Array.isArray(parsed.relationships.stale));
  });

  it('shows critical commitment (30+ days old)', () => {
    const c = {
      id: computeHash('Send critical report', 'alice', 'i_owe_them'),
      text: 'Send critical report',
      direction: 'i_owe_them',
      personSlug: 'alice',
      personName: 'Alice Smith',
      source: 'meeting.md',
      date: daysAgo(45),
      status: 'open',
      resolvedAt: null,
    };
    writeCommitments(tmpDir, [c]);

    const raw = runCli(['momentum', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as {
      success: boolean;
      commitments: { critical: Array<{ commitment: { text: string }; ageDays: number }> };
    };
    assert.equal(parsed.success, true);
    assert.equal(parsed.commitments.critical.length, 1);
    assert.equal(parsed.commitments.critical[0].commitment.text, 'Send critical report');
    assert.ok(parsed.commitments.critical[0].ageDays >= 44, 'Should be 44+ days old');
  });

  it('shows hot commitment (< 7 days old)', () => {
    const c = {
      id: computeHash('Send weekly update', 'bob', 'i_owe_them'),
      text: 'Send weekly update',
      direction: 'i_owe_them',
      personSlug: 'bob',
      personName: 'Bob Jones',
      source: 'meeting.md',
      date: daysAgo(3),
      status: 'open',
      resolvedAt: null,
    };
    writeCommitments(tmpDir, [c]);

    const raw = runCli(['momentum', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as {
      success: boolean;
      commitments: { hot: Array<{ commitment: { text: string } }> };
    };
    assert.equal(parsed.success, true);
    assert.equal(parsed.commitments.hot.length, 1);
    assert.equal(parsed.commitments.hot[0].commitment.text, 'Send weekly update');
  });

  it('shows relationship momentum from meeting files', () => {
    writeMeeting(tmpDir, '2026-03-01-team-sync.md', daysAgo(5), ['alice-smith', 'bob-jones']);

    const raw = runCli(['momentum', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as {
      success: boolean;
      relationships: { active: Array<{ personSlug: string; bucket: string }> };
    };
    assert.equal(parsed.success, true);
    // People from recent meeting should be active
    const alice = parsed.relationships.active.find((r) => r.personSlug === 'alice-smith');
    assert.ok(alice, 'Alice should be in active relationships');
    assert.equal(alice.bucket, 'active');
  });

  it('--person filter limits output to one person', () => {
    const c1 = {
      id: computeHash('Alice task', 'alice', 'i_owe_them'),
      text: 'Alice task',
      direction: 'i_owe_them',
      personSlug: 'alice',
      personName: 'Alice Smith',
      source: 'meeting.md',
      date: daysAgo(3),
      status: 'open',
      resolvedAt: null,
    };
    const c2 = {
      id: computeHash('Bob task', 'bob', 'i_owe_them'),
      text: 'Bob task',
      direction: 'i_owe_them',
      personSlug: 'bob',
      personName: 'Bob Jones',
      source: 'meeting.md',
      date: daysAgo(3),
      status: 'open',
      resolvedAt: null,
    };
    writeCommitments(tmpDir, [c1, c2]);

    const raw = runCli(['momentum', '--person', 'alice', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as {
      success: boolean;
      commitments: { hot: Array<{ commitment: { personSlug: string } }> };
    };
    assert.equal(parsed.success, true);
    // Should only have alice's commitments
    const allCommitments = [
      ...parsed.commitments.hot,
    ];
    assert.ok(
      allCommitments.every((c) => c.commitment.personSlug === 'alice'),
      'All commitments should be for alice',
    );
    // Bob's task should not be there
    assert.ok(
      !allCommitments.some((c) => c.commitment.personSlug === 'bob'),
      'Bob should not appear',
    );
  });

  it('returns JSON error when not in workspace', () => {
    const { stdout, code } = runCliRaw(['momentum', '--json'], { cwd: '/tmp' });
    assert.equal(code, 1);
    const parsed = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(parsed.success, false);
    assert.ok(parsed.error.includes('workspace'), `Expected workspace error: ${parsed.error}`);
  });
});
