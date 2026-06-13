/**
 * CLI integration tests for `arete winddown apply <date>`.
 *
 * Uses a real temp workspace (`arete install`) with a processed meeting fixture,
 * a commitment, and a rendered approval doc + baseline. Verifies the W3 apply
 * path end-to-end against the real primitives:
 *   - AC1 agree-path: apply with no edits → meeting approved, commitment resolved
 *   - AC4 idempotent re-apply → nothing new, "already resolved"
 *   - AC5/AC7: meeting frontmatter status becomes `approved` (same contract the
 *     web /review UI reads)
 *   - dry-run executes nothing
 *   - user-override (unchecked [x]) → item skipped, not committed
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';
import type { CommitmentsFile, Commitment } from '@arete/core';

const DATE = '2026-06-09';

function commitmentHash(text: string, slug: string, dir: 'i_owe_them' | 'they_owe_me'): string {
  const n = text.toLowerCase().trim().replace(/\s+/g, ' ');
  return createHash('sha256').update(`${n}${slug}${dir}`).digest('hex');
}

function writeMeeting(dir: string): void {
  const meetingsDir = join(dir, 'resources', 'meetings');
  mkdirSync(meetingsDir, { recursive: true });
  const content = `---
title: Anthony / John Weekly
date: ${DATE}
status: processed
attendees:
  - John Koht
  - Anthony
staged_item_status:
  ai_001: approved
  ai_002: skipped
staged_item_skip_reason:
  ai_002:
    reason: answered later
    evidence: workshop de_001
    setBy: chef
    setAt: ${DATE}T15:00:00.000Z
---

## Summary

Weekly sync.

## Staged Action Items
- ai_001: Set up tech spike with Nick + James
- ai_002: Confirm consolidation rules universal

## Staged Decisions
- de_001: PRDs get a UX section going forward
`;
  writeFileSync(join(meetingsDir, 'anthony.md'), content, 'utf8');
}

function renderedDoc(): string {
  // Mirrors renderWinddownDoc output for the fixture (the agent baseline).
  return [
    `# Daily Winddown — ${DATE} (Tue)   ·   review & apply`,
    '',
    '## Anthony / John Weekly',
    '',
    '### Action items',
    '- [x] Set up tech spike with Nick + James  <!-- ai_001@anthony -->',
    '- [ ] Confirm consolidation rules universal — skip: answered later  <!-- ai_002@anthony -->',
    '',
    '### Decisions',
    '- [x] PRDs get a UX section going forward  <!-- de_001@anthony -->',
    '',
    '## Proposed actions   (cross-cutting — same check-to-do)',
    '',
    '- [x] Resolve abc123 — done today  <!-- act:resolve:RESOLVE_ID -->',
    '',
  ].join('\n');
}

function writeDocs(dir: string, resolveId: string, edited?: string): void {
  const archive = join(dir, 'now', 'archive', 'daily-winddown');
  mkdirSync(archive, { recursive: true });
  const baseline = renderedDoc().replace('RESOLVE_ID', resolveId);
  writeFileSync(join(archive, `winddown-${DATE}.baseline.md`), baseline, 'utf8');
  writeFileSync(join(archive, `winddown-${DATE}.md`), (edited ?? baseline).replace('RESOLVE_ID', resolveId), 'utf8');
}

function writeCommitment(dir: string): string {
  const areteDir = join(dir, '.arete');
  mkdirSync(areteDir, { recursive: true });
  const id = commitmentHash('Draft status-letter skill output', 'self', 'i_owe_them');
  const c: Commitment = {
    id,
    text: 'Draft status-letter skill output',
    direction: 'i_owe_them',
    personSlug: 'self',
    personName: 'John Koht',
    source: 'week.md',
    date: DATE,
    createdAt: DATE,
    status: 'open',
    resolvedAt: null,
  };
  const file: CommitmentsFile = { commitments: [c] };
  writeFileSync(join(areteDir, 'commitments.json'), JSON.stringify(file, null, 2), 'utf8');
  return id.slice(0, 8);
}

describe('arete winddown apply', () => {
  let tmpDir: string;
  let resolveId: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-winddown');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    writeMeeting(tmpDir);
    resolveId = writeCommitment(tmpDir);
    writeDocs(tmpDir, resolveId);
  });

  afterEach(() => cleanupTmpDir(tmpDir));

  it('AC1 agree-path: applies, commits the meeting, resolves the commitment', () => {
    const { stdout, code } = runCliRaw(['winddown', 'apply', DATE, '--yes'], { cwd: tmpDir });
    assert.equal(code, 0, stdout);
    assert.match(stdout, /Applied winddown 2026-06-09/);

    // AC7: meeting frontmatter status becomes `approved` (web /review contract).
    const meeting = readFileSync(join(tmpDir, 'resources', 'meetings', 'anthony.md'), 'utf8');
    assert.match(meeting, /status:\s*approved/);
    // Approved action item lands in the body ## Approved section.
    assert.match(meeting, /## Approved Action Items/);
    assert.match(meeting, /Set up tech spike with Nick \+ James/);

    // Commitment resolved.
    const commits = JSON.parse(readFileSync(join(tmpDir, '.arete', 'commitments.json'), 'utf8'));
    assert.equal(commits.commitments[0].status, 'resolved');
  });

  it('AC4 idempotent re-apply: nothing new, reports already resolved', () => {
    runCliRaw(['winddown', 'apply', DATE, '--yes'], { cwd: tmpDir });
    const { stdout, code } = runCliRaw(['winddown', 'apply', DATE, '--yes'], { cwd: tmpDir });
    assert.equal(code, 0, stdout);
    // Meeting already approved → 0 meetings committed; commitment already resolved.
    assert.match(stdout, /already resolved/);
    assert.match(stdout, /0 meetings committed/);
  });

  it('dry-run executes nothing', () => {
    const { stdout, code } = runCliRaw(['winddown', 'apply', DATE, '--dry-run'], { cwd: tmpDir });
    assert.equal(code, 0, stdout);
    assert.match(stdout, /DRY RUN/);
    const meeting = readFileSync(join(tmpDir, 'resources', 'meetings', 'anthony.md'), 'utf8');
    assert.match(meeting, /status:\s*processed/); // unchanged
  });

  it('user-override: unchecking an [x] skips the item (not committed)', () => {
    const edited = renderedDoc().replace(
      '- [x] Set up tech spike with Nick + James',
      '- [ ] Set up tech spike with Nick + James',
    );
    writeDocs(tmpDir, resolveId, edited);
    const { stdout, code } = runCliRaw(['winddown', 'apply', DATE, '--yes'], { cwd: tmpDir });
    assert.equal(code, 0, stdout);
    const meeting = readFileSync(join(tmpDir, 'resources', 'meetings', 'anthony.md'), 'utf8');
    // ai_001 was overridden → skipped → NOT in approved action items.
    assert.doesNotMatch(meeting, /## Approved Action Items/);
    // de_001 (still [x]) IS committed.
    assert.match(meeting, /## Approved Decisions/);
  });

  it('AC2: a malformed/unknown anchor is surfaced, not applied', () => {
    const edited = renderedDoc() + '\n- [x] sneaky new item  <!-- ai_999@anthony -->';
    writeDocs(tmpDir, resolveId, edited);
    const { stdout, code } = runCliRaw(['winddown', 'apply', DATE, '--yes'], { cwd: tmpDir });
    assert.equal(code, 0, stdout);
    assert.match(stdout, /Warnings/);
    assert.match(stdout, /ai_999@anthony/);
  });
});
