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
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
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

// ---------------------------------------------------------------------------
// Theme-render W3 — flag-gated theme grouping
// ---------------------------------------------------------------------------

const THEME_DATE = '2026-06-18';

/** A meeting whose dominant `topics:` entry is an active project slug. */
const STATUS_LETTER = `---
title: Anthony spec-sync
date: ${THEME_DATE}T15:00:00.000Z
status: processed
topics:
  - status-letter-automation
staged_item_elevated:
  de_004: true
  ai_005: true
---

## Staged Action Items
- ai_005: Draft the join-table migration

## Staged Decisions
- de_004: Status letters use a join table for recipients
`;

/** A meeting with NO matching topic → routes to Uncategorized. */
const ORPHAN = `---
title: Random tangent
date: ${THEME_DATE}T16:00:00.000Z
status: processed
staged_item_elevated:
  ai_009: true
---

## Staged Action Items
- ai_009: Explore a shared comms calendar
`;

/**
 * PRODUCTION ROUND-TRIP fixture (Gate 4). The morning Jamie 1:1 carries a
 * SUPERSEDED decision in REAL frontmatter — a full `staged_item_skip_reason`
 * entry with `kind: superseded` + `matchedRef` (the afternoon decision it lost
 * to). The whole 1:1 is assigned to `status-letter-automation` via `topics:`.
 * This proves the LIVE parse path (`buildChecklistMeeting` → `skipKind`) +
 * CLI dispatch + spine resolution + theme render emit the arc — the seam the
 * golden test (which feeds metas directly) cannot cover.
 */
const JAMIE_MORNING = `---
title: Jamie 1:1
date: ${THEME_DATE}T09:30:00.000Z
status: processed
topics:
  - status-letter-automation
staged_item_skip_reason:
  de_001:
    reason: superseded by the 15:00 Anthony spec-sync (join table, multiple recipients)
    evidence: afternoon spec-sync reversed the single-recipient model
    setBy: chef
    setAt: ${THEME_DATE}T15:30:00.000Z
    kind: superseded
    matchedRef: de_004@2026-06-18-status
---

## Staged Decisions
- de_001: Single recipient per status letter (recipient FK on the letter row)
`;

function setThemeMode(dir: string): void {
  // Flip the workspace flag + materialize the active project the topic resolves to.
  appendFileSync(join(dir, 'arete.yaml'), '\nwinddown_render: theme\n', 'utf8');
  mkdirSync(join(dir, 'projects', 'active', 'status-letter-automation'), { recursive: true });
}

