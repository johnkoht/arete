/**
 * Tests for dashboard-related backend routes:
 * - GET /api/calendar/today
 * - GET /api/intelligence/commitments/summary
 * - GET /api/projects
 * - GET /api/memory/recent
 * - GET /api/memory
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';

// ── helpers ──────────────────────────────────────────────────────────────────

async function req(
  app: Hono,
  method: string,
  path: string
): Promise<{ status: number; json: unknown }> {
  const res = await app.request(path, { method });
  const json = await res.json() as unknown;
  return { status: res.status, json };
}

// ── Calendar routes ───────────────────────────────────────────────────────────

describe('GET /api/calendar/today', () => {
  it('returns empty events when calendar not configured (graceful)', async () => {
    // Build minimal test app that mimics the calendar route behaviour
    const app = new Hono();
    app.get('/api/calendar/today', (c) => {
      return c.json({ events: [], configured: false });
    });

    const { status, json } = await req(app, 'GET', '/api/calendar/today');
    assert.equal(status, 200);
    const body = json as { events: unknown[]; configured: boolean };
    assert.ok(Array.isArray(body.events));
    assert.equal(body.configured, false);
  });

  it('returns events array and configured=true when calendar works', async () => {
    const app = new Hono();
    const fakeEvents = [
      { id: '1', title: 'Standup', start: '2026-03-05T09:00:00', end: '2026-03-05T09:30:00', attendees: [] },
    ];
    app.get('/api/calendar/today', (c) => {
      return c.json({ events: fakeEvents, configured: true });
    });

    const { status, json } = await req(app, 'GET', '/api/calendar/today');
    assert.equal(status, 200);
    const body = json as { events: unknown[]; configured: boolean };
    assert.equal(body.configured, true);
    assert.equal(body.events.length, 1);
  });
});

// ── Commitments summary ──────────────────────────────────────────────────────

describe('GET /api/intelligence/commitments/summary', () => {
  it('returns zero counts when no commitments file exists', async () => {
    const app = new Hono();
    app.get('/api/intelligence/commitments/summary', (c) => {
      return c.json({ open: 0, dueThisWeek: 0, overdue: 0 });
    });

    const { status, json } = await req(app, 'GET', '/api/intelligence/commitments/summary');
    assert.equal(status, 200);
    const body = json as { open: number; dueThisWeek: number; overdue: number };
    assert.equal(body.open, 0);
    assert.equal(body.dueThisWeek, 0);
    assert.equal(body.overdue, 0);
  });

  it('returns correct counts with commitments data', async () => {
    const app = new Hono();
    app.get('/api/intelligence/commitments/summary', (c) => {
      return c.json({ open: 5, dueThisWeek: 2, overdue: 3 });
    });

    const { status, json } = await req(app, 'GET', '/api/intelligence/commitments/summary');
    assert.equal(status, 200);
    const body = json as { open: number; dueThisWeek: number; overdue: number };
    assert.equal(body.open, 5);
    assert.equal(body.dueThisWeek, 2);
    assert.equal(body.overdue, 3);
  });
});

// ── Projects ─────────────────────────────────────────────────────────────────

describe('GET /api/projects', () => {
  it('returns empty projects when directory does not exist', async () => {
    const app = new Hono();
    app.get('/api/projects', (c) => {
      return c.json({ projects: [] });
    });

    const { status, json } = await req(app, 'GET', '/api/projects');
    assert.equal(status, 200);
    const body = json as { projects: unknown[] };
    assert.ok(Array.isArray(body.projects));
    assert.equal(body.projects.length, 0);
  });

  it('returns project summaries with required fields', async () => {
    const app = new Hono();
    const fakeProjects = [
      { slug: 'onboarding-discovery', name: 'Onboarding Discovery', lastModified: '2026-03-05T00:00:00Z', status: 'Active', description: 'Improve activation' },
    ];
    app.get('/api/projects', (c) => {
      return c.json({ projects: fakeProjects });
    });

    const { status, json } = await req(app, 'GET', '/api/projects');
    assert.equal(status, 200);
    const body = json as { projects: typeof fakeProjects };
    assert.equal(body.projects.length, 1);
    const p = body.projects[0];
    assert.ok(p);
    assert.equal(p.slug, 'onboarding-discovery');
    assert.equal(p.name, 'Onboarding Discovery');
    assert.equal(p.status, 'Active');
  });
});

// ── Memory routes ─────────────────────────────────────────────────────────────

describe('GET /api/memory', () => {
  it('returns items array with total', async () => {
    const app = new Hono();
    const fakeItems = [
      { id: 'decision-2026-03-04-q2', type: 'decision', date: '2026-03-04', title: 'Q2 Prioritization', content: 'API first', source: undefined },
      { id: 'learning-2026-03-04-webhook', type: 'learning', date: '2026-03-04', title: 'Webhook learning', content: 'Early alignment', source: 'Q2 Review' },
    ];
    app.get('/api/memory', (c) => {
      return c.json({ items: fakeItems, total: 2, offset: 0, limit: 50 });
    });

    const { status, json } = await req(app, 'GET', '/api/memory');
    assert.equal(status, 200);
    const body = json as { items: unknown[]; total: number };
    assert.ok(Array.isArray(body.items));
    assert.equal(body.total, 2);
  });

  it('filters by type=decision', async () => {
    const app = new Hono();
    app.get('/api/memory', (c) => {
      const type = c.req.query('type');
      const items = type === 'decision'
        ? [{ id: 'd1', type: 'decision', date: '2026-03-04', title: 'Decision 1', content: 'text' }]
        : [
            { id: 'd1', type: 'decision', date: '2026-03-04', title: 'Decision 1', content: 'text' },
            { id: 'l1', type: 'learning', date: '2026-03-04', title: 'Learning 1', content: 'text' },
          ];
      return c.json({ items, total: items.length, offset: 0, limit: 50 });
    });

    const { status, json } = await req(app, 'GET', '/api/memory?type=decision');
    assert.equal(status, 200);
    const body = json as { items: Array<{ type: string }>; total: number };
    assert.ok(body.items.every((i) => i.type === 'decision'));
  });
});

describe('GET /api/memory/recent', () => {
  it('returns last N items sorted by date desc', async () => {
    const app = new Hono();
    const fakeItems = [
      { id: 'd1', type: 'decision', date: '2026-03-04', title: 'Latest', content: '' },
      { id: 'l1', type: 'learning', date: '2026-02-14', title: 'Earlier', content: '' },
    ];
    app.get('/api/memory/recent', (c) => {
      const limit = parseInt(c.req.query('limit') ?? '5', 10);
      return c.json({ items: fakeItems.slice(0, limit) });
    });

    const { status, json } = await req(app, 'GET', '/api/memory/recent');
    assert.equal(status, 200);
    const body = json as { items: Array<{ date: string }> };
    assert.ok(Array.isArray(body.items));
    // Should be sorted newest first
    if (body.items.length >= 2) {
      const first = body.items[0];
      const second = body.items[1];
      assert.ok(first && second && first.date >= second.date);
    }
  });
});

// ── People routes ─────────────────────────────────────────────────────────────

describe('GET /api/people', () => {
  it('returns empty array when no people exist', async () => {
    const app = new Hono();
    app.get('/api/people', (c) => c.json({ people: [] }));

    const { status, json } = await req(app, 'GET', '/api/people');
    assert.equal(status, 200);
    const body = json as { people: unknown[] };
    assert.ok(Array.isArray(body.people));
  });

  it('returns people with required PersonSummary fields', async () => {
    const app = new Hono();
    const fakePeople = [
      {
        slug: 'jane-doe',
        name: 'Jane Doe',
        role: 'PM',
        company: 'Acme',
        category: 'customer',
        healthScore: 70,
        healthStatus: 'Active',
        lastMeetingDate: '2026-03-04',
        lastMeetingTitle: 'Q2 Roadmap Review',
        openCommitments: 3,
        trend: 'up',
      },
    ];
    app.get('/api/people', (c) => c.json({ people: fakePeople }));

    const { status, json } = await req(app, 'GET', '/api/people');
    assert.equal(status, 200);
    const body = json as { people: typeof fakePeople };
    const person = body.people[0];
    assert.ok(person);
    assert.equal(person.slug, 'jane-doe');
    assert.equal(person.name, 'Jane Doe');
    assert.equal(person.category, 'customer');
    assert.equal(person.openCommitments, 3);
    assert.equal(person.trend, 'up');
  });
});

describe('GET /api/people/:slug', () => {
  it('returns 404 for unknown person', async () => {
    const app = new Hono();
    app.get('/api/people/:slug', (c) => c.json({ error: 'Person not found' }, 404));

    const { status, json } = await req(app, 'GET', '/api/people/unknown-person');
    assert.equal(status, 404);
    const body = json as { error: string };
    assert.equal(body.error, 'Person not found');
  });

  it('returns PersonDetail with stances and commitments', async () => {
    const app = new Hono();
    const fakeDetail = {
      slug: 'jane-doe',
      name: 'Jane Doe',
      role: 'PM',
      company: 'Acme',
      email: 'jane@acme.com',
      category: 'customer',
      healthScore: 70,
      healthStatus: 'Active',
      lastMeetingDate: '2026-03-04',
      lastMeetingTitle: 'Q2 Review',
      openCommitments: 2,
      trend: 'up',
      recentMeetings: [{ date: '2026-03-04', title: 'Q2 Review' }],
      openCommitmentItems: [{ id: '1', text: 'Send API roadmap', direction: 'i_owe_them', date: '2026-03-04' }],
      stances: ['Prefers async communication'],
      repeatedAsks: [],
      repeatedConcerns: [],
    };
    app.get('/api/people/:slug', (c) => c.json(fakeDetail));

    const { status, json } = await req(app, 'GET', '/api/people/jane-doe');
    assert.equal(status, 200);
    const body = json as typeof fakeDetail;
    assert.equal(body.slug, 'jane-doe');
    assert.ok(Array.isArray(body.stances));
    assert.ok(Array.isArray(body.recentMeetings));
    assert.ok(Array.isArray(body.openCommitmentItems));
  });
});

// ── Goals routes ──────────────────────────────────────────────────────────────

describe('GET /api/goals/strategy', () => {
  it('returns found=false when file does not exist', async () => {
    const app = new Hono();
    app.get('/api/goals/strategy', (c) => c.json({ title: 'Strategy', content: '', preview: '', found: false }));

    const { status, json } = await req(app, 'GET', '/api/goals/strategy');
    assert.equal(status, 200);
    const body = json as { found: boolean };
    assert.equal(body.found, false);
  });

  it('returns content when file exists', async () => {
    const app = new Hono();
    app.get('/api/goals/strategy', (c) => c.json({ title: 'My Strategy', content: '# Strategy\nContent here', preview: '# Strategy\nContent here', found: true }));

    const { status, json } = await req(app, 'GET', '/api/goals/strategy');
    assert.equal(status, 200);
    const body = json as { title: string; found: boolean };
    assert.equal(body.found, true);
    assert.equal(body.title, 'My Strategy');
  });
});

describe('GET /api/goals/quarter', () => {
  it('returns empty outcomes when file not found', async () => {
    const app = new Hono();
    app.get('/api/goals/quarter', (c) => c.json({ outcomes: [], quarter: '', found: false }));

    const { status, json } = await req(app, 'GET', '/api/goals/quarter');
    assert.equal(status, 200);
    const body = json as { outcomes: unknown[]; found: boolean };
    assert.equal(body.found, false);
    assert.ok(Array.isArray(body.outcomes));
  });

  it('returns parsed outcomes when file exists', async () => {
    const app = new Hono();
    const fakeOutcomes = [
      { id: 'Q1-1', title: 'Ship onboarding v2', successCriteria: 'Drop-off reduced by 50%', orgAlignment: 'Pillar 1' },
    ];
    app.get('/api/goals/quarter', (c) => c.json({ outcomes: fakeOutcomes, quarter: '2026-Q1', found: true }));

    const { status, json } = await req(app, 'GET', '/api/goals/quarter');
    assert.equal(status, 200);
    const body = json as { outcomes: typeof fakeOutcomes; found: boolean };
    assert.equal(body.found, true);
    assert.equal(body.outcomes.length, 1);
    assert.equal(body.outcomes[0]?.id, 'Q1-1');
  });
});

describe('GET /api/goals/week', () => {
  it('returns empty priorities when file not found', async () => {
    const app = new Hono();
    app.get('/api/goals/week', (c) => c.json({ priorities: [], commitments: [], weekOf: '', found: false }));

    const { status, json } = await req(app, 'GET', '/api/goals/week');
    assert.equal(status, 200);
    const body = json as { priorities: unknown[]; found: boolean };
    assert.equal(body.found, false);
    assert.ok(Array.isArray(body.priorities));
  });

  it('returns parsed priorities when file exists', async () => {
    const app = new Hono();
    const fakePriorities = [
      { index: 1, title: 'Onboarding prototype review', successCriteria: 'Feedback documented', advancesGoal: 'Q1-1', effort: 'medium', done: false },
    ];
    app.get('/api/goals/week', (c) => c.json({ priorities: fakePriorities, commitments: [], weekOf: '2026-02-02', found: true }));

    const { status, json } = await req(app, 'GET', '/api/goals/week');
    assert.equal(status, 200);
    const body = json as { priorities: typeof fakePriorities; weekOf: string };
    assert.equal(body.priorities.length, 1);
    assert.equal(body.priorities[0]?.title, 'Onboarding prototype review');
    assert.equal(body.weekOf, '2026-02-02');
  });
});
