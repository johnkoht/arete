/**
 * Phase 13 AC2/AC3 — meeting-area backfill helpers.
 *
 * Real fs + StorageAdapter (no mocks for memory/storage ops — services
 * LEARNINGS). Unique temp dirs per run (pid + Date.now()).
 *
 * Zero-write assertions use BOTH layers where applicable (phase-12
 * pattern): a counting FileStorageAdapter subclass AND byte-snapshot
 * equality. Note `writeWithLock` writes via OS tmp+rename for real
 * filesystems, so the byte-snapshot + `written:false` result is the
 * load-bearing half; the counting adapter covers the storage-write
 * fallback path.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import {
  listMeetingsForBackfill,
  qualifyMeetingAreaMatch,
  applyAreaToMeeting,
  resetBackfilledMeetingAreas,
} from '../../src/services/meeting-area.js';
import type { AreaMatch } from '../../src/models/entities.js';
import type { WorkspacePaths } from '../../src/models/index.js';

function makePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, 'arete.yaml'),
    ideConfig: join(root, '.cursor'),
    rules: join(root, '.cursor', 'rules'),
    agentSkills: join(root, '.agents', 'skills'),
    managedSkills: join(root, '.arete', 'skills'),
    tools: join(root, '.cursor', 'tools'),
    integrations: join(root, '.cursor', 'integrations'),
    context: join(root, 'context'),
    memory: join(root, '.arete', 'memory'),
    now: join(root, 'now'),
    goals: join(root, 'goals'),
    projects: join(root, 'projects'),
    resources: join(root, 'resources'),
    people: join(root, 'people'),
    credentials: join(root, '.credentials'),
    templates: join(root, 'templates'),
  };
}

function writeMeeting(root: string, name: string, content: string): string {
  const dir = join(root, 'resources', 'meetings');
  mkdirSync(dir, { recursive: true });
  const p = join(dir, name);
  writeFileSync(p, content, 'utf8');
  return p;
}

/** Counting adapter — covers the storage.write fallback path. */
class CountingStorageAdapter extends FileStorageAdapter {
  writes = 0;
  appends = 0;
  deletes = 0;
  override async write(path: string, content: string): Promise<void> {
    this.writes += 1;
    return super.write(path, content);
  }
  override async append(path: string, content: string): Promise<void> {
    this.appends += 1;
    return super.append(path, content);
  }
  override async delete(path: string): Promise<void> {
    this.deletes += 1;
    return super.delete(path);
  }
}

function snapshotDir(dir: string): Map<string, string> {
  const snap = new Map<string, string>();
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isFile()) snap.set(f, readFileSync(p, 'utf8'));
  }
  return snap;
}

const MEETING_WITH_AREA = `---
title: Legacy carrier
date: 2026-04-28T16:00:00.000Z
area: glance-communications
topics:
  - glance-communications
---

## Summary

Legacy capture-flow meeting.
`;

const MEETING_JUNE_STYLE = `---
title: June style meeting
date: 2026-06-05T16:00:00.000Z
summary: Weekly working session
topics:
  - glance-2-mvp
  - rollout-strategy
attendees:
  - name: John Koht
    email: ''
approved_items:
  actionItems:
    - Do the thing (@john → @anthony)
---

## Summary

Discussed rollout.

## Transcript

Long transcript text here.
`;

const MEETING_OLD_NO_TOPICS = `---
title: Old meeting
date: 2026-03-01T10:00:00.000Z
---

## Summary

Ancient history.
`;

