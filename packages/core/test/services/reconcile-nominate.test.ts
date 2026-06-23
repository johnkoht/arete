/**
 * CHR-W2 Layer-1 tests — `nominateCandidates` (reconcile-engine R2).
 *
 * Per plan Testing Strategy Layer 1:
 * - threshold-unity, SCOPED to candidate nomination only (review F2: a
 *   naive one-constant-everywhere test would force-delete Rule 4's
 *   deliberate 0.6 collapse + 0.5–0.7 Uncertain band — here we assert the
 *   bands are PRESERVED, not unified)
 * - window-coverage: nomination sees ≥ what the inline path saw
 * - excludePath regression incl. symlink / `./`-prefix NON-match
 *   (LEARNINGS 2026-04-29), repointed at the W2 loader pathway
 * - legacy-shaped degraded-mode fixture (engine-spec § 6)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  nominateCandidates,
  ledgerEntriesFromBatch,
  NOMINATION_JACCARD_THRESHOLD,
  UNCERTAIN_BAND_FLOOR,
  type ReconcileLedgerEntry,
} from '../../src/services/reconcile-nominate.js';
import {
  reconcileMeetingBatch,
  loadRecentMeetingBatch,
  findDuplicates,
  matchCompletedTasks,
  type MeetingExtractionBatch,
} from '../../src/services/meeting-reconciliation.js';
import { jaccardSimilarity, normalizeForJaccard } from '../../src/utils/similarity.js';
import type { ReconciliationContext } from '../../src/models/entities.js';
import type { StorageAdapter, ListOptions } from '../../src/storage/adapter.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function emptyContext(): ReconciliationContext {
  return {
    areaMemories: new Map(),
    recentCommittedItems: [],
    completedTasks: [],
  } as unknown as ReconciliationContext;
}

function entry(over: Partial<ReconcileLedgerEntry> & { text: string }): ReconcileLedgerEntry {
  return {
    kind: 'extraction',
    source: 'meeting',
    source_ref: 'resources/meetings/2026-06-09-a.md',
    item_type: 'decision',
    ...over,
  };
}

/** Build two texts with an EXACT target Jaccard from disjoint token pools:
 * shared tokens c1..cN, plus extras on one side. J = shared / union. */
function textsWithJaccard(shared: number, union: number): [string, string] {
  const sharedTokens = Array.from({ length: shared }, (_, i) => `common${i}`);
  const extra = Array.from({ length: union - shared }, (_, i) => `only${i}`);
  return [[...sharedTokens, ...extra].join(' '), sharedTokens.join(' ')];
}

// ---------------------------------------------------------------------------
// Threshold-unity (nomination scope ONLY)
// ---------------------------------------------------------------------------

