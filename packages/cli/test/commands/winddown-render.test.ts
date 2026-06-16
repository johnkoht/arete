/**
 * CLI integration tests for `arete winddown render <date>`.
 *
 * The agent-invokable surface that fixes the SOAK-FINDINGS Night-1 gap: the
 * deterministic frontmatter → staged-items/decisions/learnings checkbox block,
 * with --write persisting the apply baseline. Verifies:
 *   - --stdout (default) emits the per-meeting grouped, tier-marked, anchored block
 *   - --write persists winddown-<date>.baseline.md VERBATIM
 *   - the written baseline round-trips through `apply` (anchors recovered)
 *   - empty/no-meetings day handled cleanly
 *   - only processed/approved meetings included
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

const DATE = '2026-06-15';

function writeMeeting(dir: string, slug: string, content: string): void {
  const meetingsDir = join(dir, 'resources', 'meetings');
  mkdirSync(meetingsDir, { recursive: true });
  writeFileSync(join(meetingsDir, `${slug}.md`), content, 'utf8');
}

const COMPLIANCE = `---
title: Glance 2.0 Compliance Workshop
date: ${DATE}
status: processed
staged_item_status:
  ai_001: pending
  de_001: approved
  le_001: pending
staged_item_importance:
  ai_001: blocker
  de_001: high
staged_item_uncertain:
  le_001: org FYI, not your workstream
---

## Summary
Workshop.

## Staged Action Items
- ai_001: Glance must auto-assign claims by license profile

## Staged Decisions
- de_001: Cadence locked day 15 first letter then every 30d

## Staged Learnings
- le_001: Kim's team building AI state-reg wiki
`;

const DRAFT = `---
title: Draft Meeting
date: ${DATE}
status: draft
---

## Staged Action Items
- ai_001: should NOT appear (meeting is draft)
`;

describe('arete winddown render', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-winddown-render');
    runCliRaw(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor'], { cwd: process.cwd() });
  });

  afterEach(() => cleanupTmpDir(tmpDir));

  it('--help lists the render subcommand', () => {
    const { stdout, code } = runCliRaw(['winddown', 'render', '--help'], { cwd: tmpDir });
    assert.equal(code, 0, stdout);
    assert.match(stdout, /render/);
    assert.match(stdout, /--write/);
    assert.match(stdout, /baseline/i);
  });

  it('--stdout (default): grouped per-meeting, tier markers, anchors present', () => {
    writeMeeting(tmpDir, `${DATE}-compliance`, COMPLIANCE);
    const { stdout, code } = runCliRaw(['winddown', 'render', DATE], { cwd: tmpDir });
    assert.equal(code, 0, stdout);
    assert.match(stdout, /## Glance 2\.0 Compliance Workshop/);
    assert.match(stdout, /\*\*\[BLOCKER\]\*\*/);
    assert.match(stdout, /\*\*\[high\]\*\*/);
    // anchor present + apply-compatible (slug = file basename).
    assert.match(stdout, /<!-- ai_001@2026-06-15-compliance -->/);
    assert.match(stdout, /<!-- de_001@2026-06-15-compliance -->/);
    // uncertain learning routed to Your-call (choice anchors), not a section line.
    assert.match(stdout, /Your call/);
    assert.match(stdout, /<!-- choice:le_001@2026-06-15-compliance:keep -->/);
    // no doc title / proposed-actions (agent composes those).
    assert.doesNotMatch(stdout, /# Daily Winddown/);
    assert.doesNotMatch(stdout, /## Proposed actions/);
  });

  it('--write persists the baseline verbatim and it round-trips through apply', () => {
    writeMeeting(tmpDir, `${DATE}-compliance`, COMPLIANCE);
    const { stdout, code } = runCliRaw(['winddown', 'render', DATE, '--write'], { cwd: tmpDir });
    assert.equal(code, 0, stdout);

    const blPath = join(tmpDir, 'now', 'archive', 'daily-winddown', `winddown-${DATE}.baseline.md`);
    assert.ok(existsSync(blPath), 'baseline file written');
    const baseline = readFileSync(blPath, 'utf8');
    assert.match(baseline, /<!-- ai_001@2026-06-15-compliance -->/);

    // apply diffs the SAVED doc vs this baseline. With the saved doc == baseline
    // (no edits), apply must classify the items without warnings about anchors.
    const archive = join(tmpDir, 'now', 'archive', 'daily-winddown');
    writeFileSync(join(archive, `winddown-${DATE}.md`), baseline, 'utf8');
    const applied = runCliRaw(['winddown', 'apply', DATE, '--dry-run'], { cwd: tmpDir });
    assert.equal(applied.code, 0, applied.stdout);
    assert.match(applied.stdout, /Apply winddown/);
    // no malformed/unknown-anchor warnings — every line maps.
    assert.doesNotMatch(applied.stdout, /malformed line/);
    assert.doesNotMatch(applied.stdout, /unknown anchor/);
  });

  it('--json emits the view + markdown', () => {
    writeMeeting(tmpDir, `${DATE}-compliance`, COMPLIANCE);
    const { stdout, code } = runCliRaw(['winddown', 'render', DATE, '--json'], { cwd: tmpDir });
    assert.equal(code, 0, stdout);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.success, true);
    assert.equal(parsed.view.meetings.length, 1);
    assert.match(parsed.markdown, /## Glance 2\.0 Compliance Workshop/);
  });

  it('only processed/approved meetings are included (draft excluded)', () => {
    writeMeeting(tmpDir, `${DATE}-compliance`, COMPLIANCE);
    writeMeeting(tmpDir, `${DATE}-draft`, DRAFT);
    const { stdout, code } = runCliRaw(['winddown', 'render', DATE, '--json'], { cwd: tmpDir });
    assert.equal(code, 0, stdout);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.view.meetings.length, 1);
    assert.equal(parsed.view.meetings[0].slug, `${DATE}-compliance`);
  });

  it('empty / no-meetings day → empty block, exit 0', () => {
    const { stdout, code } = runCliRaw(['winddown', 'render', DATE, '--json'], { cwd: tmpDir });
    assert.equal(code, 0, stdout);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.view.meetings.length, 0);
    assert.equal(parsed.markdown, '');
  });
});
