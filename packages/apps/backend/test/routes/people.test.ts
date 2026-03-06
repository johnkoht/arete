/**
 * People routes tests — createPeopleRouter with real file system.
 *
 * Creates temp directories, writes actual .md files, then invokes the real
 * router to verify parsing logic and HTTP contract.
 *
 * Uses node:test + node:assert/strict.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPeopleRouter } from '../../src/routes/people.js';

// ── helpers ──────────────────────────────────────────────────────────────────

type AnyHono = ReturnType<typeof createPeopleRouter>;

async function req(
  app: AnyHono,
  method: string,
  path: string,
): Promise<{ status: number; json: unknown }> {
  const res = await app.request(path, { method });
  const json = await res.json() as unknown;
  return { status: res.status, json };
}

// Minimal person frontmatter
const SIMPLE_PERSON_MD = `---
name: Jane Doe
role: Product Manager
company: Acme Corp
email: jane@acme.com
category: customer
---

# Jane Doe

Some notes about Jane.
`;

// Person file with AUTO_PERSON_MEMORY block
const PERSON_WITH_MEMORY_MD = `---
name: Bob Smith
role: Engineer
company: Startup Inc
email: bob@startup.io
category: internal
---

# Bob Smith

Notes here.

## Recent Meetings

- 2026-03-01 — Q1 Kickoff
- 2026-02-15 — Sprint Planning

<!-- AUTO_PERSON_MEMORY:START -->
## Relationship Health

Last met: 2026-03-01 (5 days ago)
Meetings: 3 in last 30d, 8 in last 90d
Status: Active

### Stances
- Prefers async communication
- Data-driven decision maker

### Repeated asks
- Share roadmap updates

### Repeated concerns
- Timeline slippage

<!-- AUTO_PERSON_MEMORY:END -->
`;

// ── empty directory ───────────────────────────────────────────────────────────

describe('GET /api/people — empty people directory', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-people-test-empty-'));
    // Create empty people subdirs
    await mkdir(join(tmpDir, 'people', 'internal'), { recursive: true });
    await mkdir(join(tmpDir, 'people', 'customers'), { recursive: true });
    await mkdir(join(tmpDir, 'people', 'users'), { recursive: true });
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty people array', async () => {
    const router = createPeopleRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/');
    assert.equal(status, 200);
    const body = json as { people: unknown[] };
    assert.ok(Array.isArray(body.people));
    assert.equal(body.people.length, 0);
  });
});

// ── person without AUTO_PERSON_MEMORY ────────────────────────────────────────

describe('GET /api/people — person without AUTO_PERSON_MEMORY block', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-people-test-simple-'));
    await mkdir(join(tmpDir, 'people', 'customers'), { recursive: true });
    await mkdir(join(tmpDir, '.arete'), { recursive: true });
    await writeFile(join(tmpDir, 'people', 'customers', 'jane-doe.md'), SIMPLE_PERSON_MD, 'utf8');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns person with healthScore=null, openCommitments=0, lastMeetingDate=null, trend=null', async () => {
    const router = createPeopleRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/');
    assert.equal(status, 200);
    const body = json as { people: Array<{
      slug: string;
      name: string;
      category: string;
      healthScore: number | null;
      openCommitments: number;
      lastMeetingDate: string | null;
      trend: string | null;
    }> };
    assert.equal(body.people.length, 1);
    const person = body.people[0];
    assert.ok(person, 'person should exist');
    assert.equal(person.slug, 'jane-doe');
    assert.equal(person.name, 'Jane Doe');
    assert.equal(person.category, 'customer');
    assert.equal(person.healthScore, null);
    assert.equal(person.openCommitments, 0);
    assert.equal(person.lastMeetingDate, null);
    assert.equal(person.trend, null);
  });
});

// ── person with AUTO_PERSON_MEMORY block ─────────────────────────────────────

describe('GET /api/people — person with AUTO_PERSON_MEMORY block', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-people-test-memory-'));
    await mkdir(join(tmpDir, 'people', 'internal'), { recursive: true });
    await mkdir(join(tmpDir, '.arete'), { recursive: true });
    await writeFile(join(tmpDir, 'people', 'internal', 'bob-smith.md'), PERSON_WITH_MEMORY_MD, 'utf8');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns health score derived from meeting frequency', async () => {
    const router = createPeopleRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/');
    assert.equal(status, 200);
    const body = json as { people: Array<{ healthScore: number | null; trend: string | null }> };
    assert.equal(body.people.length, 1);
    const person = body.people[0];
    assert.ok(person, 'person should exist');
    // 3 meetings in last 30d → healthScore 70 (meetingsLast30d >= 2 && < 4)
    assert.equal(person.healthScore, 70);
  });

  it('parses recent meetings from ## Recent Meetings section', async () => {
    const router = createPeopleRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/bob-smith');
    assert.equal(status, 200);
    const body = json as { recentMeetings: Array<{ date: string; title: string }> };
    assert.ok(Array.isArray(body.recentMeetings));
    assert.ok(body.recentMeetings.length > 0);
    assert.equal(body.recentMeetings[0]?.date, '2026-03-01');
    assert.equal(body.recentMeetings[0]?.title, 'Q1 Kickoff');
  });

  it('parses stances from AUTO_PERSON_MEMORY block', async () => {
    const router = createPeopleRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/bob-smith');
    assert.equal(status, 200);
    const body = json as { stances: string[] };
    assert.ok(Array.isArray(body.stances));
    assert.ok(body.stances.includes('Prefers async communication'));
    assert.ok(body.stances.includes('Data-driven decision maker'));
  });

  it('parses repeated asks from AUTO_PERSON_MEMORY block', async () => {
    const router = createPeopleRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/bob-smith');
    assert.equal(status, 200);
    const body = json as { repeatedAsks: string[] };
    assert.ok(Array.isArray(body.repeatedAsks));
    assert.ok(body.repeatedAsks.includes('Share roadmap updates'));
  });
});

// ── detail route — 404 ────────────────────────────────────────────────────────

describe('GET /api/people/:slug — 404 for non-existent', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-people-test-404-'));
    await mkdir(join(tmpDir, 'people', 'customers'), { recursive: true });
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns 404 for unknown slug', async () => {
    const router = createPeopleRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/unknown-person');
    assert.equal(status, 404);
    const body = json as { error: string };
    assert.equal(body.error, 'Person not found');
  });
});

// ── detail route — full person ────────────────────────────────────────────────

describe('GET /api/people/:slug — full PersonDetail', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-people-test-detail-'));
    await mkdir(join(tmpDir, 'people', 'customers'), { recursive: true });
    await mkdir(join(tmpDir, '.arete'), { recursive: true });
    await writeFile(join(tmpDir, 'people', 'customers', 'jane-doe.md'), SIMPLE_PERSON_MD, 'utf8');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns full PersonDetail for existing person', async () => {
    const router = createPeopleRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/jane-doe');
    assert.equal(status, 200);
    const body = json as {
      slug: string;
      name: string;
      role: string;
      company: string;
      email: string;
      category: string;
      healthScore: number | null;
      openCommitments: number;
      recentMeetings: unknown[];
      openCommitmentItems: unknown[];
      stances: unknown[];
      repeatedAsks: unknown[];
      repeatedConcerns: unknown[];
    };
    assert.equal(body.slug, 'jane-doe');
    assert.equal(body.name, 'Jane Doe');
    assert.equal(body.role, 'Product Manager');
    assert.equal(body.company, 'Acme Corp');
    assert.equal(body.email, 'jane@acme.com');
    assert.equal(body.category, 'customer');
    assert.ok(Array.isArray(body.recentMeetings));
    assert.ok(Array.isArray(body.openCommitmentItems));
    assert.ok(Array.isArray(body.stances));
    assert.ok(Array.isArray(body.repeatedAsks));
    assert.ok(Array.isArray(body.repeatedConcerns));
  });

  it('includes open commitments from commitments.json', async () => {
    // Write a commitments.json with one open commitment for jane-doe
    const today = new Date().toISOString().slice(0, 10);
    const commitments = {
      commitments: [
        {
          id: 'c-001',
          text: 'Send API docs',
          direction: 'i_owe_them',
          personSlug: 'jane-doe',
          personName: 'Jane Doe',
          source: 'some-meeting',
          date: today,
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

    const router = createPeopleRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/jane-doe');
    assert.equal(status, 200);
    const body = json as { openCommitments: number; openCommitmentItems: unknown[] };
    assert.equal(body.openCommitments, 1);
    assert.equal(body.openCommitmentItems.length, 1);
  });
});

// ── rawContent & allMeetings ──────────────────────────────────────────────────

const PERSON_WITH_NOTES_MD = `---
name: Carol Jones
role: Designer
company: Creative Co
email: carol@creative.co
category: internal
---

# Carol Jones

Carol is a talented designer who focuses on user experience.

She prefers async communication and values clear documentation.

## Recent Meetings

- 2026-03-01 — Design Review
- 2026-02-15 — Sprint Planning

<!-- AUTO_PERSON_MEMORY:START -->
## Relationship Health

Last met: 2026-03-01 (5 days ago)
Meetings: 2 in last 30d, 5 in last 90d
Status: Active

### Stances
- Values clear documentation

### Repeated asks
- None detected yet.

### Repeated concerns
- None detected yet.

<!-- AUTO_PERSON_MEMORY:END -->
`;

const MEETING_WITH_ATTENDEE_MD = `---
title: Design Review
date: 2026-03-01
attendee_ids:
  - carol-jones
  - bob-smith
---

# Design Review

Meeting notes here.
`;

const MEETING_WITHOUT_ATTENDEE_MD = `---
title: Unrelated Meeting
date: 2026-02-20
attendee_ids:
  - bob-smith
---

# Unrelated Meeting

Notes.
`;

describe('GET /api/people/:slug — rawContent field', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-people-rawcontent-'));
    await mkdir(join(tmpDir, 'people', 'internal'), { recursive: true });
    await mkdir(join(tmpDir, '.arete'), { recursive: true });
    await writeFile(join(tmpDir, 'people', 'internal', 'carol-jones.md'), PERSON_WITH_NOTES_MD, 'utf8');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns rawContent as a string', async () => {
    const router = createPeopleRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/carol-jones');
    assert.equal(status, 200);
    const body = json as { rawContent: unknown };
    assert.equal(typeof body.rawContent, 'string');
  });

  it('rawContent is non-empty when person has notes', async () => {
    const router = createPeopleRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/carol-jones');
    assert.equal(status, 200);
    const body = json as { rawContent: string };
    assert.ok(body.rawContent.length > 0, 'rawContent should not be empty');
    assert.ok(body.rawContent.includes('Carol is a talented designer'));
  });

  it('rawContent does NOT contain AUTO_PERSON_MEMORY markers', async () => {
    const router = createPeopleRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/carol-jones');
    assert.equal(status, 200);
    const body = json as { rawContent: string };
    assert.ok(!body.rawContent.includes('AUTO_PERSON_MEMORY'), 'rawContent must not include AUTO_PERSON_MEMORY');
  });

  it('rawContent does NOT contain ## Recent Meetings section', async () => {
    const router = createPeopleRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/carol-jones');
    assert.equal(status, 200);
    const body = json as { rawContent: string };
    assert.ok(!body.rawContent.includes('## Recent Meetings'), 'rawContent must not include ## Recent Meetings');
  });
});

describe('GET /api/people/:slug — allMeetings field', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-people-allmeetings-'));
    await mkdir(join(tmpDir, 'people', 'internal'), { recursive: true });
    await mkdir(join(tmpDir, '.arete'), { recursive: true });
    await mkdir(join(tmpDir, 'resources', 'meetings'), { recursive: true });
    await writeFile(join(tmpDir, 'people', 'internal', 'carol-jones.md'), PERSON_WITH_NOTES_MD, 'utf8');
    await writeFile(
      join(tmpDir, 'resources', 'meetings', '2026-03-01-design-review.md'),
      MEETING_WITH_ATTENDEE_MD,
      'utf8',
    );
    await writeFile(
      join(tmpDir, 'resources', 'meetings', '2026-02-20-unrelated.md'),
      MEETING_WITHOUT_ATTENDEE_MD,
      'utf8',
    );
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns allMeetings as an array', async () => {
    const router = createPeopleRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/carol-jones');
    assert.equal(status, 200);
    const body = json as { allMeetings: unknown[] };
    assert.ok(Array.isArray(body.allMeetings), 'allMeetings should be an array');
  });

  it('allMeetings only includes meetings where person is an attendee', async () => {
    const router = createPeopleRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/carol-jones');
    assert.equal(status, 200);
    const body = json as { allMeetings: Array<{ slug: string; date: string; title: string; attendeeIds: string[] }> };
    assert.equal(body.allMeetings.length, 1, 'only 1 meeting has carol-jones as attendee');
    assert.equal(body.allMeetings[0]?.slug, '2026-03-01-design-review');
  });

  it('allMeetings items have slug/date/title/attendeeIds shape', async () => {
    const router = createPeopleRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/carol-jones');
    assert.equal(status, 200);
    const body = json as { allMeetings: Array<{ slug: string; date: string; title: string; attendeeIds: string[] }> };
    const meeting = body.allMeetings[0];
    assert.ok(meeting, 'first meeting should exist');
    assert.equal(typeof meeting.slug, 'string');
    assert.equal(typeof meeting.date, 'string');
    assert.equal(typeof meeting.title, 'string');
    assert.ok(Array.isArray(meeting.attendeeIds));
    assert.ok(meeting.attendeeIds.includes('carol-jones'));
  });

  it('allMeetings returns empty array when meetings dir does not exist', async () => {
    // Use a temp dir without a meetings subdirectory
    const emptyDir = await mkdtemp(join(tmpdir(), 'arete-people-nomeeting-'));
    try {
      await mkdir(join(emptyDir, 'people', 'internal'), { recursive: true });
      await writeFile(join(emptyDir, 'people', 'internal', 'carol-jones.md'), PERSON_WITH_NOTES_MD, 'utf8');
      const router = createPeopleRouter(emptyDir);
      const { status, json } = await req(router, 'GET', '/carol-jones');
      assert.equal(status, 200);
      const body = json as { allMeetings: unknown[] };
      assert.ok(Array.isArray(body.allMeetings));
      assert.equal(body.allMeetings.length, 0);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });
});
