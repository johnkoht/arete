/**
 * `arete meeting backfill-area` (Phase 13 AC3) + `arete meeting set-area`
 * (Phase 13 AC2) — CLI behavior tests.
 *
 * Uses runCli subprocess helper + real temp workspaces (arete install).
 * ARETE_SEARCH_FALLBACK is set by the test env so qmd is never touched.
 * Pattern: cli/test/commands/project.test.ts.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

function seedArea(root: string, slug: string, name: string, focus?: string): void {
  const dir = join(root, 'areas');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${slug}.md`),
    `---
area: ${name}
status: active
recurring_meetings:
  - title: "${name} Weekly"
    attendees: []
    frequency: weekly
---

# ${name}

## Focus
${focus ?? `${name} delivery work.`}
`,
    'utf8',
  );
}

function seedMeeting(root: string, name: string, content: string): string {
  const dir = join(root, 'resources', 'meetings');
  mkdirSync(dir, { recursive: true });
  const p = join(dir, name);
  writeFileSync(p, content, 'utf8');
  return p;
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

const RECURRING_MEETING = `---
title: Glance Comms Weekly
date: 2026-06-08T16:00:00.000Z
topics:
  - rollout-strategy
---

## Summary

Weekly sync.
`;

const NAME_ONLY_MEETING = `---
title: Glance Comms brainstorm
date: 2026-06-05T16:00:00.000Z
---

## Summary

Unrelated content with no comms keywords at all.
`;

const SUMMARY_ONLY_MEETING = `---
title: Cross-team planning
date: 2026-06-04T16:00:00.000Z
summary: We briefly touched on Glance Comms among other things
---

## Summary

Mostly other work.
`;

const UNMATCHED_MEETING = `---
title: Zebra logistics
date: 2026-06-03T16:00:00.000Z
---

## Summary

Nothing matching any area.
`;

const ALREADY_AREA_MEETING = `---
title: Legacy carrier
date: 2026-04-28T16:00:00.000Z
area: glance-comms
---

## Summary

Already has an area.
`;

describe('arete meeting backfill-area (Phase 13 AC3)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-meeting-backfill');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    seedArea(tmpDir, 'glance-comms', 'Glance Comms');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('preview (default): proposes + flags per signal policy, leaves workspace byte-identical (snapshotTree)', () => {
    seedMeeting(tmpDir, '2026-06-08-weekly.md', RECURRING_MEETING);
    seedMeeting(tmpDir, '2026-06-05-name-only.md', NAME_ONLY_MEETING);
    seedMeeting(tmpDir, '2026-06-04-summary-only.md', SUMMARY_ONLY_MEETING);
    seedMeeting(tmpDir, '2026-06-03-zebra.md', UNMATCHED_MEETING);
    seedMeeting(tmpDir, '2026-04-28-legacy.md', ALREADY_AREA_MEETING);

    const before = snapshotTree(tmpDir);
    const out = JSON.parse(runCli(['meeting', 'backfill-area', '--json'], { cwd: tmpDir }));

    assert.equal(out.success, true);
    assert.equal(out.applied, false);
    assert.equal(out.candidates, 4, 'legacy area-carrier is not a candidate');
    assert.equal(out.matched, 2);

    const recurring = out.proposals.find(
      (p: { file: string }) => p.file === '2026-06-08-weekly.md',
    );
    assert.ok(recurring);
    assert.equal(recurring.area, 'glance-comms');
    assert.equal(recurring.signal, 'recurring-title');
    assert.equal(recurring.nameOnly, false);

    const nameOnly = out.proposals.find(
      (p: { file: string }) => p.file === '2026-06-05-name-only.md',
    );
    assert.ok(nameOnly);
    assert.equal(nameOnly.signal, 'area-name-title');
    assert.equal(nameOnly.nameOnly, true, 'uncorroborated title name match flagged');
    assert.equal(out.nameOnly, 1);
    // name-only rows grouped last (D1 spot-check ordering).
    assert.equal(out.proposals[out.proposals.length - 1].file, '2026-06-05-name-only.md');

    // Summary-only name match REFUSED (D1); zebra has no match at all.
    const unmatchedFiles = out.unmatched.map((u: { file: string }) => u.file).sort();
    assert.deepEqual(unmatchedFiles, ['2026-06-03-zebra.md', '2026-06-04-summary-only.md']);
    const summaryOnly = out.unmatched.find(
      (u: { file: string }) => u.file === '2026-06-04-summary-only.md',
    );
    assert.equal(summaryOnly.reason, 'summary-name-only');

    // Pure read: whole workspace byte-identical.
    assert.deepEqual(snapshotTree(tmpDir), before);
  });

  it('--apply writes area + backfill provenance; rerun is a true no-op; --reset restores', () => {
    const weekly = seedMeeting(tmpDir, '2026-06-08-weekly.md', RECURRING_MEETING);
    seedMeeting(tmpDir, '2026-06-03-zebra.md', UNMATCHED_MEETING);

    const out = JSON.parse(
      runCli(['meeting', 'backfill-area', '--apply', '--skip-qmd', '--json'], { cwd: tmpDir }),
    );
    assert.equal(out.applied, true);
    assert.equal(out.matched, 1);
    assert.deepEqual(out.unwritten, [], 'no lock abstains (D4 guard disabled)');

    const applied = readFileSync(weekly, 'utf8');
    assert.match(applied, /^area: glance-comms$/m);
    assert.match(applied, /^area_set_by: backfill$/m);
    assert.match(applied, /Weekly sync\./, 'body preserved');
    assert.ok(
      !/area:/.test(readFileSync(join(tmpDir, 'resources', 'meetings', '2026-06-03-zebra.md'), 'utf8')),
      'unmatched meeting untouched',
    );

    // Rerun with same state: the applied meeting is no longer a candidate.
    const snapBefore = snapshotTree(tmpDir);
    const rerun = JSON.parse(
      runCli(['meeting', 'backfill-area', '--apply', '--skip-qmd', '--json'], { cwd: tmpDir }),
    );
    assert.equal(rerun.matched, 0);
    assert.deepEqual(snapshotTree(tmpDir), snapBefore, 'rerun apply writes nothing');

    // --reset clears only the backfill-stamped meeting.
    const reset = JSON.parse(
      runCli(['meeting', 'backfill-area', '--reset', '--json'], { cwd: tmpDir }),
    );
    assert.deepEqual(reset.reset, ['2026-06-08-weekly.md']);
    const restored = readFileSync(weekly, 'utf8');
    assert.ok(!/^area:/m.test(restored));
    assert.ok(!/area_set_by/.test(restored));
  });

  it('--days limits candidates to recent meetings', () => {
    const old = `---\ntitle: Old meeting\ndate: 2020-01-01T10:00:00.000Z\n---\n\n## Summary\n\nOld.\n`;
    seedMeeting(tmpDir, '2020-01-01-old.md', old);
    seedMeeting(tmpDir, '2026-06-08-weekly.md', RECURRING_MEETING.replace('2026-06-08', new Date().toISOString().slice(0, 10)));

    const all = JSON.parse(runCli(['meeting', 'backfill-area', '--json'], { cwd: tmpDir }));
    assert.equal(all.candidates, 2);

    const recent = JSON.parse(
      runCli(['meeting', 'backfill-area', '--days', '30', '--json'], { cwd: tmpDir }),
    );
    assert.equal(recent.candidates, 1);

    const { stdout, code } = runCliRaw(['meeting', 'backfill-area', '--days', 'nope', '--json'], {
      cwd: tmpDir,
    });
    assert.equal(code, 1);
    assert.equal(JSON.parse(stdout).success, false);
  });

  it('--json error path outside a workspace', () => {
    const bare = createTmpDir('arete-test-meeting-backfill-nows');
    try {
      const { stdout, code } = runCliRaw(['meeting', 'backfill-area', '--json'], { cwd: bare });
      assert.equal(code, 1);
      const parsed = JSON.parse(stdout);
      assert.equal(parsed.success, false);
      assert.ok(/workspace/i.test(parsed.error));
    } finally {
      cleanupTmpDir(bare);
    }
  });
});
