/**
 * Intelligence routes tests.
 *
 * Tests GET /api/intelligence/patterns and GET /api/commitments.
 * Uses node:test + node:assert/strict.
 *
 * For the patterns route: creates a real temp workspace with meeting .md files,
 * then invokes createIntelligenceRouter directly.
 *
 * For the commitments route: tests the route contract with both empty and
 * populated workspaces.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIntelligenceRouter, createCommitmentsRouter } from '../../src/routes/intelligence.js';

// ── helpers ──────────────────────────────────────────────────────────────────

async function req(
  app: ReturnType<typeof createIntelligenceRouter>,
  method: string,
  path: string,
): Promise<{ status: number; json: unknown }> {
  const res = await app.request(path, { method });
  const json = await res.json() as unknown;
  return { status: res.status, json };
}

// ── patterns route — empty workspace ─────────────────────────────────────────

describe('GET /patterns — empty workspace', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-intelligence-test-'));
    // Create an empty meetings directory
    await mkdir(join(tmpDir, 'resources', 'meetings'), { recursive: true });
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty patterns array for empty workspace', async () => {
    const router = createIntelligenceRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/patterns');
    assert.equal(status, 200);
    const body = json as { success: boolean; patterns: unknown[]; count: number };
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.patterns), 'patterns should be an array');
    assert.equal(body.patterns.length, 0);
    assert.equal(body.count, 0);
  });

  it('accepts ?days=7 query param without error', async () => {
    const router = createIntelligenceRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/patterns?days=7');
    assert.equal(status, 200);
    const body = json as { patterns: unknown[] };
    assert.ok(Array.isArray(body.patterns));
  });

  it('accepts ?days=90 query param without error', async () => {
    const router = createIntelligenceRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/patterns?days=90');
    assert.equal(status, 200);
    const body = json as { patterns: unknown[] };
    assert.ok(Array.isArray(body.patterns));
  });
});

// ── patterns route — non-existent meetings dir ────────────────────────────────

describe('GET /patterns — missing meetings directory', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-intelligence-test-missing-'));
    // Don't create the meetings directory
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty patterns when meetings directory does not exist', async () => {
    const router = createIntelligenceRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/patterns');
    // Should not error — gracefully returns empty
    assert.equal(status, 200);
    const body = json as { patterns: unknown[] };
    assert.ok(Array.isArray(body.patterns));
    assert.equal(body.patterns.length, 0);
  });
});

// ── commitments route ─────────────────────────────────────────────────────────

describe('GET /api/commitments — empty workspace', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-commitments-test-'));
    await mkdir(join(tmpDir, '.arete'), { recursive: true });
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty commitments with pagination metadata when no file exists', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/');
    assert.equal(status, 200);
    const body = json as { commitments: unknown[]; total: number; offset: number; limit: number };
    assert.ok(Array.isArray(body.commitments));
    assert.equal(body.commitments.length, 0);
    assert.equal(body.total, 0);
    assert.equal(body.offset, 0);
    assert.equal(body.limit, 25);
  });
});

describe('GET /api/commitments — with data', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-commitments-data-test-'));
    await mkdir(join(tmpDir, '.arete'), { recursive: true });

    const now = new Date();
    // Overdue: opened 20 days ago
    const overdueDate = new Date(now.getTime() - 20 * 86400000).toISOString().slice(0, 10);
    // This week: opened 3 days ago
    const thisWeekDate = new Date(now.getTime() - 3 * 86400000).toISOString().slice(0, 10);
    // Hot: opened today
    const hotDate = now.toISOString().slice(0, 10);

    const commitments = {
      commitments: [
        {
          id: 'c-overdue',
          text: 'Send contract',
          direction: 'i_owe_them',
          personSlug: 'jane-doe',
          personName: 'Jane Doe',
          source: 'meeting-2026-01-01',
          date: overdueDate,
          status: 'open',
          resolvedAt: null,
        },
        {
          id: 'c-thisweek',
          text: 'Share roadmap',
          direction: 'they_owe_me',
          personSlug: 'bob-smith',
          personName: 'Bob Smith',
          source: 'meeting-2026-01-02',
          date: thisWeekDate,
          status: 'open',
          resolvedAt: null,
        },
        {
          id: 'c-hot',
          text: 'Send notes',
          direction: 'i_owe_them',
          personSlug: 'alice-jones',
          personName: 'Alice Jones',
          source: 'meeting-2026-01-03',
          date: hotDate,
          status: 'open',
          resolvedAt: null,
        },
        {
          id: 'c-resolved',
          text: 'Already done',
          direction: 'i_owe_them',
          personSlug: 'alice-jones',
          personName: 'Alice Jones',
          source: 'meeting-2026-01-04',
          date: hotDate,
          status: 'resolved',
          resolvedAt: hotDate,
        },
      ],
    };

    await writeFile(
      join(tmpDir, '.arete', 'commitments.json'),
      JSON.stringify(commitments),
      'utf8',
    );
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns only open commitments without filter with pagination metadata', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/');
    assert.equal(status, 200);
    const body = json as { commitments: Array<{ id: string; status?: string }>; total: number; offset: number; limit: number };
    // Only 3 open (not the resolved one)
    assert.equal(body.commitments.length, 3);
    assert.equal(body.total, 3);
    assert.equal(body.offset, 0);
    assert.equal(body.limit, 25);
    assert.ok(body.commitments.every((c) => c.id !== 'c-resolved'));
  });

  it('filters overdue commitments (daysOpen > 14)', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/?filter=overdue');
    assert.equal(status, 200);
    const body = json as { commitments: Array<{ id: string; daysOpen: number }> };
    assert.ok(body.commitments.every((c) => c.daysOpen > 14), 'all overdue should have daysOpen > 14');
    assert.ok(body.commitments.some((c) => c.id === 'c-overdue'));
  });

  it('filters thisweek commitments (daysOpen <= 7)', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/?filter=thisweek');
    assert.equal(status, 200);
    const body = json as { commitments: Array<{ id: string; daysOpen: number }> };
    assert.ok(body.commitments.every((c) => c.daysOpen <= 7), 'all thisweek should have daysOpen <= 7');
    // Should include c-thisweek and c-hot (both within 7 days)
    assert.ok(body.commitments.length >= 1);
  });

  it('each commitment item has required fields', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/');
    assert.equal(status, 200);
    const body = json as { commitments: Array<Record<string, unknown>> };
    for (const c of body.commitments) {
      assert.ok(typeof c['id'] === 'string', 'id should be string');
      assert.ok(typeof c['text'] === 'string', 'text should be string');
      assert.ok(typeof c['personSlug'] === 'string', 'personSlug should be string');
      assert.ok(typeof c['direction'] === 'string', 'direction should be string');
      assert.ok(typeof c['date'] === 'string', 'date should be string');
      assert.ok(typeof c['daysOpen'] === 'number', 'daysOpen should be number');
    }
  });

  it('filters by direction=mine (i_owe_them)', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/?direction=mine');
    assert.equal(status, 200);
    const body = json as { commitments: Array<{ id: string; direction: string }> };
    // c-overdue and c-hot have direction i_owe_them
    assert.ok(body.commitments.length >= 1);
    assert.ok(body.commitments.every((c) => c.direction === 'i_owe_them'), 'all should be i_owe_them');
    assert.ok(body.commitments.some((c) => c.id === 'c-overdue' || c.id === 'c-hot'));
  });

  it('filters by direction=theirs (they_owe_me)', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/?direction=theirs');
    assert.equal(status, 200);
    const body = json as { commitments: Array<{ id: string; direction: string }> };
    // c-thisweek has direction they_owe_me
    assert.ok(body.commitments.every((c) => c.direction === 'they_owe_me'), 'all should be they_owe_me');
    assert.ok(body.commitments.some((c) => c.id === 'c-thisweek'));
  });

  it('filters by person slug', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/?person=bob-smith');
    assert.equal(status, 200);
    const body = json as { commitments: Array<{ id: string; personSlug: string }> };
    assert.ok(body.commitments.every((c) => c.personSlug === 'bob-smith'), 'all should be bob-smith');
    assert.equal(body.commitments.length, 1);
    assert.equal(body.commitments[0]?.id, 'c-thisweek');
  });

  it('combines direction and person filters', async () => {
    const router = createCommitmentsRouter(tmpDir);
    // alice-jones has c-hot (i_owe_them) and c-resolved (i_owe_them, but resolved)
    const { status, json } = await req(router, 'GET', '/?direction=mine&person=alice-jones');
    assert.equal(status, 200);
    const body = json as { commitments: Array<{ id: string; personSlug: string; direction: string }> };
    // Only c-hot should match (open + i_owe_them + alice-jones)
    assert.equal(body.commitments.length, 1);
    assert.equal(body.commitments[0]?.id, 'c-hot');
    assert.equal(body.commitments[0]?.direction, 'i_owe_them');
  });

  it('combines filter, direction, and person params', async () => {
    const router = createCommitmentsRouter(tmpDir);
    // filter=all includes resolved, direction=mine, person=alice-jones
    const { status, json } = await req(router, 'GET', '/?filter=all&direction=mine&person=alice-jones');
    assert.equal(status, 200);
    const body = json as { commitments: Array<{ id: string }> };
    // Should include both c-hot and c-resolved
    assert.equal(body.commitments.length, 2);
    const ids = body.commitments.map((c) => c.id);
    assert.ok(ids.includes('c-hot'));
    assert.ok(ids.includes('c-resolved'));
  });

  it('returns empty array when person filter has no matches', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/?person=nonexistent-person');
    assert.equal(status, 200);
    const body = json as { commitments: unknown[] };
    assert.equal(body.commitments.length, 0);
  });
});

// ── commitments summary route (existing) ──────────────────────────────────────

describe('GET /commitments/summary — via intelligence router', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-summary-test-'));
    await mkdir(join(tmpDir, '.arete'), { recursive: true });
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns zero counts when no commitments.json', async () => {
    const router = createIntelligenceRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/commitments/summary');
    assert.equal(status, 200);
    const body = json as { open: number; dueThisWeek: number; overdue: number };
    assert.equal(body.open, 0);
    assert.equal(body.dueThisWeek, 0);
    assert.equal(body.overdue, 0);
  });
});

// ── PATCH /api/commitments/:id ────────────────────────────────────────────────

// ── POST /api/commitments/reconcile ────────────────────────────────────────────

describe('POST /api/commitments/reconcile — scan meetings for completion signals', () => {
  let tmpDir: string;

  const today = new Date().toISOString().slice(0, 10);
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  async function reqPost(
    app: ReturnType<typeof createCommitmentsRouter>,
    path: string,
  ): Promise<{ status: number; json: unknown }> {
    const res = await app.request(path, { method: 'POST' });
    const json = await res.json() as unknown;
    return { status: res.status, json };
  }

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-reconcile-test-'));
    await mkdir(join(tmpDir, '.arete'), { recursive: true });
    await mkdir(join(tmpDir, 'resources', 'meetings'), { recursive: true });

    // Create open commitments
    const commitments = {
      commitments: [
        {
          id: 'c-rec-1',
          text: 'Send the quarterly roadmap update to Alice',
          direction: 'i_owe_them',
          personSlug: 'alice-jones',
          personName: 'Alice Jones',
          source: 'meeting-2026-01-01',
          date: twoDaysAgo,
          status: 'open',
          resolvedAt: null,
        },
        {
          id: 'c-rec-2',
          text: 'Review the API documentation',
          direction: 'i_owe_them',
          personSlug: 'bob-smith',
          personName: 'Bob Smith',
          source: 'meeting-2026-01-02',
          date: twoDaysAgo,
          status: 'open',
          resolvedAt: null,
        },
        {
          id: 'c-rec-3',
          text: 'Schedule a follow-up meeting with Charlie',
          direction: 'i_owe_them',
          personSlug: 'charlie-brown',
          personName: 'Charlie Brown',
          source: 'meeting-2026-01-03',
          date: twoDaysAgo,
          status: 'open',
          resolvedAt: null,
        },
      ],
    };

    await writeFile(
      join(tmpDir, '.arete', 'commitments.json'),
      JSON.stringify(commitments),
      'utf8',
    );

    // Create a recent meeting with completion signals that match c-rec-1
    // Note: Using text that achieves >0.6 Jaccard similarity with commitment text
    // Commitment: "Send the quarterly roadmap update to Alice"
    // Match needs sufficient word overlap for 0.6 threshold
    const recentMeeting = `---
date: ${today}
title: Weekly Sync
attendees:
  - alice-jones
---

## Summary

We completed several action items today. We sent the quarterly roadmap update to Alice as promised.

## Key Points

- Sent the quarterly roadmap update to Alice
- Discussed next quarter planning
`;

    await writeFile(
      join(tmpDir, 'resources', 'meetings', `${today}-weekly-sync.md`),
      recentMeeting,
      'utf8',
    );

    // Create an old meeting (>14 days) that shouldn't be included
    const oldMeeting = `---
date: ${thirtyDaysAgo}
title: Old Meeting
attendees:
  - bob-smith
---

## Summary

Review the API documentation was completed in this meeting.

## Key Points

- Completed API documentation review
`;

    await writeFile(
      join(tmpDir, 'resources', 'meetings', `${thirtyDaysAgo}-old-meeting.md`),
      oldMeeting,
      'utf8',
    );
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns candidates for matching completions in recent meetings', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const { status, json } = await reqPost(router, '/reconcile');
    assert.equal(status, 200);
    
    const body = json as { candidates: Array<{ commitmentId: string; confidence: number }>; count: number };
    assert.ok(Array.isArray(body.candidates), 'candidates should be an array');
    // Should have at least one match for the roadmap commitment
    assert.ok(body.candidates.length > 0, 'should find at least one candidate');
    assert.ok(body.candidates.some((c) => c.commitmentId === 'c-rec-1'), 'should match roadmap commitment');
  });

  it('does not include old meetings (>14 days)', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const { status, json } = await reqPost(router, '/reconcile');
    assert.equal(status, 200);
    
    const body = json as { candidates: Array<{ sourceMeeting: string }> };
    // Should not include the old meeting from 30 days ago
    assert.ok(
      !body.candidates.some((c) => c.sourceMeeting.includes(thirtyDaysAgo)),
      'should not include meetings older than 14 days'
    );
  });

  it('returns candidates with required fields', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const { status, json } = await reqPost(router, '/reconcile');
    assert.equal(status, 200);
    
    const body = json as { candidates: Array<Record<string, unknown>> };
    for (const c of body.candidates) {
      assert.ok(typeof c['commitmentId'] === 'string', 'commitmentId should be string');
      assert.ok(typeof c['commitmentText'] === 'string', 'commitmentText should be string');
      assert.ok(typeof c['personSlug'] === 'string', 'personSlug should be string');
      assert.ok(typeof c['sourceMeeting'] === 'string', 'sourceMeeting should be string');
      assert.ok(typeof c['matchedText'] === 'string', 'matchedText should be string');
      assert.ok(typeof c['confidence'] === 'number', 'confidence should be number');
      assert.ok((c['confidence'] as number) >= 0 && (c['confidence'] as number) <= 1, 'confidence should be 0-1');
    }
  });
});

describe('POST /api/commitments/reconcile — empty workspace', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-reconcile-empty-test-'));
    await mkdir(join(tmpDir, '.arete'), { recursive: true });
    // No meetings directory, no commitments
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty candidates when no meetings directory', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const res = await router.request('/reconcile', { method: 'POST' });
    const json = await res.json() as { candidates: unknown[]; count: number };
    
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(json.candidates));
    assert.equal(json.candidates.length, 0);
    assert.equal(json.count, 0);
  });
});

describe('POST /api/commitments/reconcile — no open commitments', () => {
  let tmpDir: string;

  const today = new Date().toISOString().slice(0, 10);

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-reconcile-noopen-test-'));
    await mkdir(join(tmpDir, '.arete'), { recursive: true });
    await mkdir(join(tmpDir, 'resources', 'meetings'), { recursive: true });

    // All commitments are resolved
    const commitments = {
      commitments: [
        {
          id: 'c-resolved',
          text: 'Send proposal',
          direction: 'i_owe_them',
          personSlug: 'alice-jones',
          personName: 'Alice Jones',
          source: 'meeting-2026-01-01',
          date: today,
          status: 'resolved',
          resolvedAt: today,
        },
      ],
    };

    await writeFile(
      join(tmpDir, '.arete', 'commitments.json'),
      JSON.stringify(commitments),
      'utf8',
    );

    // Create a meeting with text that would match if commitments were open
    const meeting = `---
date: ${today}
title: Test Meeting
attendees:
  - alice-jones
---

## Summary

We sent the proposal to Alice.

## Key Points

- Proposal sent successfully
`;

    await writeFile(
      join(tmpDir, 'resources', 'meetings', `${today}-test-meeting.md`),
      meeting,
      'utf8',
    );
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty candidates when all commitments are resolved', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const res = await router.request('/reconcile', { method: 'POST' });
    const json = await res.json() as { candidates: unknown[]; count: number };
    
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(json.candidates));
    assert.equal(json.candidates.length, 0);
  });
});

describe('PATCH /api/commitments/:id — mark done or drop', () => {
  let tmpDir: string;

  const hotDate = new Date().toISOString().slice(0, 10);

  const sampleCommitments = {
    commitments: [
      {
        id: 'c-patch-1',
        text: 'Send proposal',
        direction: 'i_owe_them',
        personSlug: 'jane-doe',
        personName: 'Jane Doe',
        source: 'meeting-2026-01-01',
        date: hotDate,
        status: 'open',
        resolvedAt: null,
      },
      {
        id: 'c-patch-2',
        text: 'Share roadmap',
        direction: 'they_owe_me',
        personSlug: 'bob-smith',
        personName: 'Bob Smith',
        source: 'meeting-2026-01-02',
        date: hotDate,
        status: 'open',
        resolvedAt: null,
      },
    ],
  };

  async function reqPatch(
    app: ReturnType<typeof createCommitmentsRouter>,
    id: string,
    body: unknown,
  ): Promise<{ status: number; json: unknown }> {
    const res = await app.request(`/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json() as unknown;
    return { status: res.status, json };
  }

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-commitments-patch-test-'));
    await mkdir(join(tmpDir, '.arete'), { recursive: true });
    await writeFile(
      join(tmpDir, '.arete', 'commitments.json'),
      JSON.stringify(sampleCommitments),
      'utf8',
    );
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('marks a commitment as resolved', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const { status, json } = await reqPatch(router, 'c-patch-1', { status: 'resolved' });
    assert.equal(status, 200);
    const body = json as { commitment: { id: string; status: string; resolvedAt: string | null } };
    assert.equal(body.commitment.id, 'c-patch-1');
    assert.equal(body.commitment.status, 'resolved');
    assert.ok(body.commitment.resolvedAt !== null, 'resolvedAt should be set');
    assert.ok(
      typeof body.commitment.resolvedAt === 'string' && body.commitment.resolvedAt.length > 0,
      'resolvedAt should be an ISO timestamp string',
    );
  });

  it('marks a commitment as dropped', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const { status, json } = await reqPatch(router, 'c-patch-2', { status: 'dropped' });
    assert.equal(status, 200);
    const body = json as { commitment: { id: string; status: string } };
    assert.equal(body.commitment.status, 'dropped');
  });

  it('returns 404 for unknown commitment id', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const { status } = await reqPatch(router, 'nonexistent-id', { status: 'resolved' });
    assert.equal(status, 404);
  });

  it('returns 400 for invalid status value', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const { status } = await reqPatch(router, 'c-patch-1', { status: 'invalid' });
    assert.equal(status, 400);
  });

  it('persists the update to commitments.json', async () => {
    // Read the file and verify c-patch-1 was updated
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(join(tmpDir, '.arete', 'commitments.json'), 'utf8');
    const data = JSON.parse(raw) as {
      commitments: Array<{ id: string; status: string; resolvedAt: string | null }>;
    };
    const c1 = data.commitments.find((c) => c.id === 'c-patch-1');
    assert.ok(c1, 'c-patch-1 should exist in file');
    assert.equal(c1.status, 'resolved');
    assert.ok(c1.resolvedAt !== null);
  });
});

// ── commitments pagination tests ──────────────────────────────────────────────

describe('GET /api/commitments — pagination', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-commitments-pagination-test-'));
    await mkdir(join(tmpDir, '.arete'), { recursive: true });

    const now = new Date();
    const commitments = {
      commitments: Array.from({ length: 10 }, (_, i) => ({
        id: `c-page-${i + 1}`,
        text: `Commitment ${i + 1}`,
        direction: 'i_owe_them',
        personSlug: 'jane-doe',
        personName: 'Jane Doe',
        source: `meeting-${i}`,
        date: new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10),
        status: 'open',
        resolvedAt: null,
      })),
    };

    await writeFile(
      join(tmpDir, '.arete', 'commitments.json'),
      JSON.stringify(commitments),
      'utf8',
    );
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('respects limit and offset query params', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/?limit=3&offset=2');
    assert.equal(status, 200);
    const body = json as { commitments: Array<{ id: string }>; total: number; offset: number; limit: number };
    assert.equal(body.commitments.length, 3);
    assert.equal(body.total, 10);
    assert.equal(body.offset, 2);
    assert.equal(body.limit, 3);
  });

  it('caps limit at 100', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/?limit=200');
    assert.equal(status, 200);
    const body = json as { limit: number };
    assert.equal(body.limit, 100);
  });

  it('uses default limit of 25', async () => {
    const router = createCommitmentsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/');
    assert.equal(status, 200);
    const body = json as { limit: number };
    assert.equal(body.limit, 25);
  });

  it('total reflects filtered count before pagination', async () => {
    const router = createCommitmentsRouter(tmpDir);
    // Filter by direction, which should reduce the total
    const { status, json } = await req(router, 'GET', '/?limit=2&offset=0');
    assert.equal(status, 200);
    const body = json as { commitments: unknown[]; total: number };
    assert.equal(body.commitments.length, 2);
    assert.equal(body.total, 10); // total is all matching items, not just the page
  });
});
