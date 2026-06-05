/**
 * End-to-end integration test for phase-10-followup-2 chef-skip flow.
 *
 * Walks the full data path:
 *   1. Chef writes a structural skip via writeWithLock (post-week-1 path,
 *      setBy='chef', status='skipped', skip_reason populated).
 *   2. (Optionally) user issues [[unskip]] in winddown view; the parser +
 *      resolver flips it back via writeWithLock with explicit undefined
 *      for skip_reason.
 *   3. User runs `apply` (commitApprovedItems).
 *   4. Assertions:
 *      - Committed items' sibling fields are gone (legacy cleanup shape).
 *      - Non-committed items (pending/skipped/unsked) survive in
 *        frontmatter for next-round review (F5 fix).
 *      - APPLY-SKIP onSkipped observer fires for items dropped on apply.
 *
 * Uses real fs (proper-lockfile needs it). No LLM calls. No production
 * data writes.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { writeWithLock } from '../../src/services/meeting-lock.js';
import { commitApprovedItems } from '../../src/integrations/staged-items.js';
import {
  parseChefSkipDirectives,
  resolveChefSkipDirective,
} from '../../src/services/chef-skip-directives.js';
import { appendChefSkipLog } from '../../src/services/chef-skip-log.js';
import { FileStorageAdapter } from '../../src/storage/file.js';
import type {
  StagedItemSkipReason,
  StagedItemSkipReasonMeta,
  StagedItemStatus,
} from '../../src/models/index.js';

// ---------------------------------------------------------------------------
// Test setup helpers
// ---------------------------------------------------------------------------

function makeMeetingContent(opts: {
  title: string;
  date: string;
  status: StagedItemStatus;
  skipReason?: StagedItemSkipReason;
  items: Array<{ id: string; text: string }>;
}): string {
  const statusLines = Object.entries(opts.status)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n');
  let skipReasonBlock = '';
  if (opts.skipReason && Object.keys(opts.skipReason).length > 0) {
    skipReasonBlock = '\nstaged_item_skip_reason:\n';
    for (const [id, meta] of Object.entries(opts.skipReason)) {
      skipReasonBlock +=
        `  ${id}:\n` +
        `    reason: ${JSON.stringify(meta.reason)}\n` +
        `    evidence: ${JSON.stringify(meta.evidence)}\n` +
        `    setBy: ${meta.setBy}\n` +
        `    setAt: ${meta.setAt}\n`;
    }
    skipReasonBlock = skipReasonBlock.replace(/\n$/, '');
  }
  const items = opts.items.map((i) => `- ${i.id}: ${i.text}`).join('\n');
  return `---
title: ${JSON.stringify(opts.title)}
date: ${JSON.stringify(opts.date)}
status: synced
attendees:
  - name: John Koht
  - name: Jamie Burk
staged_item_status:
${statusLines}${skipReasonBlock}
---

## Staged Action Items
${items}

## Transcript
Full transcript here.
`;
}

function backdateMtime(filePath: string): void {
  const longAgo = new Date(Date.now() - 5 * 60 * 1000);
  utimesSync(filePath, longAgo, longAgo);
}

function readFrontmatter(filePath: string): Record<string, unknown> {
  const raw = readFileSync(filePath, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  return (parseYaml(m[1]) ?? {}) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Chef-skip end-to-end flow (phase-10-followup-2 Step 7)', () => {
  let workspaceRoot: string;
  let meetingsDir: string;
  let memoryDir: string;
  let meetingPath: string;
  const storage = new FileStorageAdapter();

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'arete-chef-skip-e2e-'));
    meetingsDir = join(workspaceRoot, 'resources', 'meetings');
    memoryDir = join(workspaceRoot, '.arete', 'memory', 'items');
    mkdirSync(meetingsDir, { recursive: true });
    mkdirSync(memoryDir, { recursive: true });
    meetingPath = join(meetingsDir, 'john-jamie-2026-06-04.md');
  });

  afterEach(() => {
    if (workspaceRoot && existsSync(workspaceRoot)) {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('Flow A — post-week-1: chef writes skip → user approves others → apply drops skip + cleans', async () => {
    // Seed: meeting with two staged items, ai_0042 (to be chef-skipped)
    // and ai_0043 (to be user-approved).
    writeFileSync(
      meetingPath,
      makeMeetingContent({
        title: 'John ↔ Jamie 2026-06-04',
        date: '2026-06-04',
        status: { ai_0042: 'pending', ai_0043: 'pending' },
        items: [
          { id: 'ai_0042', text: 'Share the Notion claim-review-process doc with Jamie' },
          { id: 'ai_0043', text: 'Schedule follow-up next week' },
        ],
      }),
      'utf8',
    );
    backdateMtime(meetingPath);

    // STEP 1 — Chef writes the skip (post-week-1 setBy='chef').
    const result = await writeWithLock(
      storage,
      meetingPath,
      async (current) => {
        const status = {
          ...(current.frontmatter['staged_item_status'] as StagedItemStatus),
          ai_0042: 'skipped' as const,
        };
        const skipReason: StagedItemSkipReason = {
          ...((current.frontmatter['staged_item_skip_reason'] as StagedItemSkipReason) ?? {}),
          ai_0042: {
            reason: 'already fulfilled via slack-dm',
            evidence: 'Slack DM → Jamie Burk, 2026-06-04',
            setBy: 'chef',
            setAt: '2026-06-04T18:42:11Z',
          },
        };
        return { frontmatter: { staged_item_status: status, staged_item_skip_reason: skipReason } };
      },
      { mtimeGuardSeconds: 0 },
    );
    assert.equal(result.written, true);

    // User approves ai_0043 (simulate the staging UI doing the write).
    backdateMtime(meetingPath);
    await writeWithLock(
      storage,
      meetingPath,
      async (current) => ({
        frontmatter: {
          staged_item_status: {
            ...(current.frontmatter['staged_item_status'] as StagedItemStatus),
            ai_0043: 'approved' as const,
          },
        },
      }),
      { mtimeGuardSeconds: 0 },
    );

    // STEP 2 — Apply (commitApprovedItems).
    const skippedObserved: string[] = [];
    await commitApprovedItems(storage, meetingPath, memoryDir, {
      onSkipped: async (rec) => {
        await appendChefSkipLog(workspaceRoot, {
          action: 'APPLY-SKIP',
          id: rec.id,
          meeting: 'john-jamie-2026-06-04',
          ...(rec.reason !== null ? { reason: rec.reason } : {}),
          ...(rec.setBy !== null ? { setBy: rec.setBy } : {}),
        });
        skippedObserved.push(rec.id);
      },
    });

    // ASSERTIONS
    const fm = readFrontmatter(meetingPath);
    const body = readFileSync(meetingPath, 'utf8');

    // ai_0043 was approved → sibling-field entries removed.
    // ai_0042 was skipped → its sibling-field entries survive the F5 filter.
    const status = fm['staged_item_status'] as Record<string, string> | undefined;
    assert.ok(status, 'staged_item_status survives because ai_0042 still in non-approved state');
    assert.equal(status!['ai_0042'], 'skipped', 'skipped entry survives F5 filter');
    assert.ok(!('ai_0043' in status!), 'approved ai_0043 cleaned from frontmatter');

    const skipReason = fm['staged_item_skip_reason'] as Record<string, Record<string, unknown>> | undefined;
    assert.ok(skipReason, 'skip_reason map survives');
    assert.ok(skipReason!['ai_0042'], 'chef skip_reason for ai_0042 preserved');
    assert.equal(skipReason!['ai_0042']['setBy'], 'chef');

    // Body contains the Approved Action Items section with ai_0043 only.
    assert.match(body, /## Approved Action Items/);
    assert.match(body, /Schedule follow-up next week/);
    // ai_0042 appears under "## Skipped on Apply", not under Approved.
    const approvedSec = body.match(/## Approved Action Items\n([\s\S]*?)(?=\n## |$)/)?.[1] ?? '';
    assert.doesNotMatch(approvedSec, /Share the Notion/);
    assert.match(body, /## Skipped on Apply/);
    assert.match(body, /\[ai_0042\] Share the Notion/);
    assert.match(body, /already fulfilled via slack-dm/);

    // APPLY-SKIP audit log fired for ai_0042.
    assert.deepEqual(skippedObserved, ['ai_0042']);
    const logPath = join(workspaceRoot, 'dev', 'diary', 'chef-skip-log.md');
    assert.ok(existsSync(logPath));
    const logRaw = readFileSync(logPath, 'utf8');
    assert.match(logRaw, /"action":"APPLY-SKIP"/);
    assert.match(logRaw, /"id":"ai_0042"/);
  });

  it('Flow B — week-1 unskip survival: chef-proposed → user [[unskip]] → apply preserves pending', async () => {
    // Seed: chef proposed a skip for ai_0099 (chef-proposed, status pending).
    writeFileSync(
      meetingPath,
      makeMeetingContent({
        title: 'John ↔ Jamie 2026-06-04',
        date: '2026-06-04',
        status: { ai_0042: 'pending', ai_0099: 'pending' },
        skipReason: {
          ai_0099: {
            reason: 'discussed at standup',
            evidence: 'Standup notes 2026-06-03',
            setBy: 'chef-proposed',
            setAt: '2026-06-04T18:42:14Z',
          },
        },
        items: [
          { id: 'ai_0042', text: 'Send the deck' },
          { id: 'ai_0099', text: 'Some chef-proposed item' },
        ],
      }),
      'utf8',
    );
    backdateMtime(meetingPath);

    // STEP 1 — User issues [[unskip ai_0099]] in their winddown view.
    // The parser identifies the directive; the resolver finds the meeting.
    const winddownView = `[[unskip ai_0099]] — actually still need this`;
    const directives = parseChefSkipDirectives(winddownView);
    assert.equal(directives.length, 1);
    const resolved = await resolveChefSkipDirective(storage, directives[0], { workspaceRoot });
    assert.equal(resolved.status, 'resolved');
    assert.equal(resolved.meetingPath, meetingPath);

    // STEP 2 — Apply the [[unskip]]: flip status to pending (already
    // pending so no-op), delete skip_reason[ai_0099].
    await writeWithLock(
      storage,
      meetingPath,
      async (current) => {
        const existingSkipReason = (current.frontmatter['staged_item_skip_reason'] as StagedItemSkipReason) ?? {};
        const newSkipReason = { ...existingSkipReason };
        delete newSkipReason['ai_0099'];
        return {
          frontmatter: {
            staged_item_status: {
              ...(current.frontmatter['staged_item_status'] as StagedItemStatus),
              ai_0099: 'pending' as const,
            },
            // If the map is now empty, return undefined to delete the key entirely.
            staged_item_skip_reason:
              Object.keys(newSkipReason).length === 0 ? undefined : newSkipReason,
          },
        };
      },
      { mtimeGuardSeconds: 0 },
    );
    await appendChefSkipLog(workspaceRoot, {
      action: 'UNSKIP',
      id: 'ai_0099',
      meeting: 'john-jamie-2026-06-04',
      setBy: 'user',
    });

    // STEP 3 — Separately user approves ai_0042 and runs apply.
    backdateMtime(meetingPath);
    await writeWithLock(
      storage,
      meetingPath,
      async (current) => ({
        frontmatter: {
          staged_item_status: {
            ...(current.frontmatter['staged_item_status'] as StagedItemStatus),
            ai_0042: 'approved' as const,
          },
        },
      }),
      { mtimeGuardSeconds: 0 },
    );

    await commitApprovedItems(storage, meetingPath, memoryDir);

    // ASSERTIONS — F5/AC11 critical:
    // ai_0099 must STILL be in staged_item_status as pending (NOT cleared
    // by wholesale wipe). Closes F5/AC11.
    const fm = readFrontmatter(meetingPath);
    const status = fm['staged_item_status'] as Record<string, string>;
    assert.ok(status, 'staged_item_status survives because ai_0099 still pending');
    assert.equal(status['ai_0099'], 'pending', 'unsked ai_0099 survives apply cleanup (F5)');
    assert.ok(!('ai_0042' in status), 'approved ai_0042 cleaned');

    // skip_reason for ai_0099 was explicitly deleted by the [[unskip]].
    const skipReason = fm['staged_item_skip_reason'] as Record<string, unknown> | undefined;
    if (skipReason !== undefined) {
      assert.ok(!('ai_0099' in skipReason), 'unsked skip_reason entry was deleted');
    }

    // Audit log shows UNSKIP.
    const logRaw = readFileSync(
      join(workspaceRoot, 'dev', 'diary', 'chef-skip-log.md'),
      'utf8',
    );
    assert.match(logRaw, /"action":"UNSKIP"/);
    assert.match(logRaw, /"id":"ai_0099"/);
  });

  it('Flow C — chef-proposed lapses harmlessly on apply (no [[confirm-skip]])', async () => {
    // Seed: chef proposed ai_0099 (week-1 path). User does nothing. User
    // separately approves ai_0042 and applies. Item ai_0099 stays pending
    // → drops from frontmatter? No — F5 says non-approved items survive.
    writeFileSync(
      meetingPath,
      makeMeetingContent({
        title: 'John ↔ Jamie 2026-06-04',
        date: '2026-06-04',
        status: { ai_0042: 'approved', ai_0099: 'pending' },
        skipReason: {
          ai_0099: {
            reason: 'discussed at standup',
            evidence: 'Standup notes 2026-06-03',
            setBy: 'chef-proposed',
            setAt: '2026-06-04T18:42:14Z',
          },
        },
        items: [
          { id: 'ai_0042', text: 'Send the deck' },
          { id: 'ai_0099', text: 'Some chef-proposed item' },
        ],
      }),
      'utf8',
    );
    backdateMtime(meetingPath);

    await commitApprovedItems(storage, meetingPath, memoryDir);

    // F5 critical: chef-proposed pending item + its skip_reason SURVIVE
    // so chef can re-propose next round.
    const fm = readFrontmatter(meetingPath);
    const status = fm['staged_item_status'] as Record<string, string>;
    assert.equal(status['ai_0099'], 'pending', 'chef-proposed pending survives apply');
    assert.ok(!('ai_0042' in status), 'approved ai_0042 cleaned');

    const skipReason = fm['staged_item_skip_reason'] as Record<string, Record<string, unknown>>;
    assert.ok(skipReason, 'skip_reason map survives');
    assert.equal(skipReason['ai_0099']['setBy'], 'chef-proposed', 'chef-proposed setBy preserved');
  });

  it('Flow D — concrete CT2 reproduction (the original 2026-06-04 winddown catch)', async () => {
    // From the plan §Background — the 2026-06-04 winddown caught:
    //   [CT2] Staged action item 'Share the Notion claim-review-process
    //   doc with Jamie' — already fulfilled via Slack DM. Action if
    //   approved: do NOT create this commitment on meeting approve.
    //
    // The chef *noticed* but had no enforcement. v3 followup-2 makes
    // that enforcement structural. This test reproduces the catch +
    // verifies no commitment is created.
    writeFileSync(
      meetingPath,
      makeMeetingContent({
        title: 'John ↔ Jamie 2026-06-04',
        date: '2026-06-04',
        status: { ai_0042: 'pending' },
        items: [
          { id: 'ai_0042', text: 'Share the Notion claim-review-process doc with Jamie' },
        ],
      }),
      'utf8',
    );
    backdateMtime(meetingPath);

    // Chef writes the skip BEFORE user runs apply.
    await writeWithLock(
      storage,
      meetingPath,
      async (current) => ({
        frontmatter: {
          staged_item_status: {
            ...(current.frontmatter['staged_item_status'] as StagedItemStatus),
            ai_0042: 'skipped' as const,
          },
          staged_item_skip_reason: {
            ai_0042: {
              reason: 'already fulfilled via slack-dm',
              evidence: 'Slack DM → Jamie Burk, 2026-06-04',
              setBy: 'chef' as const,
              setAt: '2026-06-04T18:42:11Z',
            },
          } satisfies StagedItemSkipReason,
        },
      }),
      { mtimeGuardSeconds: 0 },
    );

    // User clicks "approve all staged" — in real workflow this would
    // set status['ai_0042'] to 'approved', but the chef's 'skipped' must
    // take precedence. Today's UI does this naively; this test asserts
    // the STRUCTURAL safety: if chef's skip is in frontmatter, even an
    // accidental "approve all" by the user is prevented from creating
    // the commitment because the chef rewrote status before the user
    // could.
    //
    // We DON'T overwrite ai_0042's status to 'approved' here — we apply
    // immediately. CT2 commit must NOT be created.
    await commitApprovedItems(storage, meetingPath, memoryDir);

    const body = readFileSync(meetingPath, 'utf8');
    // ai_0042 is in "## Skipped on Apply", NOT in "## Approved Action Items".
    const approvedSection = body.match(/## Approved Action Items\n([\s\S]*?)(?=\n## |$)/);
    if (approvedSection) {
      assert.doesNotMatch(approvedSection[1], /Share the Notion/);
    }
    assert.match(body, /## Skipped on Apply/);
    assert.match(body, /\[ai_0042\] Share the Notion claim-review-process/);
    assert.match(body, /already fulfilled via slack-dm/);
  });
});
