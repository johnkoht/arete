/**
 * `june-fixation` — Phase 14 AC3, the settled acceptance fixture.
 *
 * The live case (observed + hand-fixed 2026-06-10): a meeting transcript
 * records the project goal moving to EOY-2026 while the README still says
 * end of June. This test asserts the full DETERMINISTIC SUBSTRATE — the
 * contradiction reaches the agent's context with zero side effects:
 *
 *  (a) the post-README-mtime, area-tagged meeting surfaces in
 *      `whatsNew.meetings`;
 *  (b) its decision text is readable at the surfaced path;
 *  (c) the README's stale goal line is in the brief's project-context
 *      section;
 *  (d) the entire scan performs zero writes (snapshotTree byte-identical
 *      end-to-end; the core-level counting-adapter guarantee for the same
 *      open path is the frozen phase-12 test in
 *      packages/core/test/services/project-area.test.ts — AC4 wall).
 *
 * HONEST VERIFICATION SPLIT (plan AC3): the judgment step — composing
 * "propose the goal-date correction; touch nothing else" from this
 * surfaced contradiction — is LLM-mediated and NOT asserted here. Prose
 * pins it (update-project/SKILL.md, asserted in
 * chef-orchestrator-skills.test.ts); the MC3 post-merge soak verifies it
 * live. This is a SUBSTRATE gate.
 *
 * Day-granularity boundary (review finding 4 / OQ5): the scan compares
 * `m.date > sinceDay` — a meeting on the SAME day the README was last
 * touched is invisible. The fixture controls for this: README mtime is
 * forced 3 days back; the meeting is dated 1 day back (strictly ≥1 day
 * after the README day). The live soak must control for it too.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  utimesSync,
} from 'node:fs';
import { runCli, createTmpDir, cleanupTmpDir } from '../helpers.js';

const ENV = { ARETE_SEARCH_FALLBACK: '1' };

function isoDay(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function snapshotTree(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else out.set(full, readFileSync(full, 'utf8'));
    }
  };
  walk(root);
  return out;
}

describe('integration: june-fixation (Phase 14 AC3 substrate gate)', () => {
  let tmpDir: string;
  const meetingDay = isoDay(1); // strictly ≥1 day after the README day
  const readmeDay = isoDay(3);

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-june-fixation');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);

    // Project README whose Background carries the STALE goal.
    const projectDir = join(tmpDir, 'projects', 'active', 'task-management-v1');
    mkdirSync(projectDir, { recursive: true });
    const readmePath = join(projectDir, 'README.md');
    writeFileSync(
      readmePath,
      `---
title: Task Management v1
area: glance-2-mvp
status: active
---

# Task Management v1

## Background

Replace snapsheet task handling. Goal: complete by end of June 2026.
`,
      'utf8',
    );
    // Force the README mtime 3 days back so the meeting (1 day back) is
    // strictly after it at day granularity.
    const mtime = new Date(`${readmeDay}T10:00:00Z`);
    utimesSync(readmePath, mtime, mtime);

    // Area-tagged meeting whose decision text moves the goal to EOY-2026.
    const meetingsDir = join(tmpDir, 'resources', 'meetings');
    mkdirSync(meetingsDir, { recursive: true });
    writeFileSync(
      join(meetingsDir, `${meetingDay}-glance-weekly.md`),
      `---
title: Glance Weekly
date: ${meetingDay}
area: glance-2-mvp
attendee_ids:
  - john-doe
topics: []
---

# Glance Weekly

## Summary

Reviewed task management timeline.

## Decisions

- The task-management goal moves to EOY-2026 — end of June is not realistic.
`,
      'utf8',
    );
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('june-fixation: the contradiction reaches the agent with zero writes', () => {
    const before = snapshotTree(tmpDir);

    const out = runCli(['project', 'open', 'task-management-v1', '--json'], {
      cwd: tmpDir,
      env: ENV,
    });
    const parsed = JSON.parse(out);
    assert.equal(parsed.success, true);

    // (a) the meeting surfaces in whatsNew.meetings.
    assert.ok(parsed.whatsNew, 'whatsNew present');
    const surfaced = parsed.whatsNew.meetings.find(
      (m: { title: string }) => m.title === 'Glance Weekly',
    );
    assert.ok(
      surfaced,
      `meeting must surface in whatsNew.meetings; got ${JSON.stringify(parsed.whatsNew.meetings)}`,
    );
    assert.equal(surfaced.date, meetingDay);

    // (b) the decision text is readable at the surfaced path.
    const meetingContent = readFileSync(join(tmpDir, surfaced.path), 'utf8');
    assert.match(meetingContent, /goal moves to EOY-2026/);

    // (c) the README's stale goal line is in the brief's project-context
    // section — the contradiction's other half reaches the same context.
    const contextSection = parsed.sections.find(
      (s: { heading: string }) => s.heading === 'Project context',
    );
    assert.ok(contextSection, 'Project context section present');
    assert.match(contextSection.body, /end of June 2026/);

    // (d) zero writes during the entire scan — byte-identical workspace.
    const after = snapshotTree(tmpDir);
    assert.equal(after.size, before.size, 'no files created/deleted');
    for (const [path, content] of before) {
      assert.equal(after.get(path), content, `scan modified ${path}`);
    }
  });

  it('day-granularity boundary control: a SAME-day meeting is excluded (the OQ5 artifact, asserted so soak reads it right)', () => {
    // A second meeting dated the same day as the README mtime.
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', `${readmeDay}-same-day-sync.md`),
      `---
title: Same Day Sync
date: ${readmeDay}
area: glance-2-mvp
attendee_ids: []
topics: []
---

# Same Day Sync

Same-day content the day-granularity scan cannot see.
`,
      'utf8',
    );
    const out = runCli(['project', 'open', 'task-management-v1', '--json'], {
      cwd: tmpDir,
      env: ENV,
    });
    const parsed = JSON.parse(out);
    const titles = parsed.whatsNew.meetings.map((m: { title: string }) => m.title);
    assert.ok(titles.includes('Glance Weekly'));
    assert.ok(
      !titles.includes('Same Day Sync'),
      'same-day meeting is excluded at day granularity — a live "nothing new" on a busy day is an mtime artifact, not over-conservatism',
    );
  });
});