describe('nominateCandidates — threshold-unity (nomination scope only)', () => {
  it('the nomination constant is 0.7 and matches findDuplicates default semantics', () => {
    assert.equal(NOMINATION_JACCARD_THRESHOLD, 0.7);
    // findDuplicates' default threshold parameter is 0.7 (strict >):
    // a pair at exactly 0.7 is NOT a duplicate group there either.
    const [ta, tb] = textsWithJaccard(7, 10); // J = 0.7 exactly
    assert.equal(
      jaccardSimilarity(normalizeForJaccard(ta), normalizeForJaccard(tb)),
      0.7,
    );
    const items = [
      { original: ta, type: 'decision' as const, meetingPath: 'a.md', text: ta },
      { original: tb, type: 'decision' as const, meetingPath: 'b.md', text: tb },
    ];
    assert.equal(findDuplicates(items).length, 0, 'exactly-0.7 is below the strict-> nomination bar');
  });

  it('boundary: exactly 0.7 lands in the uncertain band; above 0.7 nominates as duplicate', () => {
    const [ta, tb] = textsWithJaccard(7, 10); // 0.7 exactly
    const [tc, td] = textsWithJaccard(9, 10); // 0.9
    const res = nominateCandidates(
      [
        entry({ text: ta, item_id: 'de_001', source_ref: 'resources/meetings/2026-06-08-x.md' }),
        entry({ text: tb, item_id: 'de_002', source_ref: 'resources/meetings/2026-06-09-y.md' }),
      ],
      emptyContext(),
    );
    assert.equal(res.stats.duplicatePairs, 0);
    assert.equal(res.stats.uncertainBandPairs, 1, '0.7-exact pair routes to the uncertain band');

    const res2 = nominateCandidates(
      [
        entry({ text: tc, item_id: 'de_001', source_ref: 'resources/meetings/2026-06-08-x.md' }),
        entry({ text: td, item_id: 'de_002', source_ref: 'resources/meetings/2026-06-09-y.md' }),
      ],
      emptyContext(),
    );
    assert.equal(res2.stats.duplicatePairs, 1);
    const dup = res2.candidates.find((c) => c.kind === 'duplicate');
    assert.ok(dup && dup.kind === 'duplicate');
    assert.equal(dup.canonical.item_id, 'de_001', 'first occurrence wins canonical');
    assert.equal(dup.duplicate.item_id, 'de_002');
  });

  it('uncertain band floor: 0.5 nominated as uncertain-band, below 0.5 not nominated at all', () => {
    assert.equal(UNCERTAIN_BAND_FLOOR, 0.5);
    const [ta, tb] = textsWithJaccard(5, 10); // 0.5 exactly
    const [tc, td] = textsWithJaccard(4, 10); // 0.4
    const inBand = nominateCandidates(
      [entry({ text: ta, item_id: 'de_001' }), entry({ text: tb, item_id: 'de_002', source_ref: 'resources/meetings/2026-06-09-z.md' })],
      emptyContext(),
    );
    assert.equal(inBand.stats.uncertainBandPairs, 1);
    const below = nominateCandidates(
      [entry({ text: tc, item_id: 'de_001' }), entry({ text: td, item_id: 'de_002', source_ref: 'resources/meetings/2026-06-09-z.md' })],
      emptyContext(),
    );
    assert.equal(below.stats.uncertainBandPairs, 0);
    assert.equal(below.candidates.length, 0);
  });

  it('judgment bands are PRESERVED, not unified: completed-task matching keeps its deliberate 0.6', () => {
    // A pair at J ≈ 0.65: NOT a duplicate nomination (bar is >0.7) but DOES
    // match a completed task (bar is >0.6). If someone "unifies" the 0.6
    // into the nomination constant, this test fails — by design (review F2:
    // the bands at 0.6 / 0.5–0.7 are deliberate engine-spec parameters).
    const [itemText, taskText] = textsWithJaccard(13, 20); // J = 0.65
    const items = [
      { original: itemText, type: 'action' as const, meetingPath: 'a.md', text: itemText },
    ];
    const completed = matchCompletedTasks(items, [
      { text: taskText, completedOn: '2026-06-08' },
    ]);
    assert.equal(completed.length, 1, '0.65 matches the completed-task band (0.6)');

    const res = nominateCandidates(
      [
        entry({ text: itemText, item_type: 'action', item_id: 'ai_001' }),
        entry({ text: taskText, item_type: 'action', item_id: 'ai_002', source_ref: 'resources/meetings/2026-06-09-z.md' }),
      ],
      emptyContext(),
    );
    assert.equal(res.stats.duplicatePairs, 0, '0.65 is NOT a duplicate nomination');
    assert.equal(res.stats.uncertainBandPairs, 1, '0.65 routes to the uncertain band instead');
  });

  it('different owners never co-nominate even at identical text (findDuplicates parity)', () => {
    const text = 'send the quarterly compliance report to the auditors';
    const res = nominateCandidates(
      [
        entry({ text, item_type: 'action', item_id: 'ai_001', owner: 'john-koht' }),
        entry({ text, item_type: 'action', item_id: 'ai_002', owner: 'anthony-avina', source_ref: 'resources/meetings/2026-06-09-z.md' }),
      ],
      emptyContext(),
    );
    assert.equal(res.stats.duplicatePairs, 0);
    assert.equal(res.stats.uncertainBandPairs, 0, 'owner guard applies to the band too');
  });
});