describe('meeting-area (Phase 13 AC2/AC3)', () => {
  let tmpRoot: string;
  let paths: WorkspacePaths;
  let storage: FileStorageAdapter;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), `meeting-area-${process.pid}-${Date.now()}-`));
    paths = makePaths(tmpRoot);
    storage = new FileStorageAdapter();
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe('listMeetingsForBackfill', () => {
    it('skips meetings WITH area: (legacy carriers are never candidates) and index.md', async () => {
      writeMeeting(tmpRoot, '2026-04-28-legacy.md', MEETING_WITH_AREA);
      writeMeeting(tmpRoot, '2026-06-05-june.md', MEETING_JUNE_STYLE);
      writeMeeting(tmpRoot, 'index.md', '# Index\n');

      const candidates = await listMeetingsForBackfill(storage, paths);
      assert.deepEqual(candidates.map((c) => c.file), ['2026-06-05-june.md']);
    });

    it('assembles inference inputs: title, summary, body; topics + alsoMatchesViaTopics (D2)', async () => {
      writeMeeting(tmpRoot, '2026-06-05-june.md', MEETING_JUNE_STYLE);
      const [c] = await listMeetingsForBackfill(storage, paths, {
        areaSlugs: ['glance-2-mvp', 'glance-communications', 'pm-operations'],
      });
      assert.equal(c.title, 'June style meeting');
      assert.equal(c.summary, 'Weekly working session');
      assert.ok(c.body.includes('Long transcript text here.'));
      assert.deepEqual(c.topics, ['glance-2-mvp', 'rollout-strategy']);
      assert.deepEqual(c.alsoMatchesViaTopics, ['glance-2-mvp']);
      assert.equal(c.date, '2026-06-05');
    });

    it('sinceDay limiter skips older meetings, keeps undated ones', async () => {
      writeMeeting(tmpRoot, '2026-03-01-old.md', MEETING_OLD_NO_TOPICS);
      writeMeeting(tmpRoot, '2026-06-05-june.md', MEETING_JUNE_STYLE);
      writeMeeting(tmpRoot, 'undated.md', '---\ntitle: Undated\n---\n\n## Summary\n\nNo date.\n');

      const candidates = await listMeetingsForBackfill(storage, paths, { sinceDay: '2026-06-01' });
      assert.deepEqual(
        candidates.map((c) => c.file).sort(),
        ['2026-06-05-june.md', 'undated.md'],
      );
    });
  });

  describe('qualifyMeetingAreaMatch (pre-mortem D1 policy)', () => {
    const m = (over: Partial<AreaMatch>): AreaMatch => ({
      areaSlug: 'glance-2-mvp',
      matchType: 'inferred',
      confidence: 0.8,
      ...over,
    });

    it('below the floor → unqualified', () => {
      const q = qualifyMeetingAreaMatch(m({ confidence: 0.6, signal: 'keyword' }));
      assert.deepEqual(q, { qualified: false, nameOnly: false, reason: 'below-floor' });
    });

    it('uncorroborated summary-only name match → unqualified (summary-name-only)', () => {
      const q = qualifyMeetingAreaMatch(m({ signal: 'area-name-summary', corroborated: false }));
      assert.deepEqual(q, { qualified: false, nameOnly: true, reason: 'summary-name-only' });
    });

    it('uncorroborated title name match → qualified but flagged nameOnly', () => {
      const q = qualifyMeetingAreaMatch(m({ signal: 'area-name-title', corroborated: false }));
      assert.deepEqual(q, { qualified: true, nameOnly: true, reason: 'title-name-only' });
    });

    it('corroborated name matches and recurring titles → qualified, unflagged', () => {
      assert.deepEqual(
        qualifyMeetingAreaMatch(m({ signal: 'area-name-title', corroborated: true })),
        { qualified: true, nameOnly: false },
      );
      assert.deepEqual(
        qualifyMeetingAreaMatch(m({ signal: 'area-name-summary', corroborated: true })),
        { qualified: true, nameOnly: false },
      );
      assert.deepEqual(
        qualifyMeetingAreaMatch(
          m({ signal: 'recurring-title', matchType: 'recurring', confidence: 1.0 }),
        ),
        { qualified: true, nameOnly: false },
      );
    });
  });

  describe('applyAreaToMeeting', () => {
    it('writes area + provenance, preserves body bytes and nested frontmatter (incl. approved_items)', async () => {
      const p = writeMeeting(tmpRoot, '2026-06-05-june.md', MEETING_JUNE_STYLE);
      const bodyBefore = readFileSync(p, 'utf8').split(/\n---\n/)[1];

      const res = await applyAreaToMeeting(storage, p, 'glance-2-mvp', 'backfill');
      assert.equal(res.written, true);
      assert.equal(res.noop, false);

      const after = readFileSync(p, 'utf8');
      assert.match(after, /^area: glance-2-mvp$/m);
      assert.match(after, /^area_set_by: backfill$/m);
      // Body byte-preserved (writeWithLock keeps current body verbatim,
      // modulo the canonical single blank line after the closing ---).
      const bodyAfter = after.split(/\n---\n/)[1];
      assert.equal(bodyAfter.replace(/^\n+/, ''), bodyBefore.replace(/^\n+/, ''));
      // Nested frontmatter survives the yaml round-trip.
      assert.match(after, /approved_items:/);
      assert.match(after, /actionItems:/);
      assert.match(after, /name: John Koht/);
      assert.match(after, /topics:/);
    });

    it('D4 regression: succeeds on a file written milliseconds earlier (no mtime-guard swallow)', async () => {
      const p = writeMeeting(tmpRoot, '2026-06-09-fresh.md', MEETING_JUNE_STYLE);
      // File mtime is "now" — the default 60s guard would abstain here.
      const res = await applyAreaToMeeting(storage, p, 'glance-2-mvp', 'approval');
      assert.equal(res.written, true, `expected write, got abstain: ${res.abstainReason}`);
      assert.match(readFileSync(p, 'utf8'), /area_set_by: approval/);
    });

    it('same-values rerun → zero write calls AND byte-identical file (review finding 2)', async () => {
      const p = writeMeeting(tmpRoot, '2026-06-05-june.md', MEETING_JUNE_STYLE);
      const first = await applyAreaToMeeting(storage, p, 'glance-2-mvp', 'backfill');
      assert.equal(first.written, true);

      const meetingsDir = join(tmpRoot, 'resources', 'meetings');
      const snapBefore = snapshotDir(meetingsDir);
      const counting = new CountingStorageAdapter();

      const second = await applyAreaToMeeting(counting, p, 'glance-2-mvp', 'backfill');
      assert.equal(second.written, false);
      assert.equal(second.noop, true);
      assert.equal(second.abstainReason, undefined);
      assert.equal(counting.writes, 0, 'no storage.write calls');
      assert.equal(counting.appends, 0);
      assert.equal(counting.deletes, 0);
      assert.deepEqual(snapshotDir(meetingsDir), snapBefore, 'meetings dir byte-identical');
    });

    it('different provenance for same area IS a write (approval → backfill re-stamp)', async () => {
      const p = writeMeeting(tmpRoot, '2026-06-05-june.md', MEETING_JUNE_STYLE);
      await applyAreaToMeeting(storage, p, 'glance-2-mvp', 'approval');
      const res = await applyAreaToMeeting(storage, p, 'glance-2-mvp', 'manual');
      assert.equal(res.written, true);
      assert.match(readFileSync(p, 'utf8'), /area_set_by: manual/);
    });
  });

  describe('resetBackfilledMeetingAreas', () => {
    it('clears ONLY backfill-stamped areas; approval/manual/absent provenance untouched', async () => {
      const backfilled = writeMeeting(tmpRoot, '2026-06-01-backfilled.md', MEETING_JUNE_STYLE);
      await applyAreaToMeeting(storage, backfilled, 'glance-2-mvp', 'backfill');
      const approved = writeMeeting(tmpRoot, '2026-06-02-approved.md', MEETING_JUNE_STYLE);
      await applyAreaToMeeting(storage, approved, 'glance-2-mvp', 'approval');
      // Legacy carrier: area present, NO area_set_by at all (D6).
      writeMeeting(tmpRoot, '2026-04-28-legacy.md', MEETING_WITH_AREA);

      const { reset } = await resetBackfilledMeetingAreas(storage, paths);
      assert.deepEqual(reset, ['2026-06-01-backfilled.md']);

      const backfilledAfter = readFileSync(backfilled, 'utf8');
      assert.ok(!/^area:/m.test(backfilledAfter), 'backfilled area cleared');
      assert.ok(!/area_set_by/.test(backfilledAfter), 'backfilled provenance cleared');
      assert.match(readFileSync(approved, 'utf8'), /area_set_by: approval/);
      assert.match(
        readFileSync(join(tmpRoot, 'resources', 'meetings', '2026-04-28-legacy.md'), 'utf8'),
        /^area: glance-communications$/m,
      );
    });

    it('is a no-op on a workspace with nothing backfilled', async () => {
      writeMeeting(tmpRoot, '2026-06-05-june.md', MEETING_JUNE_STYLE);
      const { reset } = await resetBackfilledMeetingAreas(storage, paths);
      assert.deepEqual(reset, []);
    });
  });
});
