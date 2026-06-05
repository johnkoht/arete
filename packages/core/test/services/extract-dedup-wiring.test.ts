/**
 * Phase 10b-min wiring tests — `wireExtractDedup` integrates the pure
 * pipeline modules with the CLI flow (commitments.withLock, slug→path,
 * reverse-stamp, audit log).
 *
 * Tests use a real filesystem temp directory (proper-lockfile needs real
 * paths for the commitments lock) and a mocked LLM (no real provider).
 *
 * Coverage:
 *  1. Two same-day meetings with identical normalized text → orchestrator
 *     flags second as dupe of first (text-hash exact match short-circuit).
 *  2. Existing commitment + new staged item, semantic-similar text →
 *     LLM cross-check fires; SAME → marked dupe.
 *  3. LLM returns DIFFERENT → both retained (no skip patch entries).
 *  4. LLM returns UNCERTAIN → both retained AND flagged
 *     (possibly-mergeable; no skip_reason; status stays unchanged).
 *  5. Concurrent extract on same meeting (race) → lock serializes; no
 *     corruption.
 *  6. Reverse-stamp: meeting B finds canonical in meeting A → A's file
 *     gets the comment appended; A's mtime within 60s causes skip.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  utimesSync,
} from 'node:fs';
import { readFile, writeFile, access, readdir, mkdir as mkdirAsync } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  wireExtractDedup,
  loadSameDayStagedItems,
  resolveMeetingSlugToPath,
  adaptFilteredItemsForDedup,
} from '../../src/services/extract-dedup-wiring.js';
import { CommitmentsService } from '../../src/services/commitments.js';
import type { StorageAdapter } from '../../src/storage/adapter.js';
import type { LLMCallConcurrentFn } from '../../src/services/commitment-dedup-pipeline.js';
import type { Commitment } from '../../src/models/index.js';

// ---------------------------------------------------------------------------
// Mocks + helpers
// ---------------------------------------------------------------------------

/**
 * Minimal real-filesystem storage adapter for tests. Mirrors the
 * shape used by `commitment-dedup-reverse-stamp.test.ts`.
 */
function createFsAdapter(): StorageAdapter {
  return {
    async read(path: string) {
      try {
        return await readFile(path, 'utf8');
      } catch {
        return null;
      }
    },
    async write(path: string, content: string) {
      // Ensure parent directory exists for the commitments.json case.
      const parent = path.split('/').slice(0, -1).join('/');
      try {
        await mkdirAsync(parent, { recursive: true });
      } catch {
        /* no-op */
      }
      await writeFile(path, content, 'utf8');
    },
    async exists(path: string) {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    },
    async delete() {
      /* not used */
    },
    async list(dir: string, opts?: { extensions?: string[] }) {
      try {
        const entries = await readdir(dir);
        const out: string[] = [];
        for (const e of entries) {
          if (opts?.extensions && !opts.extensions.some((ext) => e.endsWith(ext))) continue;
          out.push(join(dir, e));
        }
        return out;
      } catch {
        return [];
      }
    },
    async listSubdirectories() {
      return [];
    },
    async mkdir(path: string) {
      try {
        await mkdirAsync(path, { recursive: true });
      } catch {
        /* no-op */
      }
    },
    async getModified() {
      return null;
    },
  };
}

/**
 * Mock LLM that picks a verdict per fixture table. The pipeline's
 * cross-check prompt embeds new + candidate texts; we extract them and
 * look up the expected verdict.
 */
function makeMockLLM(
  verdictByNewText: Map<string, 'SAME' | 'DIFFERENT' | 'UNCERTAIN'>,
): LLMCallConcurrentFn {
  return async (prompts) =>
    prompts.map((p) => {
      const newMatch = p.prompt.match(/^NEW \(from meeting <[^>]+>\): (.+)$/m);
      const newText = newMatch?.[1] ?? '';
      const verdict = verdictByNewText.get(newText) ?? 'DIFFERENT';
      // Render one numbered line per candidate (we only need enough to
      // cover the test scenarios — single candidate per case).
      const candMatches = Array.from(
        p.prompt.matchAll(/^\d+\. \(from meeting <[^>]+>\) (.+)$/gm),
      );
      return candMatches
        .map((_m, i) => `${i + 1}. ${verdict} | mock-${verdict.toLowerCase()}`)
        .join('\n');
    });
}