// ---------------------------------------------------------------------------
// Claims / memory / completed nomination
// ---------------------------------------------------------------------------

describe('nominateCandidates — claims, memory, completed', () => {
  it('continuation_of / supersedes claims nominate unconditionally as claims-to-verify', () => {
    const res = nominateCandidates(
      [
        entry({ text: 'build automated claim assignment by license profile', item_id: 'de_004', supersedes: 'de_002', tier: 'blocker' }),
        entry({ text: 'migrate webhook retries to the queue', item_type: 'action', item_id: 'ai_007', continuation_of: 'commitment-3f2a' }),
      ],
      emptyContext(),
    );
    const claims = res.candidates.filter((c) => c.kind === 'claimed');
    assert.equal(claims.length, 2);
    assert.deepEqual(
      claims.map((c) => c.kind === 'claimed' && c.claim).sort(),
      ['continuation_of', 'supersedes'],
    );
  });

  it('memory and completed-task matches nominate with their evidence refs', () => {
    const ctx = emptyContext();
    ctx.recentCommittedItems = [
      { text: 'we decided to adopt postgresql over mongodb for the claims store', date: '2026-06-05', source: 'memory/decisions.md' },
    ];
    ctx.completedTasks = [
      { text: 'send sarah the api documentation bundle for the integration', completedOn: '2026-06-08' },
    ];
    const res = nominateCandidates(
      [
        entry({ text: 'we decided to adopt postgresql over mongodb for the claims store', item_id: 'de_001' }),
        entry({ text: 'send sarah the api documentation bundle for the integration', item_type: 'action', item_id: 'ai_001' }),
      ],
      ctx,
    );
    assert.equal(res.stats.memoryMatches, 1);
    assert.equal(res.stats.completedMatches, 1);
    const mem = res.candidates.find((c) => c.kind === 'memory');
    assert.ok(mem && mem.kind === 'memory' && mem.memorySource === 'memory/decisions.md');
    const done = res.candidates.find((c) => c.kind === 'completed');
    assert.ok(done && done.kind === 'completed' && done.completedOn === '2026-06-08');
  });

  it('non-extraction ledger entries (slack/email/workspace-evidence) pass through un-nominated', () => {
    const res = nominateCandidates(
      [
        { kind: 'open-thread', source: 'slack', source_ref: 'C01/p1', text: 'anthony asked about the api spec' },
        { kind: 'workspace-evidence', source: 'jira', source_ref: 'CLAIM-123', text: 'ticket already exists for importer flag' },
        entry({ text: 'file a ticket for the importer flag rollout', item_type: 'action', item_id: 'ai_001' }),
      ],
      emptyContext(),
    );
    assert.equal(res.stats.extractionEntries, 1);
    assert.equal(res.stats.entries, 3);
    // Evidence entries are R3's job to join — nomination only handles
    // extraction-vs-extraction + context matching.
    assert.equal(res.candidates.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Window-coverage invariant
// ---------------------------------------------------------------------------

describe('nominateCandidates — window-coverage (sees ≥ what inline saw)', () => {
  it('every duplicate the inline reconcileMeetingBatch finds is also nominated', () => {
    const recent: MeetingExtractionBatch[] = [
      {
        meetingPath: 'resources/meetings/2026-06-03-planning.md',
        extraction: {
          summary: '',
          nextSteps: [],
          actionItems: [
            { owner: '', ownerSlug: 'john-koht', description: 'draft the snapsheet sunset migration checklist', direction: 'i_owe_them' },
          ],
          decisions: ['we will sunset snapsheet by end of q3'],
          learnings: ['batch imports reduce error rates by forty percent'],
        },
      },
    ];
    const current: MeetingExtractionBatch = {
      meetingPath: 'resources/meetings/2026-06-09-weekly.md',
      extraction: {
        summary: '',
        nextSteps: [],
        actionItems: [
          { owner: '', ownerSlug: 'john-koht', description: 'draft the snapsheet sunset migration checklist', direction: 'i_owe_them' },
        ],
        decisions: ['we will sunset snapsheet by end of q3'],
        learnings: ['completely new learning about adjuster licensing rules'],
      },
    };
    const ctx = emptyContext();

    // Inline path verdicts.
    const inline = reconcileMeetingBatch([...recent, current], ctx);
    const inlineDuplicates = inline.items.filter((i) => i.status === 'duplicate');
    assert.ok(inlineDuplicates.length >= 2, 'fixture sanity: inline finds the action + decision dupes');

    // Nomination over the same window (batch entries first = oldest-first).
    const entries = [...ledgerEntriesFromBatch(recent), ...ledgerEntriesFromBatch([current])];
    const res = nominateCandidates(entries, ctx);

    for (const dup of inlineDuplicates) {
      const text = typeof dup.original === 'string' ? dup.original : dup.original.description;
      const covered = res.candidates.some(
        (c) =>
          (c.kind === 'duplicate' && (c.duplicate.text === text || c.canonical.text === text)) ||
          (c.kind === 'memory' && c.entry.text === text),
      );
      assert.ok(covered, `inline duplicate not covered by nomination: "${text}"`);
    }

    // And canonical placement matches inline's first-occurrence-wins.
    const dupCands = res.candidates.filter((c) => c.kind === 'duplicate');
    for (const c of dupCands) {
      assert.ok(c.kind === 'duplicate');
      assert.equal(c.canonical.source_ref, 'resources/meetings/2026-06-03-planning.md');
      assert.equal(c.duplicate.source_ref, 'resources/meetings/2026-06-09-weekly.md');
    }
  });
});

// ---------------------------------------------------------------------------
// Degraded mode (legacy-shaped input)
// ---------------------------------------------------------------------------

describe('nominateCandidates — degraded mode (legacy-shaped fixture)', () => {
  it('tier-less input still nominates (dupes/memory/completed) and reports degraded: true', () => {
    const ctx = emptyContext();
    ctx.recentCommittedItems = [
      { text: 'we standardized all vendor integrations on the events gateway', date: '2026-06-04', source: 'memory/decisions.md' },
    ];
    // Legacy-shaped: no tier, no uncertain, no claims, no direction —
    // exactly what an extraction_mode: legacy rollback produces.
    const res = nominateCandidates(
      [
        entry({ text: 'we standardized all vendor integrations on the events gateway', item_id: 'de_001' }),
        entry({ text: 'review the genesys vendor demo notes with the cx team', item_type: 'action', item_id: 'ai_001' }),
        entry({ text: 'review the genesys vendor demo notes with the cx team', item_type: 'action', item_id: 'ai_002', source_ref: 'resources/meetings/2026-06-09-z.md' }),
      ],
      ctx,
    );
    assert.equal(res.degraded, true, 'no tier on any extraction entry ⇒ degraded');
    assert.equal(res.stats.memoryMatches, 1, 'memory nomination flows on legacy input');
    assert.equal(res.stats.duplicatePairs, 1, 'duplicate nomination flows on legacy input');
    assert.equal(res.stats.claims, 0);
    // Relevance annotation still computed (sidecar input survives rollback).
    assert.equal(res.relevance.length, 3);
  });

  it('single-pass-shaped input (any tier present) is not degraded', () => {
    const res = nominateCandidates(
      [entry({ text: 'automated license assignment before snapsheet sunset', item_id: 'de_004', tier: 'blocker' })],
      emptyContext(),
    );
    assert.equal(res.degraded, false);
  });

  it('empty / evidence-only ledgers are not flagged degraded', () => {
    assert.equal(nominateCandidates([], emptyContext()).degraded, false);
    const res = nominateCandidates(
      [{ kind: 'open-thread', source: 'slack', source_ref: 'C01/p1', text: 'ping' }],
      emptyContext(),
    );
    assert.equal(res.degraded, false);
  });
});

// ---------------------------------------------------------------------------
// excludePath regression — repointed at the W2 loader pathway
// (loadRecentMeetingBatch IS the W2 loader; these document the strict-===
// contract the CLI's set-membership guard inherits.)
// ---------------------------------------------------------------------------

function createMockStorage(files: Map<string, string>): StorageAdapter {
  return {
    async read(path: string) {
      return files.get(path) ?? null;
    },
    async write(path: string, content: string) {
      files.set(path, content);
    },
    async exists(path: string) {
      return files.has(path);
    },
    async delete(path: string) {
      files.delete(path);
    },
    async list(dir: string, options?: ListOptions) {
      const extensions = options?.extensions ?? [];
      const dirPrefix = dir.endsWith('/') ? dir : dir + '/';
      const results: string[] = [];
      for (const filePath of files.keys()) {
        if (!filePath.startsWith(dirPrefix)) continue;
        if (filePath.slice(dirPrefix.length).includes('/')) continue;
        if (extensions.length > 0 && !extensions.some((ext) => filePath.endsWith(ext))) continue;
        results.push(filePath);
      }
      return results;
    },
    async listSubdirectories() {
      return [];
    },
    async mkdir() {},
    async getModified() {
      return null;
    },
  } as unknown as StorageAdapter;
}

function processedMeeting(decision: string): string {
  return [
    '---',
    'title: "Fixture"',
    'status: processed',
    '---',
    '',
    '## Staged Decisions',
    `- de_001: ${decision}`,
    '',
  ].join('\n');
}

describe('W2 loader — excludePath strict-=== regression (LEARNINGS 2026-04-29)', () => {
  const DIR = '/ws/resources/meetings';
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const realPath = `${DIR}/${iso}-target.md`;

  function storageWithTarget(): StorageAdapter {
    const files = new Map<string, string>();
    files.set(realPath, processedMeeting('decision in the target meeting'));
    files.set(`${DIR}/${iso}-other.md`, processedMeeting('a different decision entirely'));
    return createMockStorage(files);
  }

  it('exact-match excludePath omits the target', async () => {
    const batch = await loadRecentMeetingBatch(storageWithTarget(), DIR, 7, realPath);
    assert.equal(batch.length, 1);
    assert.ok(batch.every((b) => b.meetingPath !== realPath));
  });

  it('`./`-prefixed excludePath does NOT match (documents the strict-=== trap)', async () => {
    // Path differs from what storage.list emits ⇒ self-match guard silently
    // misses and the target stays in the batch. Callers MUST pass paths
    // exactly as storage.list emits them — never normalize/resolve.
    const prefixed = await loadRecentMeetingBatch(storageWithTarget(), DIR, 7, `.${realPath}`);
    assert.equal(prefixed.length, 2, '`./`-prefixed path is not excluded — trap documented');
    assert.ok(prefixed.some((b) => b.meetingPath === realPath));
  });

  it('symlink-style alias excludePath does NOT match (documents the strict-=== trap)', async () => {
    // A symlinked workspace would hand the caller `/sym/...` while
    // storage.list emits `/ws/...` — strict === misses.
    const batch = await loadRecentMeetingBatch(
      storageWithTarget(),
      DIR,
      7,
      `/sym/resources/meetings/${iso}-target.md`,
    );
    assert.equal(batch.length, 2, 'symlink alias is not excluded — trap documented');
    assert.ok(batch.some((b) => b.meetingPath === realPath));
  });

  it('the CLI-side generalization: ledger source_ref set-membership uses the same strict semantics', () => {
    // Mirror of the guard in `arete reconcile nominate`: a ledger that
    // references the meeting by an alias path would NOT filter the on-disk
    // copy. Documented here at the unit level.
    const ledgerPaths = new Set([`./ws/resources/meetings/${iso}-target.md`]);
    assert.equal(ledgerPaths.has(realPath), false, 'alias paths do not match — same trap, set edition');
  });
});