describe('arete winddown render — theme mode (W3)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-winddown-theme');
    runCliRaw(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor'], { cwd: process.cwd() });
  });

  afterEach(() => cleanupTmpDir(tmpDir));

  it('AC7 — checklist/default mode is byte-for-byte the staged block (theme NOT triggered)', () => {
    writeMeeting(tmpDir, `${THEME_DATE}-status`, STATUS_LETTER);
    // No flag flip → default. Render must be the per-meeting staged block, NOT theme.
    const { stdout, code } = runCliRaw(['winddown', 'render', THEME_DATE], { cwd: tmpDir });
    assert.equal(code, 0, stdout);
    assert.match(stdout, /## Anthony spec-sync/); // meeting heading (checklist grouping)
    assert.doesNotMatch(stdout, /theme view/);
    assert.doesNotMatch(stdout, /## ⚠ Uncategorized/);
    assert.doesNotMatch(stdout, /## 📋|## status-letter-automation/);
  });

  it('theme mode groups under the project heading, NOT the meeting title', () => {
    writeMeeting(tmpDir, `${THEME_DATE}-status`, STATUS_LETTER);
    setThemeMode(tmpDir);
    const { stdout, code } = runCliRaw(['winddown', 'render', THEME_DATE], { cwd: tmpDir });
    assert.equal(code, 0, stdout);
    assert.match(stdout, /theme view/);
    assert.match(stdout, /## .*status-letter-automation/);
    assert.doesNotMatch(stdout, /## Anthony spec-sync/);
    // anchors byte-identical → recoverable + apply-compatible
    assert.match(stdout, /<!-- de_004@2026-06-18-status -->/);
    assert.match(stdout, /<!-- ai_005@2026-06-18-status -->/);
    // always-present Uncategorized affordance
    assert.match(stdout, /## ⚠ Uncategorized/);
  });

  it('theme mode routes an unassigned meeting into Uncategorized (count-conserved)', () => {
    writeMeeting(tmpDir, `${THEME_DATE}-status`, STATUS_LETTER);
    writeMeeting(tmpDir, `${THEME_DATE}-orphan`, ORPHAN);
    setThemeMode(tmpDir);
    const { stdout, code } = runCliRaw(['winddown', 'render', THEME_DATE], { cwd: tmpDir });
    assert.equal(code, 0, stdout);
    // all three items present exactly once
    const anchors = [...stdout.matchAll(/<!--\s*((?:ai|de|le)_\d+)@([a-z0-9][a-z0-9._-]*)\s*-->/g)].map(
      (m) => `${m[1]}@${m[2]}`,
    );
    assert.deepEqual(
      [...anchors].sort(),
      ['ai_005@2026-06-18-status', 'ai_009@2026-06-18-orphan', 'de_004@2026-06-18-status'].sort(),
    );
    // orphan lands under Uncategorized
    const uncatIdx = stdout.indexOf('## ⚠ Uncategorized');
    assert.ok(stdout.indexOf('<!-- ai_009@2026-06-18-orphan -->') > uncatIdx);
  });

  it('PRODUCTION round-trip: a real-file superseded skip-reason renders the arc under the project heading', () => {
    // Morning decision superseded by afternoon, both real files assigned to the
    // same project via topics:. The morning meeting carries a full
    // staged_item_skip_reason{kind:superseded,matchedRef} in REAL frontmatter.
    writeMeeting(tmpDir, `${THEME_DATE}-jamie`, JAMIE_MORNING);
    writeMeeting(tmpDir, `${THEME_DATE}-status`, STATUS_LETTER);
    setThemeMode(tmpDir);

    const { stdout, code } = runCliRaw(['winddown', 'render', THEME_DATE], { cwd: tmpDir });
    assert.equal(code, 0, stdout);

    // Grouped under the project heading (theme mode), not the meeting title.
    assert.match(stdout, /## .*status-letter-automation/);
    assert.doesNotMatch(stdout, /## Jamie 1:1/);
    assert.doesNotMatch(stdout, /## Anthony spec-sync/);

    // THE ARC: the morning decision must render superseded — struck through,
    // [ ] (never elevated), with the verbatim arc reason + the linked
    // superseding target, and its anchor retained for re-elevation rescue (AC5).
    // This entire line is produced from the REAL parsed file (skipKind populated
    // by buildChecklistMeeting → parseStagedItemSkipReason), proving the live
    // seam, not a stubbed meta.
    const supersededLine = stdout
      .split('\n')
      .find((l) => l.includes('de_001@2026-06-18-jamie'));
    assert.ok(supersededLine, 'superseded morning decision line present');
    assert.match(supersededLine!, /^- \[ \]/, 'superseded item is [ ] (never elevated)');
    assert.match(supersededLine!, /~~Single recipient per status letter[^~]*~~/, 'text struck through');
    assert.match(
      supersededLine!,
      /superseded by the 15:00 Anthony spec-sync/,
      'verbatim arc reason inline',
    );
    assert.match(
      supersededLine!,
      /\[\[de_004@2026-06-18-status\]\]/,
      'superseding target linked (matchedRef from real file)',
    );

    // The afternoon (latest) decision is the elevated one. Match the line
    // carrying its ANCHOR (not the morning line, which references de_004 in its
    // [[matchedRef]] link).
    const afternoonLine = stdout
      .split('\n')
      .find((l) => l.includes('<!-- de_004@2026-06-18-status -->'));
    assert.ok(afternoonLine, 'afternoon decision present');
    assert.match(afternoonLine!, /^- \[x\]/, 'afternoon decision elevated [x]');

    // Count conservation: both decisions present exactly once.
    assert.equal(
      [...stdout.matchAll(/<!-- de_001@2026-06-18-jamie -->/g)].length,
      1,
      'morning decision rendered exactly once',
    );
  });

  it('theme doc round-trips through apply with no anchor warnings (AC6)', () => {
    writeMeeting(tmpDir, `${THEME_DATE}-status`, STATUS_LETTER);
    setThemeMode(tmpDir);
    const { stdout: doc, code } = runCliRaw(['winddown', 'render', THEME_DATE], { cwd: tmpDir });
    assert.equal(code, 0, doc);

    const archive = join(tmpDir, 'now', 'archive', 'daily-winddown');
    mkdirSync(archive, { recursive: true });
    // baseline == edited == the theme doc (D4: same grouping both sides)
    writeFileSync(join(archive, `winddown-${THEME_DATE}.baseline.md`), doc, 'utf8');
    writeFileSync(join(archive, `winddown-${THEME_DATE}.md`), doc, 'utf8');
    const applied = runCliRaw(['winddown', 'apply', THEME_DATE, '--dry-run'], { cwd: tmpDir });
    assert.equal(applied.code, 0, applied.stdout);
    assert.match(applied.stdout, /Apply winddown/);
    assert.doesNotMatch(applied.stdout, /malformed line/);
    assert.doesNotMatch(applied.stdout, /unknown anchor/);
  });
});
