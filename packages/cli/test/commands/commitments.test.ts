/**
 * Tests for `arete commitments` commands.
 *
 * Uses a real temp workspace created by `arete install`.
 * Commitments data is written directly to .arete/commitments.json.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';
import type { CommitmentsFile, Commitment } from '@arete/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeHash(
  text: string,
  personSlug: string,
  direction: 'i_owe_them' | 'they_owe_me',
): string {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
  return createHash('sha256')
    .update(`${normalized}${personSlug}${direction}`)
    .digest('hex');
}

function makeCommitment(overrides: Partial<Commitment>): Commitment {
  return {
    id: computeHash('Default text', 'alice', 'i_owe_them'),
    text: 'Default text',
    direction: 'i_owe_them',
    personSlug: 'alice',
    personName: 'Alice Smith',
    source: 'meeting-2026-01-15.md',
    date: '2026-01-15',
    status: 'open',
    resolvedAt: null,
    ...overrides,
  };
}

function writeCommitments(workspaceDir: string, commitments: Commitment[]): void {
  const areteDir = join(workspaceDir, '.arete');
  mkdirSync(areteDir, { recursive: true });
  const file: CommitmentsFile = { commitments };
  writeFileSync(join(areteDir, 'commitments.json'), JSON.stringify(file, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('commitments list command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-commitments');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('returns empty state message when no commitments', () => {
    const stdout = runCli(['commitments', 'list'], { cwd: tmpDir });
    assert.ok(
      stdout.includes('No open commitments'),
      `Expected "No open commitments" in output, got: ${stdout}`,
    );
  });

  it('lists open commitments grouped by direction (human output)', () => {
    const c1 = makeCommitment({
      id: computeHash('Send architecture doc', 'dave', 'i_owe_them'),
      text: 'Send architecture doc',
      personSlug: 'dave',
      personName: 'Dave Wiedenheft',
      direction: 'i_owe_them',
      date: '2026-02-26',
    });
    const c2 = makeCommitment({
      id: computeHash('Share Monday meeting slides', 'dave', 'they_owe_me'),
      text: 'Share Monday meeting slides',
      personSlug: 'dave',
      personName: 'Dave Wiedenheft',
      direction: 'they_owe_me',
      date: '2026-02-26',
    });
    writeCommitments(tmpDir, [c1, c2]);

    const stdout = runCli(['commitments', 'list'], { cwd: tmpDir });
    assert.ok(stdout.includes('I owe them'), `Expected "I owe them" heading: ${stdout}`);
    assert.ok(stdout.includes('They owe me'), `Expected "They owe me" heading: ${stdout}`);
    assert.ok(stdout.includes('Send architecture doc'), `Expected c1 text: ${stdout}`);
    assert.ok(stdout.includes('Share Monday meeting slides'), `Expected c2 text: ${stdout}`);
    assert.ok(stdout.includes('Dave Wiedenheft'), `Expected person name: ${stdout}`);
    assert.ok(stdout.includes('2026-02-26'), `Expected date: ${stdout}`);
    // Short ID (8 chars) should appear
    assert.ok(
      stdout.includes(c1.id.slice(0, 8)),
      `Expected short ID in output: ${stdout}`,
    );
  });

  it('returns JSON output with --json flag', () => {
    const c = makeCommitment({
      id: computeHash('Send report', 'alice', 'i_owe_them'),
      text: 'Send report',
      personSlug: 'alice',
      personName: 'Alice Smith',
      direction: 'i_owe_them',
    });
    writeCommitments(tmpDir, [c]);

    const raw = runCli(['commitments', 'list', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as {
      success: boolean;
      commitments: Array<{ id: string; idShort: string; direction: string; personName: string; text: string }>;
      count: number;
    };
    assert.equal(parsed.success, true);
    assert.equal(parsed.count, 1);
    assert.equal(parsed.commitments[0].text, 'Send report');
    assert.equal(parsed.commitments[0].personName, 'Alice Smith');
    assert.equal(parsed.commitments[0].idShort, c.id.slice(0, 8));
    assert.equal(parsed.commitments[0].direction, 'i_owe_them');
  });

  it('filters by --direction i_owe_them', () => {
    const c1 = makeCommitment({
      id: computeHash('Owe action', 'alice', 'i_owe_them'),
      text: 'Owe action',
      direction: 'i_owe_them',
    });
    const c2 = makeCommitment({
      id: computeHash('They owe action', 'alice', 'they_owe_me'),
      text: 'They owe action',
      direction: 'they_owe_me',
    });
    writeCommitments(tmpDir, [c1, c2]);

    const raw = runCli(['commitments', 'list', '--direction', 'i_owe_them', '--json'], {
      cwd: tmpDir,
    });
    const parsed = JSON.parse(raw) as { success: boolean; commitments: Array<{ direction: string }>; count: number };
    assert.equal(parsed.count, 1);
    assert.equal(parsed.commitments[0].direction, 'i_owe_them');
  });

  it('filters by --person slug', () => {
    const c1 = makeCommitment({
      id: computeHash('Alice action', 'alice', 'i_owe_them'),
      text: 'Alice action',
      personSlug: 'alice',
      personName: 'Alice Smith',
    });
    const c2 = makeCommitment({
      id: computeHash('Bob action', 'bob', 'i_owe_them'),
      text: 'Bob action',
      personSlug: 'bob',
      personName: 'Bob Jones',
    });
    writeCommitments(tmpDir, [c1, c2]);

    const raw = runCli(['commitments', 'list', '--person', 'alice', '--json'], {
      cwd: tmpDir,
    });
    const parsed = JSON.parse(raw) as { success: boolean; commitments: Array<{ personSlug: string }>; count: number };
    assert.equal(parsed.count, 1);
    assert.equal(parsed.commitments[0].personSlug, 'alice');
  });

  it('returns error JSON for invalid direction', () => {
    const { stdout, code } = runCliRaw(
      ['commitments', 'list', '--direction', 'bad_value', '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 1);
    const parsed = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(parsed.success, false);
    assert.ok(parsed.error.includes('bad_value'), `Expected error to mention bad_value: ${parsed.error}`);
  });

  it('returns JSON error when not in workspace', () => {
    const { stdout, code } = runCliRaw(['commitments', 'list', '--json'], {
      cwd: '/tmp',
    });
    assert.equal(code, 1);
    const parsed = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(parsed.success, false);
    assert.ok(parsed.error.includes('workspace'), `Expected workspace error: ${parsed.error}`);
  });

  it('does not list resolved commitments', () => {
    const open = makeCommitment({
      id: computeHash('Open action', 'alice', 'i_owe_them'),
      text: 'Open action',
      status: 'open',
    });
    const resolved = makeCommitment({
      id: computeHash('Resolved action', 'alice', 'i_owe_them'),
      text: 'Resolved action',
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
    });
    writeCommitments(tmpDir, [open, resolved]);

    const raw = runCli(['commitments', 'list', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as { count: number; commitments: Array<{ text: string }> };
    assert.equal(parsed.count, 1);
    assert.equal(parsed.commitments[0].text, 'Open action');
  });

  it('includes goalSlug in JSON output when present', () => {
    const withGoal = makeCommitment({
      id: computeHash('Send proposal', 'alice', 'i_owe_them'),
      text: 'Send proposal',
      personSlug: 'alice',
      personName: 'Alice Smith',
      direction: 'i_owe_them',
      goalSlug: 'Q1-2',
    });
    const withoutGoal = makeCommitment({
      id: computeHash('Follow up on email', 'bob', 'i_owe_them'),
      text: 'Follow up on email',
      personSlug: 'bob',
      personName: 'Bob Jones',
      direction: 'i_owe_them',
    });
    writeCommitments(tmpDir, [withGoal, withoutGoal]);

    const raw = runCli(['commitments', 'list', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as {
      success: boolean;
      commitments: Array<{ text: string; goalSlug?: string }>;
      count: number;
    };
    assert.equal(parsed.success, true);
    assert.equal(parsed.count, 2);

    const proposalCommitment = parsed.commitments.find((c) => c.text === 'Send proposal');
    const emailCommitment = parsed.commitments.find((c) => c.text === 'Follow up on email');

    assert.equal(proposalCommitment?.goalSlug, 'Q1-2', 'Expected goalSlug for commitment with goal');
    assert.equal(emailCommitment?.goalSlug, undefined, 'Expected no goalSlug for commitment without goal');
  });

  it('shows goalSlug prefix in human output when present', () => {
    const withGoal = makeCommitment({
      id: computeHash('Send proposal to Acme', 'jane', 'i_owe_them'),
      text: 'Send proposal to Acme',
      personSlug: 'jane',
      personName: 'Jane Doe',
      direction: 'i_owe_them',
      goalSlug: 'Q1-2',
      date: '2026-03-01',
    });
    const withoutGoal = makeCommitment({
      id: computeHash('Review slides', 'jane', 'they_owe_me'),
      text: 'Review slides',
      personSlug: 'jane',
      personName: 'Jane Doe',
      direction: 'they_owe_me',
      date: '2026-03-01',
    });
    writeCommitments(tmpDir, [withGoal, withoutGoal]);

    const stdout = runCli(['commitments', 'list'], { cwd: tmpDir });

    // Commitment with goalSlug should show [Q1-2] prefix
    assert.ok(stdout.includes('[Q1-2]'), `Expected [Q1-2] goal prefix in output: ${stdout}`);
    assert.ok(stdout.includes('Send proposal to Acme'), `Expected commitment text: ${stdout}`);

    // Commitment without goalSlug should NOT have empty brackets
    assert.ok(stdout.includes('Review slides'), `Expected commitment text without goal: ${stdout}`);
    // Verify no empty brackets appear (would show as "[]" if buggy)
    assert.ok(!stdout.includes('[] Review slides'), `Should not have empty brackets: ${stdout}`);
  });

  it('includes area in JSON output when present', () => {
    const withArea = makeCommitment({
      id: computeHash('Review contract', 'alice', 'i_owe_them'),
      text: 'Review contract',
      personSlug: 'alice',
      personName: 'Alice Smith',
      direction: 'i_owe_them',
      area: 'glance-communications',
    });
    const withoutArea = makeCommitment({
      id: computeHash('Follow up on email', 'bob', 'i_owe_them'),
      text: 'Follow up on email',
      personSlug: 'bob',
      personName: 'Bob Jones',
      direction: 'i_owe_them',
    });
    writeCommitments(tmpDir, [withArea, withoutArea]);

    const raw = runCli(['commitments', 'list', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as {
      success: boolean;
      commitments: Array<{ text: string; area?: string }>;
      count: number;
    };
    assert.equal(parsed.success, true);
    assert.equal(parsed.count, 2);

    const contractCommitment = parsed.commitments.find((c) => c.text === 'Review contract');
    const emailCommitment = parsed.commitments.find((c) => c.text === 'Follow up on email');

    assert.equal(contractCommitment?.area, 'glance-communications', 'Expected area for commitment with area');
    assert.equal(emailCommitment?.area, undefined, 'Expected no area for commitment without area');
  });

  it('shows area tag in human output when any commitment has area', () => {
    const withArea = makeCommitment({
      id: computeHash('Review Glance contract', 'jane', 'i_owe_them'),
      text: 'Review Glance contract',
      personSlug: 'jane',
      personName: 'Jane Doe',
      direction: 'i_owe_them',
      area: 'glance-communications',
      date: '2026-03-01',
    });
    const withoutArea = makeCommitment({
      id: computeHash('Review slides', 'jane', 'they_owe_me'),
      text: 'Review slides',
      personSlug: 'jane',
      personName: 'Jane Doe',
      direction: 'they_owe_me',
      date: '2026-03-01',
    });
    writeCommitments(tmpDir, [withArea, withoutArea]);

    const stdout = runCli(['commitments', 'list'], { cwd: tmpDir });

    // Commitment with area should show @area tag
    assert.ok(stdout.includes('@glance-communications'), `Expected @glance-communications area tag in output: ${stdout}`);
    assert.ok(stdout.includes('Review Glance contract'), `Expected commitment text: ${stdout}`);
  });

  it('filters by --area flag', () => {
    const c1 = makeCommitment({
      id: computeHash('Action in area 1', 'alice', 'i_owe_them'),
      text: 'Action in area 1',
      personSlug: 'alice',
      personName: 'Alice Smith',
      area: 'area-1',
    });
    const c2 = makeCommitment({
      id: computeHash('Action in area 2', 'bob', 'i_owe_them'),
      text: 'Action in area 2',
      personSlug: 'bob',
      personName: 'Bob Jones',
      area: 'area-2',
    });
    writeCommitments(tmpDir, [c1, c2]);

    const raw = runCli(['commitments', 'list', '--area', 'area-1', '--json'], {
      cwd: tmpDir,
    });
    const parsed = JSON.parse(raw) as { success: boolean; commitments: Array<{ area?: string }>; count: number };

    assert.equal(parsed.success, true);
    assert.equal(parsed.count, 1);
    assert.equal(parsed.commitments[0].area, 'area-1');
  });

  it('filters by --area returns empty when no match', () => {
    const c = makeCommitment({
      id: computeHash('Some action', 'alice', 'i_owe_them'),
      text: 'Some action',
      personSlug: 'alice',
      personName: 'Alice Smith',
      area: 'existing-area',
    });
    writeCommitments(tmpDir, [c]);

    const raw = runCli(['commitments', 'list', '--area', 'nonexistent-area', '--json'], {
      cwd: tmpDir,
    });
    const parsed = JSON.parse(raw) as { success: boolean; commitments: Array<unknown>; count: number };

    assert.equal(parsed.success, true);
    assert.equal(parsed.count, 0);
  });

  it('combines --area with --direction filter', () => {
    const c1 = makeCommitment({
      id: computeHash('I owe in area 1', 'alice', 'i_owe_them'),
      text: 'I owe in area 1',
      direction: 'i_owe_them',
      area: 'area-1',
    });
    const c2 = makeCommitment({
      id: computeHash('They owe in area 1', 'alice', 'they_owe_me'),
      text: 'They owe in area 1',
      direction: 'they_owe_me',
      area: 'area-1',
    });
    writeCommitments(tmpDir, [c1, c2]);

    const raw = runCli(
      ['commitments', 'list', '--area', 'area-1', '--direction', 'i_owe_them', '--json'],
      { cwd: tmpDir },
    );
    const parsed = JSON.parse(raw) as { count: number; commitments: Array<{ text: string }> };

    assert.equal(parsed.count, 1);
    assert.equal(parsed.commitments[0].text, 'I owe in area 1');
  });
});

describe('commitments resolve command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-commitments-resolve');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('resolves a commitment by full ID with --yes --skip-qmd', () => {
    const c = makeCommitment({
      id: computeHash('Send report', 'alice', 'i_owe_them'),
      text: 'Send report',
      personSlug: 'alice',
      personName: 'Alice Smith',
    });
    writeCommitments(tmpDir, [c]);

    const raw = runCli(
      ['commitments', 'resolve', c.id, '--yes', '--skip-qmd', '--json'],
      { cwd: tmpDir },
    );
    const parsed = JSON.parse(raw) as {
      success: boolean;
      resolved: { id: string; text: string; status: string; resolvedAt: string | null };
      qmd: { skipped: boolean };
    };
    assert.equal(parsed.success, true);
    assert.equal(parsed.resolved.text, 'Send report');
    assert.equal(parsed.resolved.status, 'resolved');
    assert.ok(parsed.resolved.resolvedAt !== null, 'resolvedAt should be set');
    assert.equal(parsed.qmd.skipped, true);
  });

  it('resolves a commitment by 8-char prefix with --yes --skip-qmd', () => {
    const c = makeCommitment({
      id: computeHash('Send slides', 'alice', 'i_owe_them'),
      text: 'Send slides',
    });
    writeCommitments(tmpDir, [c]);

    const shortId = c.id.slice(0, 8);
    const raw = runCli(
      ['commitments', 'resolve', shortId, '--yes', '--skip-qmd', '--json'],
      { cwd: tmpDir },
    );
    const parsed = JSON.parse(raw) as { success: boolean; resolved: { status: string } };
    assert.equal(parsed.success, true);
    assert.equal(parsed.resolved.status, 'resolved');
  });

  it('drops a commitment with --status dropped', () => {
    const c = makeCommitment({
      id: computeHash('Drop action', 'alice', 'i_owe_them'),
      text: 'Drop action',
    });
    writeCommitments(tmpDir, [c]);

    const raw = runCli(
      ['commitments', 'resolve', c.id, '--status', 'dropped', '--yes', '--skip-qmd', '--json'],
      { cwd: tmpDir },
    );
    const parsed = JSON.parse(raw) as { success: boolean; resolved: { status: string } };
    assert.equal(parsed.success, true);
    assert.equal(parsed.resolved.status, 'dropped');
  });

  it('returns JSON error when commitment not found', () => {
    writeCommitments(tmpDir, []);

    const { stdout, code } = runCliRaw(
      ['commitments', 'resolve', 'deadbeef', '--yes', '--skip-qmd', '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 1);
    const parsed = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(parsed.success, false);
    assert.ok(
      parsed.error.toLowerCase().includes('no commitment') ||
        parsed.error.toLowerCase().includes('not found'),
      `Expected "no commitment" or "not found" in error: ${parsed.error}`,
    );
  });

  it('returns JSON error for invalid status', () => {
    const c = makeCommitment({
      id: computeHash('Some action', 'alice', 'i_owe_them'),
      text: 'Some action',
    });
    writeCommitments(tmpDir, [c]);

    const { stdout, code } = runCliRaw(
      ['commitments', 'resolve', c.id, '--status', 'invalid', '--yes', '--skip-qmd', '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 1);
    const parsed = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(parsed.success, false);
    assert.ok(
      parsed.error.includes('invalid'),
      `Expected error to mention 'invalid': ${parsed.error}`,
    );
  });

  it('returns JSON error when not in workspace', () => {
    const { stdout, code } = runCliRaw(
      ['commitments', 'resolve', 'deadbeef', '--yes', '--skip-qmd', '--json'],
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

  it('returns JSON error for ambiguous prefix', () => {
    const id1 = 'abcd1234' + 'a'.repeat(56);
    const id2 = 'abcd1234' + 'b'.repeat(56);
    const c1 = makeCommitment({ id: id1, text: 'Action one', personSlug: 'alice' });
    const c2 = makeCommitment({ id: id2, text: 'Action two', personSlug: 'alice' });
    writeCommitments(tmpDir, [c1, c2]);

    const { stdout, code } = runCliRaw(
      ['commitments', 'resolve', 'abcd1234', '--yes', '--skip-qmd', '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 1);
    const parsed = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(parsed.success, false);
    assert.ok(
      parsed.error.toLowerCase().includes('ambiguous'),
      `Expected "ambiguous" in error: ${parsed.error}`,
    );
  });
});
