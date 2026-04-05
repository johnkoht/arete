/**
 * Backend review routes tests.
 *
 * Uses node:test + node:assert/strict.
 * Mocks services — no real file I/O.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';

// ──────────────────────────────────────────────────────────────────────────────
// Mock types
// ──────────────────────────────────────────────────────────────────────────────

type MockTask = {
  id: string;
  text: string;
  completed: boolean;
  metadata: Record<string, unknown>;
  source: { file: string; section: string };
};

type MockCommitment = {
  id: string;
  text: string;
  direction: string;
  personSlug: string;
  personName: string;
  source: string;
  date: string;
  status: string;
  resolvedAt: string | null;
};

type MockMeetingSummary = {
  slug: string;
  title: string;
  date: string;
  status: string;
};

type MockStagedItem = {
  id: string;
  text: string;
  type: 'ai' | 'de' | 'le';
  source?: 'ai' | 'dedup' | 'reconciled';
  confidence?: number;
};

type MockFullMeeting = {
  slug: string;
  title: string;
  date: string;
  status: string;
  stagedSections: {
    actionItems: MockStagedItem[];
    decisions: MockStagedItem[];
    learnings: MockStagedItem[];
  };
  stagedItemStatus: Record<string, string>;
};

// ──────────────────────────────────────────────────────────────────────────────
// Mock factories
// ──────────────────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<MockTask> = {}): MockTask {
  return {
    id: 'task_001',
    text: 'Review PR',
    completed: false,
    metadata: {},
    source: { file: '/now/week.md', section: '## Inbox' },
    ...overrides,
  };
}

function makeCommitment(overrides: Partial<MockCommitment> = {}): MockCommitment {
  return {
    id: 'abc12345',
    text: 'Send follow-up email',
    direction: 'i_owe_them',
    personSlug: 'jane-doe',
    personName: 'Jane Doe',
    source: 'meeting-2024-01-15',
    date: '2024-01-15',
    status: 'open',
    resolvedAt: null,
    ...overrides,
  };
}

function makeMeetingSummary(overrides: Partial<MockMeetingSummary> = {}): MockMeetingSummary {
  return {
    slug: '2024-01-15-team-standup',
    title: 'Team Standup',
    date: '2024-01-15',
    status: 'processed',
    ...overrides,
  };
}

function makeFullMeeting(overrides: Partial<MockFullMeeting> = {}): MockFullMeeting {
  return {
    slug: '2024-01-15-team-standup',
    title: 'Team Standup',
    date: '2024-01-15',
    status: 'processed',
    stagedSections: {
      actionItems: [],
      decisions: [],
      learnings: [],
    },
    stagedItemStatus: {},
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Test app builder
// ──────────────────────────────────────────────────────────────────────────────

type MockServices = {
  listTasks?: (opts?: { destination?: string }) => Promise<MockTask[]>;
  listOpenCommitments?: () => Promise<MockCommitment[]>;
  listMeetings?: () => Promise<MockMeetingSummary[]>;
  getMeeting?: (slug: string) => Promise<MockFullMeeting | null>;
  readFile?: (path: string) => Promise<string | null>;
  writeFile?: (path: string, content: string) => Promise<void>;
};

function buildTestApp(mocks: MockServices = {}) {
  const app = new Hono();

  const taskService = {
    listTasks: mocks.listTasks ?? (() => Promise.resolve([])),
  };

  const commitmentsService = {
    listOpen: mocks.listOpenCommitments ?? (() => Promise.resolve([])),
  };

  const workspaceService = {
    listMeetings: mocks.listMeetings ?? (() => Promise.resolve([])),
    getMeeting: mocks.getMeeting ?? (() => Promise.resolve(null)),
  };

  const storage = {
    read: mocks.readFile ?? (() => Promise.resolve(null)),
    write: mocks.writeFile ?? (() => Promise.resolve()),
  };

  // GET /api/review/pending
  app.get('/api/review/pending', async (c) => {
    try {
      // 1. Get inbox tasks
      const tasks = await taskService.listTasks({ destination: 'inbox' });

      // 2. List all meetings and filter to 'processed' status
      const allMeetings = await workspaceService.listMeetings();
      const processedMeetings = allMeetings.filter((m) => m.status === 'processed');

      // Build set of processed meeting slugs for filtering
      const processedMeetingSlugs = new Set(processedMeetings.map((m) => m.slug));

      // 3. Get open commitments — filter to only those from processed meetings
      const allCommitments = await commitmentsService.listOpen();
      const commitments = allCommitments.filter((c) => {
        // source format is "meeting:slug" — extract slug and check if it's processed
        if (c.source.startsWith('meeting:')) {
          const meetingSlug = c.source.slice('meeting:'.length);
          return processedMeetingSlugs.has(meetingSlug);
        }
        return false;
      });

      // 4. Get staged decisions/learnings from processed meetings
      const decisions: unknown[] = [];
      const learnings: unknown[] = [];

      for (const meeting of processedMeetings) {
        const fullMeeting = await workspaceService.getMeeting(meeting.slug);
        if (!fullMeeting) continue;

        const stagedItemStatus = fullMeeting.stagedItemStatus ?? {};

        for (const item of fullMeeting.stagedSections.decisions) {
          const status = stagedItemStatus[item.id];
          if (status === 'pending' || status === undefined) {
            decisions.push({
              id: item.id,
              text: item.text,
              type: 'decision',
              meetingSlug: meeting.slug,
              meetingTitle: meeting.title,
              meetingDate: meeting.date,
              source: item.source,
              confidence: item.confidence,
            });
          }
        }

        for (const item of fullMeeting.stagedSections.learnings) {
          const status = stagedItemStatus[item.id];
          if (status === 'pending' || status === undefined) {
            learnings.push({
              id: item.id,
              text: item.text,
              type: 'learning',
              meetingSlug: meeting.slug,
              meetingTitle: meeting.title,
              meetingDate: meeting.date,
              source: item.source,
              confidence: item.confidence,
            });
          }
        }
      }

      return c.json({ tasks, decisions, learnings, commitments });
    } catch (err) {
      console.error('[review] pending error:', err);
      return c.json({ error: 'Failed to load pending review items' }, 500);
    }
  });

  // GET /api/review/auto-approve-preview
  app.get('/api/review/auto-approve-preview', async (c) => {
    try {
      const thresholdParam = c.req.query('threshold');
      const threshold = thresholdParam !== undefined ? parseFloat(thresholdParam) : 0.8;

      const allMeetings = await workspaceService.listMeetings();
      const processedMeetings = allMeetings.filter((m) => m.status === 'processed');

      type QualifyingMeeting = { slug: string; title: string; itemCount: number };
      const qualifyingMeetings: QualifyingMeeting[] = [];

      for (const meeting of processedMeetings) {
        const fullMeeting = await workspaceService.getMeeting(meeting.slug);
        if (!fullMeeting) continue;

        const stagedItemStatus = fullMeeting.stagedItemStatus ?? {};

        // Collect all pending items (decisions + learnings)
        const pendingItems: MockStagedItem[] = [];

        for (const item of fullMeeting.stagedSections.decisions) {
          const status = stagedItemStatus[item.id];
          if (status === 'pending' || status === undefined) {
            pendingItems.push(item);
          }
        }

        for (const item of fullMeeting.stagedSections.learnings) {
          const status = stagedItemStatus[item.id];
          if (status === 'pending' || status === undefined) {
            pendingItems.push(item);
          }
        }

        // No pending items → skip (meeting is already fully reviewed)
        if (pendingItems.length === 0) continue;

        // All pending items must have confidence >= threshold
        const allQualify = pendingItems.every(
          (item) => item.confidence !== undefined && item.confidence >= threshold
        );

        if (allQualify) {
          qualifyingMeetings.push({
            slug: fullMeeting.slug,
            title: fullMeeting.title,
            itemCount: pendingItems.length,
          });
        }
      }

      const totalItems = qualifyingMeetings.reduce((sum, m) => sum + m.itemCount, 0);
      return c.json({ meetings: qualifyingMeetings, totalItems });
    } catch (err) {
      console.error('[review] auto-approve-preview error:', err);
      return c.json({ error: 'Failed to compute auto-approve preview' }, 500);
    }
  });

  // POST /api/review/complete
  app.post('/api/review/complete', async (c) => {
    try {
      const body = (await c.req.json()) as {
        sessionId?: string;
        approved?: unknown;
        skipped?: unknown;
      };

      // Validate request body
      if (!body.sessionId || typeof body.sessionId !== 'string') {
        return c.json({ error: 'sessionId is required' }, 400);
      }
      if (!Array.isArray(body.approved)) {
        return c.json({ error: 'approved must be an array' }, 400);
      }
      if (!Array.isArray(body.skipped)) {
        return c.json({ error: 'skipped must be an array' }, 400);
      }

      const sessionId = body.sessionId;
      const sessionFile = `/fake/.arete/.review-session-${sessionId}`;
      const completeFile = `/fake/.arete/.review-complete-${sessionId}`;

      // Validate session file exists
      const sessionExists = await storage.read(sessionFile);
      if (sessionExists === null) {
        return c.json({ error: `Session not found: ${sessionId}` }, 400);
      }

      // Write completion file
      const completionData = {
        sessionId,
        approved: body.approved,
        skipped: body.skipped,
        completedAt: new Date().toISOString(),
      };

      await storage.write(completeFile, JSON.stringify(completionData, null, 2));

      return c.json({ success: true });
    } catch (err) {
      console.error('[review] complete error:', err);
      return c.json({ error: 'Failed to complete review session' }, 500);
    }
  });

  return app;
}

async function req(
  app: Hono,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = {};
  let bodyStr: string | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyStr = JSON.stringify(body);
  }
  const res = await app.request(path, { method, headers, body: bodyStr });
  const json = (await res.json()) as unknown;
  return { status: res.status, json };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /api/review/pending', () => {
  it('returns empty arrays when no pending items', async () => {
    const app = buildTestApp();
    const { status, json } = await req(app, 'GET', '/api/review/pending');

    assert.equal(status, 200);
    const body = json as { tasks: unknown[]; decisions: unknown[]; learnings: unknown[]; commitments: unknown[] };
    assert.deepEqual(body.tasks, []);
    assert.deepEqual(body.decisions, []);
    assert.deepEqual(body.learnings, []);
    assert.deepEqual(body.commitments, []);
  });

  it('returns inbox tasks', async () => {
    const task = makeTask({ id: 'task_inbox', text: 'Inbox item' });
    const app = buildTestApp({
      listTasks: () => Promise.resolve([task]),
    });

    const { status, json } = await req(app, 'GET', '/api/review/pending');

    assert.equal(status, 200);
    const body = json as { tasks: MockTask[] };
    assert.equal(body.tasks.length, 1);
    assert.equal(body.tasks[0].id, 'task_inbox');
    assert.equal(body.tasks[0].text, 'Inbox item');
  });

  it('returns commitments from processed meetings', async () => {
    const processedMeeting = makeMeetingSummary({ slug: '2024-01-15-standup', status: 'processed' });
    const commitment = makeCommitment({
      id: 'commit_001',
      text: 'Follow up with client',
      source: 'meeting:2024-01-15-standup',
    });
    const app = buildTestApp({
      listMeetings: () => Promise.resolve([processedMeeting]),
      listOpenCommitments: () => Promise.resolve([commitment]),
    });

    const { status, json } = await req(app, 'GET', '/api/review/pending');

    assert.equal(status, 200);
    const body = json as { commitments: MockCommitment[] };
    assert.equal(body.commitments.length, 1);
    assert.equal(body.commitments[0].id, 'commit_001');
    assert.equal(body.commitments[0].text, 'Follow up with client');
  });

  it('filters out commitments not from processed meetings', async () => {
    // One processed meeting, one synced (not processed) meeting
    const processedMeeting = makeMeetingSummary({ slug: '2024-01-15-standup', status: 'processed' });
    const syncedMeeting = makeMeetingSummary({ slug: '2024-01-16-review', status: 'synced' });

    // Commitments from different sources
    const commitmentFromProcessed = makeCommitment({
      id: 'c1',
      text: 'From processed meeting',
      source: 'meeting:2024-01-15-standup',
    });
    const commitmentFromSynced = makeCommitment({
      id: 'c2',
      text: 'From synced meeting',
      source: 'meeting:2024-01-16-review',
    });
    const commitmentManual = makeCommitment({
      id: 'c3',
      text: 'Manual commitment',
      source: 'manual',
    });
    const commitmentOldFormat = makeCommitment({
      id: 'c4',
      text: 'Old format source',
      source: 'meeting-2024-01-10', // old format without colon
    });

    const app = buildTestApp({
      listMeetings: () => Promise.resolve([processedMeeting, syncedMeeting]),
      listOpenCommitments: () =>
        Promise.resolve([commitmentFromProcessed, commitmentFromSynced, commitmentManual, commitmentOldFormat]),
    });

    const { status, json } = await req(app, 'GET', '/api/review/pending');

    assert.equal(status, 200);
    const body = json as { commitments: MockCommitment[] };
    // Only the commitment from the processed meeting should be included
    assert.equal(body.commitments.length, 1);
    assert.equal(body.commitments[0].id, 'c1');
    assert.equal(body.commitments[0].text, 'From processed meeting');
  });

  it('returns staged decisions from processed meetings', async () => {
    const meeting = makeMeetingSummary({ slug: 'meeting-1', status: 'processed' });
    const fullMeeting = makeFullMeeting({
      slug: 'meeting-1',
      title: 'Planning Meeting',
      date: '2024-01-20',
      stagedSections: {
        actionItems: [],
        decisions: [
          { id: 'de_001', text: 'Use TypeScript for new project', type: 'de', source: 'ai', confidence: 0.9 },
        ],
        learnings: [],
      },
      stagedItemStatus: { de_001: 'pending' },
    });

    const app = buildTestApp({
      listMeetings: () => Promise.resolve([meeting]),
      getMeeting: () => Promise.resolve(fullMeeting),
    });

    const { status, json } = await req(app, 'GET', '/api/review/pending');

    assert.equal(status, 200);
    const body = json as { decisions: Array<{ id: string; text: string; meetingSlug: string }> };
    assert.equal(body.decisions.length, 1);
    assert.equal(body.decisions[0].id, 'de_001');
    assert.equal(body.decisions[0].text, 'Use TypeScript for new project');
    assert.equal(body.decisions[0].meetingSlug, 'meeting-1');
  });

  it('returns staged learnings from processed meetings', async () => {
    const meeting = makeMeetingSummary({ slug: 'meeting-2', status: 'processed' });
    const fullMeeting = makeFullMeeting({
      slug: 'meeting-2',
      title: 'Retro Meeting',
      date: '2024-01-21',
      stagedSections: {
        actionItems: [],
        decisions: [],
        learnings: [
          { id: 'le_001', text: 'Daily standups improve team sync', type: 'le', source: 'ai' },
        ],
      },
      stagedItemStatus: {}, // undefined status = pending
    });

    const app = buildTestApp({
      listMeetings: () => Promise.resolve([meeting]),
      getMeeting: () => Promise.resolve(fullMeeting),
    });

    const { status, json } = await req(app, 'GET', '/api/review/pending');

    assert.equal(status, 200);
    const body = json as { learnings: Array<{ id: string; text: string; type: string }> };
    assert.equal(body.learnings.length, 1);
    assert.equal(body.learnings[0].id, 'le_001');
    assert.equal(body.learnings[0].type, 'learning');
  });

  it('excludes approved/skipped items from staged sections', async () => {
    const meeting = makeMeetingSummary({ slug: 'meeting-3', status: 'processed' });
    const fullMeeting = makeFullMeeting({
      slug: 'meeting-3',
      stagedSections: {
        actionItems: [],
        decisions: [
          { id: 'de_001', text: 'Approved decision', type: 'de' },
          { id: 'de_002', text: 'Skipped decision', type: 'de' },
          { id: 'de_003', text: 'Pending decision', type: 'de' },
        ],
        learnings: [],
      },
      stagedItemStatus: {
        de_001: 'approved',
        de_002: 'skipped',
        de_003: 'pending',
      },
    });

    const app = buildTestApp({
      listMeetings: () => Promise.resolve([meeting]),
      getMeeting: () => Promise.resolve(fullMeeting),
    });

    const { status, json } = await req(app, 'GET', '/api/review/pending');

    assert.equal(status, 200);
    const body = json as { decisions: Array<{ id: string }> };
    assert.equal(body.decisions.length, 1);
    assert.equal(body.decisions[0].id, 'de_003');
  });

  it('skips non-processed meetings', async () => {
    const syncedMeeting = makeMeetingSummary({ slug: 'synced', status: 'synced' });
    const approvedMeeting = makeMeetingSummary({ slug: 'approved', status: 'approved' });
    const processedMeeting = makeMeetingSummary({ slug: 'processed', status: 'processed' });

    const processedFull = makeFullMeeting({
      slug: 'processed',
      stagedSections: {
        actionItems: [],
        decisions: [{ id: 'de_001', text: 'Only from processed', type: 'de' }],
        learnings: [],
      },
      stagedItemStatus: {},
    });

    const app = buildTestApp({
      listMeetings: () => Promise.resolve([syncedMeeting, approvedMeeting, processedMeeting]),
      getMeeting: (slug) => {
        if (slug === 'processed') return Promise.resolve(processedFull);
        return Promise.resolve(null);
      },
    });

    const { status, json } = await req(app, 'GET', '/api/review/pending');

    assert.equal(status, 200);
    const body = json as { decisions: Array<{ id: string }> };
    assert.equal(body.decisions.length, 1);
    assert.equal(body.decisions[0].id, 'de_001');
  });
});

describe('GET /api/review/auto-approve-preview', () => {
  it('returns empty when no processed meetings', async () => {
    const app = buildTestApp();
    const { status, json } = await req(app, 'GET', '/api/review/auto-approve-preview');

    assert.equal(status, 200);
    const body = json as { meetings: unknown[]; totalItems: number };
    assert.deepEqual(body.meetings, []);
    assert.equal(body.totalItems, 0);
  });

  it('returns qualifying meetings where all items have confidence >= 0.8', async () => {
    const meeting = makeMeetingSummary({ slug: 'high-conf-meeting', status: 'processed' });
    const fullMeeting = makeFullMeeting({
      slug: 'high-conf-meeting',
      title: 'High Confidence Meeting',
      date: '2024-01-20',
      stagedSections: {
        actionItems: [],
        decisions: [
          { id: 'de_001', text: 'Decision A', type: 'de', source: 'ai', confidence: 0.9 },
          { id: 'de_002', text: 'Decision B', type: 'de', source: 'ai', confidence: 0.85 },
        ],
        learnings: [
          { id: 'le_001', text: 'Learning A', type: 'le', source: 'ai', confidence: 0.95 },
        ],
      },
      stagedItemStatus: {},
    });

    const app = buildTestApp({
      listMeetings: () => Promise.resolve([meeting]),
      getMeeting: () => Promise.resolve(fullMeeting),
    });

    const { status, json } = await req(app, 'GET', '/api/review/auto-approve-preview');

    assert.equal(status, 200);
    const body = json as { meetings: Array<{ slug: string; title: string; itemCount: number }>; totalItems: number };
    assert.equal(body.meetings.length, 1);
    assert.equal(body.meetings[0].slug, 'high-conf-meeting');
    assert.equal(body.meetings[0].title, 'High Confidence Meeting');
    assert.equal(body.meetings[0].itemCount, 3);
    assert.equal(body.totalItems, 3);
  });

  it('excludes meetings where any item has confidence below 0.8', async () => {
    const meeting = makeMeetingSummary({ slug: 'mixed-conf-meeting', status: 'processed' });
    const fullMeeting = makeFullMeeting({
      slug: 'mixed-conf-meeting',
      title: 'Mixed Confidence Meeting',
      date: '2024-01-20',
      stagedSections: {
        actionItems: [],
        decisions: [
          { id: 'de_001', text: 'High confidence', type: 'de', source: 'ai', confidence: 0.9 },
          { id: 'de_002', text: 'Low confidence', type: 'de', source: 'ai', confidence: 0.6 },
        ],
        learnings: [],
      },
      stagedItemStatus: {},
    });

    const app = buildTestApp({
      listMeetings: () => Promise.resolve([meeting]),
      getMeeting: () => Promise.resolve(fullMeeting),
    });

    const { status, json } = await req(app, 'GET', '/api/review/auto-approve-preview');

    assert.equal(status, 200);
    const body = json as { meetings: unknown[]; totalItems: number };
    assert.equal(body.meetings.length, 0);
    assert.equal(body.totalItems, 0);
  });

  it('excludes meetings where any item has no confidence score', async () => {
    const meeting = makeMeetingSummary({ slug: 'no-conf-meeting', status: 'processed' });
    const fullMeeting = makeFullMeeting({
      slug: 'no-conf-meeting',
      title: 'No Confidence Meeting',
      date: '2024-01-20',
      stagedSections: {
        actionItems: [],
        decisions: [
          { id: 'de_001', text: 'Has confidence', type: 'de', source: 'ai', confidence: 0.9 },
          { id: 'de_002', text: 'No confidence', type: 'de', source: 'ai' /* no confidence */ },
        ],
        learnings: [],
      },
      stagedItemStatus: {},
    });

    const app = buildTestApp({
      listMeetings: () => Promise.resolve([meeting]),
      getMeeting: () => Promise.resolve(fullMeeting),
    });

    const { status, json } = await req(app, 'GET', '/api/review/auto-approve-preview');

    assert.equal(status, 200);
    const body = json as { meetings: unknown[]; totalItems: number };
    assert.equal(body.meetings.length, 0);
    assert.equal(body.totalItems, 0);
  });

  it('excludes meetings with no pending items (already all decided)', async () => {
    const meeting = makeMeetingSummary({ slug: 'all-decided', status: 'processed' });
    const fullMeeting = makeFullMeeting({
      slug: 'all-decided',
      title: 'All Decided Meeting',
      date: '2024-01-20',
      stagedSections: {
        actionItems: [],
        decisions: [
          { id: 'de_001', text: 'Already approved', type: 'de', source: 'ai', confidence: 0.95 },
        ],
        learnings: [],
      },
      stagedItemStatus: { de_001: 'approved' }, // Already decided
    });

    const app = buildTestApp({
      listMeetings: () => Promise.resolve([meeting]),
      getMeeting: () => Promise.resolve(fullMeeting),
    });

    const { status, json } = await req(app, 'GET', '/api/review/auto-approve-preview');

    assert.equal(status, 200);
    const body = json as { meetings: unknown[]; totalItems: number };
    assert.equal(body.meetings.length, 0);
    assert.equal(body.totalItems, 0);
  });

  it('returns multiple qualifying meetings', async () => {
    const m1 = makeMeetingSummary({ slug: 'meeting-1', status: 'processed' });
    const m2 = makeMeetingSummary({ slug: 'meeting-2', status: 'processed' });
    const full1 = makeFullMeeting({
      slug: 'meeting-1',
      title: 'Meeting One',
      date: '2024-01-18',
      stagedSections: {
        actionItems: [],
        decisions: [{ id: 'de_a', text: 'D1', type: 'de', source: 'ai', confidence: 0.9 }],
        learnings: [],
      },
      stagedItemStatus: {},
    });
    const full2 = makeFullMeeting({
      slug: 'meeting-2',
      title: 'Meeting Two',
      date: '2024-01-19',
      stagedSections: {
        actionItems: [],
        decisions: [],
        learnings: [{ id: 'le_b', text: 'L1', type: 'le', source: 'ai', confidence: 0.85 }],
      },
      stagedItemStatus: {},
    });

    const app = buildTestApp({
      listMeetings: () => Promise.resolve([m1, m2]),
      getMeeting: (slug) => {
        if (slug === 'meeting-1') return Promise.resolve(full1);
        if (slug === 'meeting-2') return Promise.resolve(full2);
        return Promise.resolve(null);
      },
    });

    const { status, json } = await req(app, 'GET', '/api/review/auto-approve-preview');

    assert.equal(status, 200);
    const body = json as { meetings: Array<{ slug: string }>; totalItems: number };
    assert.equal(body.meetings.length, 2);
    assert.equal(body.totalItems, 2);
  });

  it('uses custom threshold from query param', async () => {
    const meeting = makeMeetingSummary({ slug: 'borderline-meeting', status: 'processed' });
    const fullMeeting = makeFullMeeting({
      slug: 'borderline-meeting',
      title: 'Borderline Meeting',
      date: '2024-01-20',
      stagedSections: {
        actionItems: [],
        decisions: [
          { id: 'de_001', text: 'Borderline', type: 'de', source: 'ai', confidence: 0.75 },
        ],
        learnings: [],
      },
      stagedItemStatus: {},
    });

    const app = buildTestApp({
      listMeetings: () => Promise.resolve([meeting]),
      getMeeting: () => Promise.resolve(fullMeeting),
    });

    // With default threshold (0.8), meeting should NOT qualify
    const { status: s1, json: j1 } = await req(app, 'GET', '/api/review/auto-approve-preview');
    assert.equal(s1, 200);
    const body1 = j1 as { meetings: unknown[] };
    assert.equal(body1.meetings.length, 0);

    // With lower threshold (0.7), meeting should qualify
    const { status: s2, json: j2 } = await req(app, 'GET', '/api/review/auto-approve-preview?threshold=0.7');
    assert.equal(s2, 200);
    const body2 = j2 as { meetings: Array<{ slug: string }> };
    assert.equal(body2.meetings.length, 1);
    assert.equal(body2.meetings[0].slug, 'borderline-meeting');
  });
});