/** Create a workspace skeleton (resources/meetings + .arete). */
function createWorkspace(): {
  root: string;
  meetingsDir: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), 'arete-wiring-'));
  const meetingsDir = join(root, 'resources', 'meetings');
  mkdirSync(meetingsDir, { recursive: true });
  mkdirSync(join(root, '.arete'), { recursive: true });
  return {
    root,
    meetingsDir,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* no-op */
      }
    },
  };
}

/** Backdate file mtime so the 60s mtime guard doesn't fire. */
function backdateFile(path: string, secondsAgo = 300): void {
  const past = new Date(Date.now() - secondsAgo * 1000);
  utimesSync(path, past, past);
}

/** Write a meeting file with a staged Action Items section. */
function writeMeetingFile(
  meetingsDir: string,
  slug: string,
  body: string,
  frontmatter: Record<string, unknown> = {},
): string {
  const filePath = join(meetingsDir, `${slug}.md`);
  const fm = {
    title: slug,
    date: slug.slice(0, 10),
    status: 'processed',
    ...frontmatter,
  };
  const fmLines = Object.entries(fm)
    .map(([k, v]) => {
      if (typeof v === 'object' && v !== null) {
        return `${k}:\n${Object.entries(v as Record<string, unknown>)
          .map(([kk, vv]) =>
            typeof vv === 'object' && vv !== null
              ? `  ${kk}:\n${Object.entries(vv as Record<string, unknown>)
                  .map(([k3, v3]) => `    ${k3}: ${JSON.stringify(v3)}`)
                  .join('\n')}`
              : `  ${kk}: ${JSON.stringify(vv)}`,
          )
          .join('\n')}`;
      }
      return `${k}: ${JSON.stringify(v)}`;
    })
    .join('\n');
  const content = `---\n${fmLines}\n---\n\n${body}`;
  writeFileSync(filePath, content, 'utf8');
  backdateFile(filePath);
  return filePath;
}

// ---------------------------------------------------------------------------
// loadSameDayStagedItems
// ---------------------------------------------------------------------------

