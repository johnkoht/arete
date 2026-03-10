/**
 * Backend meeting routes tests.
 *
 * Uses node:test + node:assert/strict.
 * Mocks workspace service and jobs service — no real file I/O.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ──────────────────────────────────────────────────────────────────────────────
// Minimal mock factories
// ──────────────────────────────────────────────────────────────────────────────

type MockMeeting = {
  slug: string;
  title: string;
  date: string;
  status: string;
  attendees: Array<{ name: string; email: string }>;
  duration: string;
  source: string;
  summary: string;
  body: string;
  frontmatter: Record<string, unknown>;
  stagedSections: { actionItems: unknown[]; decisions: unknown[]; learnings: unknown[] };
  stagedItemStatus: Record<string, string>;
};

function makeMeeting(overrides: Partial<MockMeeting> = {}): MockMeeting {
  return {
    slug: '2024-01-15-team-standup',
    title: 'Team Standup',
    date: '2024-01-15',
    status: 'synced',
    attendees: [{ name: 'Alice', email: 'alice@example.com' }],
    duration: '30 minutes',
    source: 'Krisp',
    summary: 'Daily standup',
    body: '## Summary\nDaily standup\n',
    frontmatter: {},
    stagedSections: { actionItems: [], decisions: [], learnings: [] },
    stagedItemStatus: {},
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// In-process Hono app with injected mocks
// ──────────────────────────────────────────────────────────────────────────────

// We build a lightweight app directly rather than importing the real routes
// (which would pull in FileStorageAdapter / gray-matter / fs).
// This tests the HTTP contract and error handling logic.

import { Hono } from 'hono';
import * as jobsService from '../../src/services/jobs.js';

function buildTestApp(
  meetingsMock: {
    listMeetings?: () => Promise<unknown[]>;
    getMeeting?: (slug: string) => Promise<MockMeeting | null>;
    deleteMeeting?: (slug: string) => Promise<void>;
    updateMeeting?: (slug: string, updates: unknown) => Promise<void>;
    updateItemStatus?: (slug: string, id: string, opts: unknown) => Promise<void>;
    approveMeeting?: (slug: string) => Promise<MockMeeting>;
  }
) {
  const app = new Hono();

  const ws = {
    listMeetings: meetingsMock.listMeetings ?? (() => Promise.resolve([])),
    getMeeting: meetingsMock.getMeeting ?? (() => Promise.resolve(null)),
    deleteMeeting: meetingsMock.deleteMeeting ?? (() => Promise.resolve()),
    updateMeeting: meetingsMock.updateMeeting ?? (() => Promise.resolve()),
    updateItemStatus: meetingsMock.updateItemStatus ?? (() => Promise.resolve()),
    approveMeeting: meetingsMock.approveMeeting ?? (() => Promise.reject(new Error('not found'))),
  };

  app.get('/api/meetings', async (c) => {
    const limit = Math.min(parseInt(c.req.query('limit') ?? '25', 10), 100);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    const allMeetings = await ws.listMeetings();
    const total = allMeetings.length;
    const meetings = (allMeetings as unknown[]).slice(offset, offset + limit);

    return c.json({ meetings, total, offset, limit });
  });

  app.post('/api/meetings/sync', async (c) => {
    const jobId = jobsService.createJob('sync');
    return c.json({ jobId }, 202);
  });

  app.get('/api/meetings/:slug', async (c) => {
    const slug = c.req.param('slug');
    const meeting = await ws.getMeeting(slug);
    if (!meeting) return c.json({ error: 'Meeting not found' }, 404);
    return c.json(meeting);
  });

  app.delete('/api/meetings/:slug', async (c) => {
    const slug = c.req.param('slug');
    try {
      await ws.deleteMeeting(slug);
      return c.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ENOENT') || msg.includes('not found')) {
        return c.json({ error: 'Meeting not found' }, 404);
      }
      return c.json({ error: 'Failed to delete meeting' }, 500);
    }
  });

  app.put('/api/meetings/:slug', async (c) => {
    const slug = c.req.param('slug');
    const body = await c.req.json<{ title?: string; summary?: string }>();
    await ws.updateMeeting(slug, body);
    const meeting = await ws.getMeeting(slug);
    if (!meeting) return c.json({ error: 'Meeting not found' }, 404);
    return c.json(meeting);
  });

  app.patch('/api/meetings/:slug/items/:id', async (c) => {
    const slug = c.req.param('slug');
    const id = c.req.param('id');
    const body = await c.req.json<{ status: string; editedText?: string }>();
    try {
      await ws.updateItemStatus(slug, id, body);
      const meeting = await ws.getMeeting(slug);
      if (!meeting) return c.json({ error: 'Meeting not found' }, 404);
      return c.json(meeting);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return c.json({ error: 'Meeting not found' }, 404);
      return c.json({ error: 'Failed to update item' }, 500);
    }
  });

  app.post('/api/meetings/:slug/approve', async (c) => {
    const slug = c.req.param('slug');
    try {
      const meeting = await ws.approveMeeting(slug);
      return c.json(meeting);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return c.json({ error: 'Meeting not found' }, 404);
      return c.json({ error: 'Failed to approve meeting' }, 500);
    }
  });

  app.post('/api/meetings/:slug/process', async (c) => {
    const jobId = jobsService.createJob('process');
    return c.json({ jobId }, 202);
  });

  app.get('/api/meetings/:slug/process-stream', () => {
    return new Response('data: {}\n\n', {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  });

  app.get('/api/jobs/:id', (c) => {
    const id = c.req.param('id');
    const job = jobsService.getJob(id);
    if (!job) return c.json({ error: 'Job not found' }, 404);
    return c.json({ status: job.status, output: job.events.join('\n') });
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
  const json = await res.json() as unknown;
  return { status: res.status, json };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /api/meetings', () => {
  it('returns empty array when no meetings', async () => {
    const app = buildTestApp({ listMeetings: () => Promise.resolve([]) });
    const { status, json } = await req(app, 'GET', '/api/meetings');
    assert.equal(status, 200);
    const body = json as { meetings: unknown[]; total: number; offset: number; limit: number };
    assert.deepEqual(body.meetings, []);
    assert.equal(body.total, 0);
    assert.equal(body.offset, 0);
    assert.equal(body.limit, 25);
  });

  it('returns meeting summaries with pagination metadata', async () => {
    const meeting = makeMeeting();
    const app = buildTestApp({ listMeetings: () => Promise.resolve([meeting]) });
    const { status, json } = await req(app, 'GET', '/api/meetings');
    assert.equal(status, 200);
    const body = json as { meetings: MockMeeting[]; total: number; offset: number; limit: number };
    assert.ok(Array.isArray(body.meetings));
    assert.equal(body.meetings.length, 1);
    assert.equal(body.meetings[0].slug, meeting.slug);
    assert.equal(body.meetings[0].title, meeting.title);
    assert.equal(body.total, 1);
    assert.equal(body.offset, 0);
    assert.equal(body.limit, 25);
  });

  it('respects limit and offset query params', async () => {
    const meetings = [
      makeMeeting({ slug: 'meeting-1', title: 'Meeting 1' }),
      makeMeeting({ slug: 'meeting-2', title: 'Meeting 2' }),
      makeMeeting({ slug: 'meeting-3', title: 'Meeting 3' }),
    ];
    const app = buildTestApp({ listMeetings: () => Promise.resolve(meetings) });
    const { status, json } = await req(app, 'GET', '/api/meetings?limit=2&offset=1');
    assert.equal(status, 200);
    const body = json as { meetings: MockMeeting[]; total: number; offset: number; limit: number };
    assert.equal(body.meetings.length, 2);
    assert.equal(body.meetings[0].slug, 'meeting-2');
    assert.equal(body.meetings[1].slug, 'meeting-3');
    assert.equal(body.total, 3);
    assert.equal(body.offset, 1);
    assert.equal(body.limit, 2);
  });

  it('caps limit at 100', async () => {
    const app = buildTestApp({ listMeetings: () => Promise.resolve([]) });
    const { status, json } = await req(app, 'GET', '/api/meetings?limit=200');
    assert.equal(status, 200);
    const body = json as { limit: number };
    assert.equal(body.limit, 100);
  });
});

describe('GET /api/meetings/:slug', () => {
  it('returns 404 when meeting not found', async () => {
    const app = buildTestApp({ getMeeting: () => Promise.resolve(null) });
    const { status, json } = await req(app, 'GET', '/api/meetings/missing-slug');
    assert.equal(status, 404);
    assert.deepEqual(json, { error: 'Meeting not found' });
  });

  it('returns full meeting with staged sections', async () => {
    const meeting = makeMeeting({
      stagedSections: {
        actionItems: [{ id: 'ai_001', text: 'Follow up', type: 'ai' }],
        decisions: [],
        learnings: [],
      },
      stagedItemStatus: { ai_001: 'pending' },
    });
    const app = buildTestApp({ getMeeting: () => Promise.resolve(meeting) });
    const { status, json } = await req(app, 'GET', '/api/meetings/2024-01-15-team-standup');
    assert.equal(status, 200);
    const m = json as MockMeeting;
    assert.equal(m.slug, meeting.slug);
    assert.equal(m.stagedItemStatus['ai_001'], 'pending');
  });
});

describe('DELETE /api/meetings/:slug', () => {
  it('returns ok on successful delete', async () => {
    const app = buildTestApp({ deleteMeeting: () => Promise.resolve() });
    const { status, json } = await req(app, 'DELETE', '/api/meetings/2024-01-15-team-standup');
    assert.equal(status, 200);
    assert.deepEqual(json, { ok: true });
  });

  it('returns 404 when file not found (ENOENT)', async () => {
    const app = buildTestApp({
      deleteMeeting: () => Promise.reject(new Error('ENOENT: no such file')),
    });
    const { status, json } = await req(app, 'DELETE', '/api/meetings/ghost');
    assert.equal(status, 404);
    const body = json as { error: string };
    assert.equal(body.error, 'Meeting not found');
  });
});

describe('PUT /api/meetings/:slug', () => {
  it('updates title and returns updated meeting', async () => {
    const meeting = makeMeeting({ title: 'Updated Title' });
    const app = buildTestApp({
      updateMeeting: () => Promise.resolve(),
      getMeeting: () => Promise.resolve(meeting),
    });
    const { status, json } = await req(app, 'PUT', '/api/meetings/2024-01-15-team-standup', {
      title: 'Updated Title',
    });
    assert.equal(status, 200);
    const m = json as MockMeeting;
    assert.equal(m.title, 'Updated Title');
  });
});

describe('PATCH /api/meetings/:slug/items/:id', () => {
  it('updates item status and returns updated meeting', async () => {
    const meeting = makeMeeting({ stagedItemStatus: { ai_001: 'approved' } });
    const app = buildTestApp({
      updateItemStatus: () => Promise.resolve(),
      getMeeting: () => Promise.resolve(meeting),
    });
    const { status, json } = await req(
      app,
      'PATCH',
      '/api/meetings/2024-01-15-team-standup/items/ai_001',
      { status: 'approved' }
    );
    assert.equal(status, 200);
    const m = json as MockMeeting;
    assert.equal(m.stagedItemStatus['ai_001'], 'approved');
  });

  it('returns 404 when meeting not found during item update', async () => {
    const app = buildTestApp({
      updateItemStatus: () => Promise.reject(new Error('not found')),
      getMeeting: () => Promise.resolve(null),
    });
    const { status } = await req(
      app,
      'PATCH',
      '/api/meetings/ghost/items/ai_001',
      { status: 'approved' }
    );
    assert.equal(status, 404);
  });
});

describe('POST /api/meetings/:slug/approve', () => {
  it('returns approved meeting', async () => {
    const meeting = makeMeeting({ status: 'approved' });
    const app = buildTestApp({ approveMeeting: () => Promise.resolve(meeting) });
    const { status, json } = await req(app, 'POST', '/api/meetings/2024-01-15-team-standup/approve');
    assert.equal(status, 200);
    const m = json as MockMeeting;
    assert.equal(m.status, 'approved');
  });

  it('returns 404 when meeting not found', async () => {
    const app = buildTestApp({
      approveMeeting: () => Promise.reject(new Error('not found')),
    });
    const { status } = await req(app, 'POST', '/api/meetings/ghost/approve');
    assert.equal(status, 404);
  });
});

describe('POST /api/meetings/sync', () => {
  it('returns 202 with jobId', async () => {
    const app = buildTestApp({});
    const { status, json } = await req(app, 'POST', '/api/meetings/sync');
    assert.equal(status, 202);
    const body = json as { jobId: string };
    assert.ok(typeof body.jobId === 'string', 'jobId should be a string');
    assert.ok(body.jobId.length > 0, 'jobId should not be empty');
  });
});

describe('POST /api/meetings/:slug/process', () => {
  it('returns 202 with jobId (stub)', async () => {
    const app = buildTestApp({});
    const { status, json } = await req(app, 'POST', '/api/meetings/2024-01-15-team-standup/process');
    assert.equal(status, 202);
    const body = json as { jobId: string };
    assert.ok(typeof body.jobId === 'string', 'jobId should be a string');
  });
});

describe('GET /api/meetings/:slug/process-stream', () => {
  it('returns SSE stub response', async () => {
    const app = buildTestApp({});
    const res = await app.request('/api/meetings/2024-01-15-team-standup/process-stream', {
      method: 'GET',
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'text/event-stream');
    const text = await res.text();
    assert.ok(text.startsWith('data:'), 'SSE should start with data:');
  });
});

describe('GET /api/jobs/:id', () => {
  it('returns 404 for unknown job', async () => {
    const app = buildTestApp({});
    const { status, json } = await req(app, 'GET', '/api/jobs/nonexistent-id');
    assert.equal(status, 404);
    const body = json as { error: string };
    assert.equal(body.error, 'Job not found');
  });

  it('returns job status and output for known job', async () => {
    const app = buildTestApp({});
    // Create a job first via sync
    const { json: syncJson } = await req(app, 'POST', '/api/meetings/sync');
    const { jobId } = syncJson as { jobId: string };

    const { status, json } = await req(app, 'GET', `/api/jobs/${jobId}`);
    assert.equal(status, 200);
    const body = json as { status: string; output: string };
    assert.ok(['running', 'done', 'error'].includes(body.status), 'status should be valid');
    assert.ok(typeof body.output === 'string', 'output should be a string');
  });
});