describe('POST /api/review/complete', () => {
  it('returns 400 when sessionId is missing', async () => {
    const app = buildTestApp();
    const { status, json } = await req(app, 'POST', '/api/review/complete', {
      approved: [],
      skipped: [],
    });

    assert.equal(status, 400);
    const body = json as { error: string };
    assert.equal(body.error, 'sessionId is required');
  });

  it('returns 400 when approved is not an array', async () => {
    const app = buildTestApp();
    const { status, json } = await req(app, 'POST', '/api/review/complete', {
      sessionId: 'test-session',
      approved: 'not-an-array',
      skipped: [],
    });

    assert.equal(status, 400);
    const body = json as { error: string };
    assert.equal(body.error, 'approved must be an array');
  });

  it('returns 400 when skipped is not an array', async () => {
    const app = buildTestApp();
    const { status, json } = await req(app, 'POST', '/api/review/complete', {
      sessionId: 'test-session',
      approved: [],
      skipped: 'not-an-array',
    });

    assert.equal(status, 400);
    const body = json as { error: string };
    assert.equal(body.error, 'skipped must be an array');
  });

  it('returns 400 when session file does not exist', async () => {
    const app = buildTestApp({
      readFile: () => Promise.resolve(null), // Session file not found
    });

    const { status, json } = await req(app, 'POST', '/api/review/complete', {
      sessionId: 'nonexistent-session',
      approved: ['item1'],
      skipped: [],
    });

    assert.equal(status, 400);
    const body = json as { error: string };
    assert.ok(body.error.includes('Session not found'));
    assert.ok(body.error.includes('nonexistent-session'));
  });

  it('writes completion file and returns success', async () => {
    let writtenPath: string | null = null;
    let writtenContent: string | null = null;

    const app = buildTestApp({
      readFile: (path) => {
        if (path.includes('.review-session-valid-session')) {
          return Promise.resolve('{}'); // Session exists
        }
        return Promise.resolve(null);
      },
      writeFile: (path, content) => {
        writtenPath = path;
        writtenContent = content;
        return Promise.resolve();
      },
    });

    const { status, json } = await req(app, 'POST', '/api/review/complete', {
      sessionId: 'valid-session',
      approved: ['task_001', 'de_002'],
      skipped: ['le_001'],
    });

    assert.equal(status, 200);
    const body = json as { success: boolean };
    assert.equal(body.success, true);

    // Verify the file was written
    assert.ok((writtenPath as string | null)?.includes('.review-complete-valid-session'));
    assert.ok(writtenContent !== null);

    const parsed = JSON.parse(writtenContent!) as {
      sessionId: string;
      approved: string[];
      skipped: string[];
      completedAt: string;
    };
    assert.equal(parsed.sessionId, 'valid-session');
    assert.deepEqual(parsed.approved, ['task_001', 'de_002']);
    assert.deepEqual(parsed.skipped, ['le_001']);
    assert.ok(parsed.completedAt); // ISO timestamp present
  });
});