describe('loadSameDayStagedItems', () => {
  it('loads staged action items from other same-day meetings', async () => {
    const ws = createWorkspace();
    try {
      writeMeetingFile(
        ws.meetingsDir,
        '2026-06-01-meeting-a',
        `## Staged Action Items
- ai_001: [@john → @dave] Talk to Dave about staffing
`,
        {
          staged_item_owner: {
            ai_001: {
              ownerSlug: 'john',
              direction: 'i_owe_them',
              counterpartySlug: 'dave',
            },
          },
        },
      );
      writeMeetingFile(
        ws.meetingsDir,
        '2026-06-01-meeting-b',
        `## Staged Action Items
- ai_001: [@john → @sarah] Send Sarah the deck
`,
      );

      const storage = createFsAdapter();
      const out = await loadSameDayStagedItems(
        storage,
        ws.meetingsDir,
        '2026-06-01',
        '2026-06-01-meeting-b',
      );

      assert.equal(out.length, 1, `expected 1 candidate; got ${out.length}`);
      assert.equal(out[0].meetingSlug, '2026-06-01-meeting-a');
      assert.equal(out[0].id, '2026-06-01-meeting-a::ai_001');
      assert.equal(out[0].direction, 'i_owe_them');
      assert.deepEqual(out[0].personSlugs.sort(), ['dave', 'john']);
    } finally {
      ws.cleanup();
    }
  });

  it('excludes the current meeting', async () => {
    const ws = createWorkspace();
    try {
      writeMeetingFile(
        ws.meetingsDir,
        '2026-06-01-current',
        `## Staged Action Items
- ai_001: [@john → @dave] My own item
`,
      );
      const storage = createFsAdapter();
      const out = await loadSameDayStagedItems(
        storage,
        ws.meetingsDir,
        '2026-06-01',
        '2026-06-01-current',
      );
      assert.equal(out.length, 0);
    } finally {
      ws.cleanup();
    }
  });

  it('excludes other-day meetings', async () => {
    const ws = createWorkspace();
    try {
      writeMeetingFile(
        ws.meetingsDir,
        '2026-05-31-old',
        `## Staged Action Items
- ai_001: [@john → @dave] Old item
`,
      );
      const storage = createFsAdapter();
      const out = await loadSameDayStagedItems(
        storage,
        ws.meetingsDir,
        '2026-06-01',
        '2026-06-01-current',
      );
      assert.equal(out.length, 0);
    } finally {
      ws.cleanup();
    }
  });

  it('drops items whose status is "skipped"', async () => {
    const ws = createWorkspace();
    try {
      writeMeetingFile(
        ws.meetingsDir,
        '2026-06-01-meeting-a',
        `## Staged Action Items
- ai_001: [@john → @dave] Already-skipped item
- ai_002: [@john → @sarah] Active item
`,
        {
          staged_item_status: {
            ai_001: 'skipped',
            ai_002: 'pending',
          },
        },
      );
      const storage = createFsAdapter();
      const out = await loadSameDayStagedItems(
        storage,
        ws.meetingsDir,
        '2026-06-01',
        '2026-06-01-other',
      );
      assert.equal(out.length, 1, `expected only ai_002; got ${out.length}`);
      assert.ok(out[0].id.endsWith('::ai_002'));
    } finally {
      ws.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// resolveMeetingSlugToPath
// ---------------------------------------------------------------------------

describe('resolveMeetingSlugToPath', () => {
  it('returns the path when the file exists', async () => {
    const ws = createWorkspace();
    try {
      writeMeetingFile(ws.meetingsDir, '2026-06-01-meeting', '## Notes\n');
      const storage = createFsAdapter();
      const path = await resolveMeetingSlugToPath(
        storage,
        ws.meetingsDir,
        '2026-06-01-meeting',
      );
      assert.equal(path, join(ws.meetingsDir, '2026-06-01-meeting.md'));
    } finally {
      ws.cleanup();
    }
  });

  it('returns null when the slug does not exist', async () => {
    const ws = createWorkspace();
    try {
      const storage = createFsAdapter();
      const path = await resolveMeetingSlugToPath(
        storage,
        ws.meetingsDir,
        '2026-06-01-not-here',
      );
      assert.equal(path, null);
    } finally {
      ws.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// adaptFilteredItemsForDedup
// ---------------------------------------------------------------------------

describe('adaptFilteredItemsForDedup', () => {
  it('only includes action items with valid direction', () => {
    const out = adaptFilteredItemsForDedup([
      {
        id: 'ai_001',
        text: 'Talk to Dave',
        type: 'action',
        ownerMeta: {
          ownerSlug: 'john',
          direction: 'i_owe_them',
          counterpartySlug: 'dave',
        },
      },
      {
        id: 'de_001',
        text: 'Decided X',
        type: 'decision',
      },
      {
        id: 'ai_002',
        text: 'Missing direction',
        type: 'action',
        ownerMeta: { ownerSlug: 'john' },
      },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].itemId, 'ai_001');
    assert.deepEqual(out[0].personSlugs.sort(), ['dave', 'john']);
  });
});

// ---------------------------------------------------------------------------
// wireExtractDedup — end-to-end with mock LLM
// ---------------------------------------------------------------------------

describe('wireExtractDedup — end-to-end', () => {
  it('text-hash exact match: same-day staged item across meetings marks new as dupe', async () => {
    const ws = createWorkspace();
    try {
      // Meeting A — canonical
      writeMeetingFile(
        ws.meetingsDir,
        '2026-06-01-meeting-a',
        `## Staged Action Items
- ai_001: [@john → @dave] Talk to Dave about staffing
`,
        {
          staged_item_owner: {
            ai_001: {
              ownerSlug: 'john',
              direction: 'i_owe_them',
              counterpartySlug: 'dave',
            },
          },
        },
      );
      // Empty commitments.json
      writeFileSync(
        join(ws.root, '.arete', 'commitments.json'),
        JSON.stringify({ commitments: [] }),
      );

      const storage = createFsAdapter();
      const commitments = new CommitmentsService(storage, ws.root);
      const mockLLM = makeMockLLM(new Map()); // no LLM call expected

      const result = await wireExtractDedup(
        { storage, commitments },
        {
          workspaceRoot: ws.root,
          meetingsDir: ws.meetingsDir,
          currentMeetingPath: join(ws.meetingsDir, '2026-06-01-meeting-b.md'),
          currentMeetingSlug: '2026-06-01-meeting-b',
          meetingDate: '2026-06-01',
          extractedItems: [
            {
              itemId: 'ai_001',
              text: 'Talk to Dave about staffing',
              direction: 'i_owe_them',
              personSlugs: ['john', 'dave'],
            },
          ],
        },
        mockLLM,
        { dryRun: true }, // skip reverse-stamp + log writes
      );

      assert.equal(result.decisions.length, 1);
      assert.equal(result.decisions[0].outcome.kind, 'definite-dupe');
      assert.equal(result.statusPatch['ai_001'], 'skipped');
      assert.ok(
        result.skipReasonPatch['ai_001'].reason.startsWith('dupe_of_'),
        `expected dupe_of_ reason; got ${result.skipReasonPatch['ai_001']?.reason}`,
      );
      assert.equal(result.skipReasonPatch['ai_001'].setBy, 'chef');
    } finally {
      ws.cleanup();
    }
  });

  it('LLM SAME on existing commitment: new item flagged as dupe', async () => {
    const ws = createWorkspace();
    try {
      // Commitment in commitments.json
      const existing: Commitment = {
        id: 'canon_abc123',
        text: 'Send Lindsay the staffing deck',
        direction: 'i_owe_them',
        personSlug: 'lindsay',
        personName: 'Lindsay',
        source: '2026-06-01-earlier-meeting.md',
        date: '2026-06-01',
        createdAt: '2026-06-01T08:00:00Z',
        status: 'open',
        resolvedAt: null,
        source_meetings: ['2026-06-01-earlier-meeting'],
        stakeholders: [
          { slug: 'lindsay', role: 'counterparty' },
        ],
      };
      writeFileSync(
        join(ws.root, '.arete', 'commitments.json'),
        JSON.stringify({ commitments: [existing] }),
      );
      // Earlier meeting file (for reverse-stamp resolution)
      writeMeetingFile(
        ws.meetingsDir,
        '2026-06-01-earlier-meeting',
        `## Approved Action Items\n- Send Lindsay the staffing deck (@john → @lindsay)\n`,
      );

      const storage = createFsAdapter();
      const commitments = new CommitmentsService(storage, ws.root);
      // Text is semantically similar but not exact — LLM should fire.
      const mockLLM = makeMockLLM(
        new Map([['Send Lindsay the staffing slides', 'SAME']]),
      );

      const result = await wireExtractDedup(
        { storage, commitments },
        {
          workspaceRoot: ws.root,
          meetingsDir: ws.meetingsDir,
          currentMeetingPath: join(ws.meetingsDir, '2026-06-01-current.md'),
          currentMeetingSlug: '2026-06-01-current',
          meetingDate: '2026-06-01',
          extractedItems: [
            {
              itemId: 'ai_001',
              text: 'Send Lindsay the staffing slides',
              direction: 'i_owe_them',
              personSlugs: ['john', 'lindsay'],
            },
          ],
        },
        mockLLM,
        { dryRun: true },
      );

      assert.equal(result.decisions.length, 1);
      assert.equal(
        result.decisions[0].outcome.kind,
        'definite-dupe',
        `expected definite-dupe; got ${result.decisions[0].outcome.kind}`,
      );
      assert.equal(result.statusPatch['ai_001'], 'skipped');
      assert.ok(result.skipReasonPatch['ai_001'].reason.includes('canon_abc123'));
    } finally {
      ws.cleanup();
    }
  });

  it('LLM DIFFERENT: both retained, no skip patch', async () => {
    const ws = createWorkspace();
    try {
      const existing: Commitment = {
        id: 'canon_xyz789',
        text: 'Send Lindsay the staffing deck',
        direction: 'i_owe_them',
        personSlug: 'lindsay',
        personName: 'Lindsay',
        source: '2026-06-01-earlier-meeting.md',
        date: '2026-06-01',
        createdAt: '2026-06-01T08:00:00Z',
        status: 'open',
        resolvedAt: null,
        source_meetings: ['2026-06-01-earlier-meeting'],
        stakeholders: [{ slug: 'lindsay', role: 'counterparty' }],
      };
      writeFileSync(
        join(ws.root, '.arete', 'commitments.json'),
        JSON.stringify({ commitments: [existing] }),
      );

      const storage = createFsAdapter();
      const commitments = new CommitmentsService(storage, ws.root);
      const mockLLM = makeMockLLM(
        new Map([['Send Lindsay the budget spreadsheet', 'DIFFERENT']]),
      );

      const result = await wireExtractDedup(
        { storage, commitments },
        {
          workspaceRoot: ws.root,
          meetingsDir: ws.meetingsDir,
          currentMeetingPath: join(ws.meetingsDir, '2026-06-01-current.md'),
          currentMeetingSlug: '2026-06-01-current',
          meetingDate: '2026-06-01',
          extractedItems: [
            {
              itemId: 'ai_001',
              text: 'Send Lindsay the budget spreadsheet',
              direction: 'i_owe_them',
              personSlugs: ['john', 'lindsay'],
            },
          ],
        },
        mockLLM,
        { dryRun: true },
      );

      assert.equal(result.decisions[0].outcome.kind, 'new-canonical');
      assert.equal(Object.keys(result.statusPatch).length, 0);
      assert.equal(Object.keys(result.skipReasonPatch).length, 0);
    } finally {
      ws.cleanup();
    }
  });

  it('LLM UNCERTAIN: both retained AND flagged as possibly-mergeable', async () => {
    const ws = createWorkspace();
    try {
      const existing: Commitment = {
        id: 'canon_uncertain',
        text: 'Send Lindsay the deck',
        direction: 'i_owe_them',
        personSlug: 'lindsay',
        personName: 'Lindsay',
        source: '2026-06-01-earlier-meeting.md',
        date: '2026-06-01',
        createdAt: '2026-06-01T08:00:00Z',
        status: 'open',
        resolvedAt: null,
        source_meetings: ['2026-06-01-earlier-meeting'],
        stakeholders: [{ slug: 'lindsay', role: 'counterparty' }],
      };
      writeFileSync(
        join(ws.root, '.arete', 'commitments.json'),
        JSON.stringify({ commitments: [existing] }),
      );

      const storage = createFsAdapter();
      const commitments = new CommitmentsService(storage, ws.root);
      const mockLLM = makeMockLLM(
        new Map([['Send Lindsay the deck for review', 'UNCERTAIN']]),
      );

      const result = await wireExtractDedup(
        { storage, commitments },
        {
          workspaceRoot: ws.root,
          meetingsDir: ws.meetingsDir,
          currentMeetingPath: join(ws.meetingsDir, '2026-06-01-current.md'),
          currentMeetingSlug: '2026-06-01-current',
          meetingDate: '2026-06-01',
          extractedItems: [
            {
              itemId: 'ai_001',
              text: 'Send Lindsay the deck for review',
              direction: 'i_owe_them',
              personSlugs: ['john', 'lindsay'],
            },
          ],
        },
        mockLLM,
        { dryRun: true },
      );

      assert.equal(
        result.decisions[0].outcome.kind,
        'possibly-mergeable',
        `expected possibly-mergeable; got ${result.decisions[0].outcome.kind}`,
      );
      // possibly-mergeable does NOT create a skip patch (AC4a)
      assert.equal(Object.keys(result.statusPatch).length, 0);
      assert.equal(Object.keys(result.skipReasonPatch).length, 0);
    } finally {
      ws.cleanup();
    }
  });

  it('concurrent extracts: lock serializes; no corruption', async () => {
    const ws = createWorkspace();
    try {
      writeFileSync(
        join(ws.root, '.arete', 'commitments.json'),
        JSON.stringify({ commitments: [] }),
      );

      const storage = createFsAdapter();
      // Two SEPARATE service instances → cross-instance lock (real
      // proper-lockfile path, not re-entrant short-circuit).
      const commitmentsA = new CommitmentsService(storage, ws.root);
      const commitmentsB = new CommitmentsService(storage, ws.root);
      const mockLLM = makeMockLLM(new Map());

      const baseInputs = {
        workspaceRoot: ws.root,
        meetingsDir: ws.meetingsDir,
        meetingDate: '2026-06-01',
        extractedItems: [
          {
            itemId: 'ai_001',
            text: 'Concurrent extract test item',
            direction: 'i_owe_them' as const,
            personSlugs: ['john', 'dave'],
          },
        ],
      };

      // Fire two extracts in parallel; both should complete without
      // throwing and both should produce valid decision arrays.
      const [resA, resB] = await Promise.all([
        wireExtractDedup(
          { storage, commitments: commitmentsA },
          {
            ...baseInputs,
            currentMeetingPath: join(ws.meetingsDir, '2026-06-01-a.md'),
            currentMeetingSlug: '2026-06-01-a',
          },
          mockLLM,
          { dryRun: true },
        ),
        wireExtractDedup(
          { storage, commitments: commitmentsB },
          {
            ...baseInputs,
            currentMeetingPath: join(ws.meetingsDir, '2026-06-01-b.md'),
            currentMeetingSlug: '2026-06-01-b',
          },
          mockLLM,
          { dryRun: true },
        ),
      ]);

      assert.equal(resA.decisions.length, 1);
      assert.equal(resB.decisions.length, 1);
      // commitments.json is unchanged (extract doesn't write commitments;
      // that's the apply path) — but the file should still be valid JSON.
      const after = JSON.parse(
        readFileSync(join(ws.root, '.arete', 'commitments.json'), 'utf8'),
      ) as { commitments: unknown[] };
      assert.equal(after.commitments.length, 0);
    } finally {
      ws.cleanup();
    }
  });

  it('reverse-stamp: writes marker on canonical when found, abstains on recent mtime', async () => {
    const ws = createWorkspace();
    try {
      // Canonical meeting A with the staged item.
      const meetingAPath = writeMeetingFile(
        ws.meetingsDir,
        '2026-06-01-meeting-a',
        `## Staged Action Items
- ai_001: [@john → @dave] Talk to Dave about staffing
`,
        {
          staged_item_owner: {
            ai_001: {
              ownerSlug: 'john',
              direction: 'i_owe_them',
              counterpartySlug: 'dave',
            },
          },
        },
      );
      // (already backdated by writeMeetingFile)
      writeFileSync(
        join(ws.root, '.arete', 'commitments.json'),
        JSON.stringify({ commitments: [] }),
      );

      const storage = createFsAdapter();
      const commitments = new CommitmentsService(storage, ws.root);
      const mockLLM = makeMockLLM(new Map());

      // Run wireExtractDedup with dryRun=false so reverse-stamp fires.
      const result = await wireExtractDedup(
        { storage, commitments },
        {
          workspaceRoot: ws.root,
          meetingsDir: ws.meetingsDir,
          currentMeetingPath: join(ws.meetingsDir, '2026-06-01-meeting-b.md'),
          currentMeetingSlug: '2026-06-01-meeting-b',
          meetingDate: '2026-06-01',
          extractedItems: [
            {
              itemId: 'ai_001',
              text: 'Talk to Dave about staffing',
              direction: 'i_owe_them',
              personSlugs: ['john', 'dave'],
            },
          ],
        },
        mockLLM,
        { dryRun: false },
      );

      // Stamp should have written into meeting A.
      assert.equal(result.reverseStampResults.length, 1);
      assert.equal(
        result.reverseStampResults[0].written,
        true,
        `expected written; got ${JSON.stringify(result.reverseStampResults[0])}`,
      );
      const meetingABody = readFileSync(meetingAPath, 'utf8');
      assert.match(
        meetingABody,
        /<!-- also surfaced in 2026-06-01-meeting-b on 2026-06-01 -->/,
      );

      // Now refresh A's mtime to NOW + run again → guard should abstain.
      const now = new Date();
      utimesSync(meetingAPath, now, now);

      const result2 = await wireExtractDedup(
        { storage, commitments },
        {
          workspaceRoot: ws.root,
          meetingsDir: ws.meetingsDir,
          currentMeetingPath: join(ws.meetingsDir, '2026-06-01-meeting-c.md'),
          currentMeetingSlug: '2026-06-01-meeting-c',
          meetingDate: '2026-06-01',
          extractedItems: [
            {
              itemId: 'ai_001',
              text: 'Talk to Dave about staffing',
              direction: 'i_owe_them',
              personSlugs: ['john', 'dave'],
            },
          ],
        },
        mockLLM,
        { dryRun: false },
      );
      // Either an abstain (recent-user-edit) or an idempotent already-stamped
      // — both are acceptable signals that the guard worked. Crucially, NOT
      // a throw.
      assert.equal(result2.reverseStampResults.length, 1);
      const r2 = result2.reverseStampResults[0];
      assert.ok(
        r2.written === false || r2.abstainReason === 'already-stamped',
        `expected abstain; got ${JSON.stringify(r2)}`,
      );
    } finally {
      ws.cleanup();
    }
  });
});
