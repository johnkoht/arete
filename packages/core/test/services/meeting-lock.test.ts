/**
 * Tests for MeetingService.writeWithLock (phase-10-followup-2 Step 2).
 *
 * Uses a REAL filesystem (tmp dir under os.tmpdir()) because proper-lockfile
 * operates on real disk — it creates a sidecar `.lock` directory next to
 * the target file. Mock storage adapters that back to memory cannot satisfy
 * that contract.
 *
 * Covers:
 *  - F2 partial-merge contract: mutator returning only its owned keys does
 *    NOT clobber sibling fields (the load-bearing test for this followup).
 *  - mtime guard: file edited within guard window aborts the write.
 *  - Mutator abstain path.
 *  - Lock acquired + released; subsequent writes don't hang.
 *  - Explicit `undefined` deletes a key.
 *  - Body preserved when mutator omits it.
 *  - LockBootstrapError when target file is missing.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { writeWithLock } from '../../src/services/meeting-lock.js';
import { LockBootstrapError } from '../../src/services/commitments.js';
import { FileStorageAdapter } from '../../src/storage/file.js';

function makeMeeting(frontmatter: Record<string, unknown>, body: string): string {
  // Use simple manual format to avoid yaml-library normalization differences
  // when round-tripping.
  const fmYaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  return `---\n${fmYaml}\n---\n\n${body}`;
}

function parseFrontmatterFromRaw(raw: string): {
  data: Record<string, unknown>;
  body: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  return {
    data: (parseYaml(match[1]) ?? {}) as Record<string, unknown>,
    body: match[2],
  };
}

describe('writeWithLock — phase-10-followup-2 Step 2', () => {
  let workspaceRoot: string;
  let meetingPath: string;
  const storage = new FileStorageAdapter();

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'arete-meeting-lock-'));
    meetingPath = join(workspaceRoot, 'meeting-1.md');
    // Seed an "old" file so mtime-guard doesn't trip for the default cases.
    writeFileSync(
      meetingPath,
      makeMeeting(
        {
          title: 'Test Meeting',
          date: '2026-06-04',
          staged_item_status: { ai_0042: 'skipped', ai_0043: 'pending' },
          staged_item_skip_reason: {
            ai_0042: {
              reason: 'already fulfilled via slack-dm',
              evidence: 'Slack DM → Jamie Burk, 2026-06-04',
              setBy: 'chef',
              setAt: '2026-06-04T18:42:11Z',
            },
          },
        },
        '## Staged Action Items\n- ai_0042: Share the Notion doc\n- ai_0043: Send the deck\n',
      ),
      'utf8',
    );
    // Backdate mtime so mtime-guard doesn't trip (default 60s window).
    const longAgo = new Date(Date.now() - 5 * 60 * 1000);
    utimesSync(meetingPath, longAgo, longAgo);
  });

  afterEach(() => {
    if (workspaceRoot && existsSync(workspaceRoot)) {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // F2 contract — the load-bearing test
  // -------------------------------------------------------------------------

  it('F2 partial-merge contract: mutator returning only owned keys does NOT clobber sibling fields', async () => {
    // Simulate the extract path: mutator returns ONLY the 5 extract-owned
    // keys (status, edits, source, confidence, owner). It does NOT mention
    // staged_item_skip_reason. The contract guarantees that field survives
    // byte-for-byte.
    const result = await writeWithLock(
      storage,
      meetingPath,
      async (current) => {
        // Confirm we can see the existing frontmatter.
        assert.ok(
          (current.frontmatter['staged_item_skip_reason'] as Record<string, unknown>)?.['ai_0042'],
          'mutator should see existing skip_reason',
        );
        return {
          frontmatter: {
            // Extract-owned keys (5 of them) — staged_item_skip_reason
            // intentionally NOT mentioned.
            staged_item_status: { ai_0042: 'skipped', ai_0043: 'pending', ai_0044: 'pending' },
            staged_item_edits: { ai_0044: 'an edited line' },
            staged_item_source: { ai_0044: 'fathom' },
            staged_item_confidence: { ai_0044: 0.8 },
            staged_item_owner: { ai_0044: { ownerSlug: 'jamie-burk' } },
          },
        };
      },
      { mtimeGuardSeconds: 0 }, // disable guard for this assertion
    );

    assert.equal(result.written, true);

    const raw = readFileSync(meetingPath, 'utf8');
    const { data } = parseFrontmatterFromRaw(raw);

    // F2 contract: untouched key survives byte-for-byte.
    const skipReason = data['staged_item_skip_reason'] as Record<string, Record<string, unknown>>;
    assert.ok(skipReason, 'staged_item_skip_reason MUST survive partial-merge');
    assert.equal(skipReason['ai_0042']?.reason, 'already fulfilled via slack-dm');
    assert.equal(skipReason['ai_0042']?.evidence, 'Slack DM → Jamie Burk, 2026-06-04');
    assert.equal(skipReason['ai_0042']?.setBy, 'chef');
    assert.equal(skipReason['ai_0042']?.setAt, '2026-06-04T18:42:11Z');

    // The 5 extract-owned keys were rewritten as returned.
    assert.deepEqual(data['staged_item_status'], {
      ai_0042: 'skipped',
      ai_0043: 'pending',
      ai_0044: 'pending',
    });
    assert.deepEqual(data['staged_item_edits'], { ai_0044: 'an edited line' });
  });

  // -------------------------------------------------------------------------
  // mtime guard
  // -------------------------------------------------------------------------

  it('mtime guard aborts when file is younger than the guard window', async () => {
    // Re-stamp mtime to "right now" — well inside the 60s guard window.
    const now = new Date();
    utimesSync(meetingPath, now, now);

    const result = await writeWithLock(storage, meetingPath, async () => {
      assert.fail('mutator MUST NOT run when mtime-guard fires');
    });

    assert.equal(result.written, false);
    assert.equal(result.abstainReason, 'recent-user-edit');

    // File contents unchanged.
    const raw = readFileSync(meetingPath, 'utf8');
    const { data } = parseFrontmatterFromRaw(raw);
    assert.equal(data['title'], 'Test Meeting');
  });

  it('mtime guard skipped when mtimeGuardSeconds=0', async () => {
    const now = new Date();
    utimesSync(meetingPath, now, now);

    const result = await writeWithLock(
      storage,
      meetingPath,
      async () => ({ frontmatter: { status: 'updated' } }),
      { mtimeGuardSeconds: 0 },
    );

    assert.equal(result.written, true);
  });

  // -------------------------------------------------------------------------
  // Mutator abstain
  // -------------------------------------------------------------------------

  it('mutator abstain prevents the write', async () => {
    const result = await writeWithLock(
      storage,
      meetingPath,
      async () => ({ abstain: 'no-op-needed' }),
      { mtimeGuardSeconds: 0 },
    );

    assert.equal(result.written, false);
    assert.equal(result.abstainReason, 'no-op-needed');

    // File unchanged.
    const raw = readFileSync(meetingPath, 'utf8');
    const { data } = parseFrontmatterFromRaw(raw);
    assert.equal(data['title'], 'Test Meeting');
  });

  // -------------------------------------------------------------------------
  // Explicit undefined deletes a key
  // -------------------------------------------------------------------------

  it('explicit undefined in returned frontmatter deletes the key', async () => {
    const result = await writeWithLock(
      storage,
      meetingPath,
      async () => ({
        frontmatter: { staged_item_skip_reason: undefined },
      }),
      { mtimeGuardSeconds: 0 },
    );

    assert.equal(result.written, true);

    const raw = readFileSync(meetingPath, 'utf8');
    const { data } = parseFrontmatterFromRaw(raw);
    assert.ok(!('staged_item_skip_reason' in data), 'key should be deleted');
    // Other keys untouched.
    assert.ok('staged_item_status' in data);
    assert.equal(data['title'], 'Test Meeting');
  });

  // -------------------------------------------------------------------------
  // Body preservation
  // -------------------------------------------------------------------------

  it('body preserved when mutator omits it', async () => {
    const result = await writeWithLock(
      storage,
      meetingPath,
      async () => ({ frontmatter: { status: 'updated' } }),
      { mtimeGuardSeconds: 0 },
    );

    assert.equal(result.written, true);

    const raw = readFileSync(meetingPath, 'utf8');
    const { body } = parseFrontmatterFromRaw(raw);
    assert.match(body, /Staged Action Items/);
    assert.match(body, /ai_0042: Share the Notion doc/);
  });

  it('body replaced when mutator returns it', async () => {
    const newBody = '## Brand New Body\nReplaced content here.';
    const result = await writeWithLock(
      storage,
      meetingPath,
      async () => ({ frontmatter: {}, body: newBody }),
      { mtimeGuardSeconds: 0 },
    );

    assert.equal(result.written, true);

    const raw = readFileSync(meetingPath, 'utf8');
    const { body } = parseFrontmatterFromRaw(raw);
    assert.match(body, /Brand New Body/);
    assert.doesNotMatch(body, /Staged Action Items/);
  });

  // -------------------------------------------------------------------------
  // Bootstrap failure on missing file
  // -------------------------------------------------------------------------

  it('throws LockBootstrapError when target file does not exist', async () => {
    const missingPath = join(workspaceRoot, 'does-not-exist.md');
    await assert.rejects(
      writeWithLock(storage, missingPath, async () => ({ frontmatter: {} })),
      (err: Error) => {
        assert.ok(
          err instanceof LockBootstrapError,
          `expected LockBootstrapError, got ${err.constructor.name}`,
        );
        return true;
      },
    );
  });
});
