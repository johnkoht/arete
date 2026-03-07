/**
 * Goals routes tests — createGoalsRouter with real file system.
 *
 * Creates temp workspace directories, writes actual .md files,
 * then invokes the real router to verify parsing logic and HTTP contract.
 *
 * Uses node:test + node:assert/strict.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGoalsRouter } from '../../src/routes/goals.js';

// ── helpers ──────────────────────────────────────────────────────────────────

type AnyHono = ReturnType<typeof createGoalsRouter>;

async function req(
  app: AnyHono,
  method: string,
  path: string,
): Promise<{ status: number; json: unknown }> {
  const res = await app.request(path, { method });
  const json = await res.json() as unknown;
  return { status: res.status, json };
}

async function reqWithBody(
  app: AnyHono,
  method: string,
  path: string,
  body: unknown,
): Promise<{ status: number; json: unknown }> {
  const res = await app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json() as unknown;
  return { status: res.status, json };
}

// ── GET /strategy ─────────────────────────────────────────────────────────────

describe('GET /strategy — file not found', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-goals-test-no-strategy-'));
    await mkdir(join(tmpDir, 'goals'), { recursive: true });
    // Do NOT write strategy.md
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns found=false when strategy.md does not exist', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/strategy');
    assert.equal(status, 200);
    const body = json as { found: boolean };
    assert.equal(body.found, false);
  });
});

describe('GET /strategy — file exists', () => {
  let tmpDir: string;

  const STRATEGY_CONTENT = `# Product Strategy

## Vision
Build the best product OS for PM teams.

## Pillars
- **Pillar 1**: Intelligence layer
- **Pillar 2**: Workflow automation
`;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-goals-test-strategy-'));
    await mkdir(join(tmpDir, 'goals'), { recursive: true });
    await writeFile(join(tmpDir, 'goals', 'strategy.md'), STRATEGY_CONTENT, 'utf8');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns found=true and content when file exists', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/strategy');
    assert.equal(status, 200);
    const body = json as { found: boolean; content: string; title: string };
    assert.equal(body.found, true);
    assert.ok(typeof body.content === 'string');
    assert.ok(body.content.length > 0);
  });

  it('extracts title from first # heading', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/strategy');
    assert.equal(status, 200);
    const body = json as { title: string };
    assert.equal(body.title, 'Product Strategy');
  });
});

// ── GET /quarter ──────────────────────────────────────────────────────────────

describe('GET /quarter — file not found', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-goals-test-no-quarter-'));
    await mkdir(join(tmpDir, 'goals'), { recursive: true });
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns found=false when quarter.md does not exist', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/quarter');
    assert.equal(status, 200);
    const body = json as { found: boolean; outcomes: unknown[] };
    assert.equal(body.found, false);
    assert.ok(Array.isArray(body.outcomes));
    assert.equal(body.outcomes.length, 0);
  });
});

describe('GET /quarter — file with outcomes', () => {
  let tmpDir: string;

  const QUARTER_MD = `# Q1 2026 Goals

**Quarter**: 2026-Q1

## Outcomes

### Q1-1 Ship onboarding v2

**Success criteria**: Drop-off reduced by 50%
**Org alignment**: Pillar 1: User Growth

### Q1-2 Launch API v3

**Success criteria**: 200 API customers activated
**Org alignment**: Pillar 2: Platform

`;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-goals-test-quarter-'));
    await mkdir(join(tmpDir, 'goals'), { recursive: true });
    await writeFile(join(tmpDir, 'goals', 'quarter.md'), QUARTER_MD, 'utf8');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns found=true and parsed outcomes', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/quarter');
    assert.equal(status, 200);
    const body = json as {
      found: boolean;
      outcomes: Array<{ id: string; title: string; successCriteria: string; orgAlignment: string }>;
      quarter: string;
    };
    assert.equal(body.found, true);
    assert.ok(Array.isArray(body.outcomes));
    assert.equal(body.outcomes.length, 2);
  });

  it('parses outcome id and title', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/quarter');
    assert.equal(status, 200);
    const body = json as { outcomes: Array<{ id: string; title: string }> };
    assert.equal(body.outcomes[0]?.id, 'Q1-1');
    assert.equal(body.outcomes[0]?.title, 'Ship onboarding v2');
    assert.equal(body.outcomes[1]?.id, 'Q1-2');
    assert.equal(body.outcomes[1]?.title, 'Launch API v3');
  });

  it('parses success criteria', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/quarter');
    assert.equal(status, 200);
    const body = json as { outcomes: Array<{ successCriteria: string }> };
    assert.equal(body.outcomes[0]?.successCriteria, 'Drop-off reduced by 50%');
  });

  it('extracts quarter label', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/quarter');
    assert.equal(status, 200);
    const body = json as { quarter: string };
    assert.equal(body.quarter, '2026-Q1');
  });
});

// ── GET /week ─────────────────────────────────────────────────────────────────

describe('GET /week — file not found', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-goals-test-no-week-'));
    await mkdir(join(tmpDir, 'now'), { recursive: true });
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns found=false when week.md does not exist', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/week');
    assert.equal(status, 200);
    const body = json as { found: boolean; priorities: unknown[] };
    assert.equal(body.found, false);
    assert.ok(Array.isArray(body.priorities));
    assert.equal(body.priorities.length, 0);
  });
});

describe('GET /week — file with priorities', () => {
  let tmpDir: string;

  const WEEK_MD = `# This Week

**Week of**: 2026-03-03

## Priorities

### 1. Ship onboarding prototype

**Success criteria**: Working prototype reviewed by 3 stakeholders
**Advances quarter goal**: Q1-1
**Effort**: large

### 2. Finalize pricing model

**Success criteria**: Approved by finance
**Advances quarter goal**: Q1-3
**Effort**: medium

[x]

## Commitments due this week

- [ ] Send API roadmap to Jane
- [x] Review Bob's architecture doc
`;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-goals-test-week-'));
    await mkdir(join(tmpDir, 'now'), { recursive: true });
    await writeFile(join(tmpDir, 'now', 'week.md'), WEEK_MD, 'utf8');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns found=true with priorities', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/week');
    assert.equal(status, 200);
    const body = json as { found: boolean; priorities: Array<{ title: string; index: number; done: boolean }> };
    assert.equal(body.found, true);
    assert.ok(Array.isArray(body.priorities));
    assert.ok(body.priorities.length >= 1);
  });

  it('parses priority title and index', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/week');
    assert.equal(status, 200);
    const body = json as { priorities: Array<{ index: number; title: string }> };
    assert.equal(body.priorities[0]?.index, 1);
    assert.equal(body.priorities[0]?.title, 'Ship onboarding prototype');
    assert.equal(body.priorities[1]?.index, 2);
    assert.equal(body.priorities[1]?.title, 'Finalize pricing model');
  });

  it('marks second priority as done (has [x] in body)', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/week');
    assert.equal(status, 200);
    const body = json as { priorities: Array<{ done: boolean }> };
    assert.equal(body.priorities[0]?.done, false);
    assert.equal(body.priorities[1]?.done, true);
  });

  it('parses week of date', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/week');
    assert.equal(status, 200);
    const body = json as { weekOf: string };
    assert.equal(body.weekOf, '2026-03-03');
  });

  it('parses commitments with done status', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/week');
    assert.equal(status, 200);
    const body = json as { commitments: Array<{ text: string; done: boolean }> };
    assert.ok(Array.isArray(body.commitments));
    assert.equal(body.commitments.length, 2);
    // First: [ ] not done
    assert.equal(body.commitments[0]?.done, false);
    assert.equal(body.commitments[0]?.text, 'Send API roadmap to Jane');
    // Second: [x] done
    assert.equal(body.commitments[1]?.done, true);
    assert.equal(body.commitments[1]?.text, "Review Bob's architecture doc");
  });
});

// ── PATCH /week/priority ──────────────────────────────────────────────────────

describe('PATCH /week/priority — toggle done on/off', () => {
  let tmpDir: string;

  const WEEK_MD = `# This Week

**Week of**: 2026-03-03

## Priorities

### 1. Ship onboarding prototype

**Success criteria**: Working prototype reviewed by 3 stakeholders
**Advances quarter goal**: Q1-1
**Effort**: large

### 2. Finalize pricing model

**Success criteria**: Approved by finance
**Advances quarter goal**: Q1-3
**Effort**: medium

## Commitments due this week

- [ ] Send API roadmap to Jane
`;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-goals-test-patch-priority-'));
    await mkdir(join(tmpDir, 'now'), { recursive: true });
    await writeFile(join(tmpDir, 'now', 'week.md'), WEEK_MD, 'utf8');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('marks priority 1 as done — file contains [x]', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await reqWithBody(router, 'PATCH', '/week/priority', { index: 1, done: true });
    assert.equal(status, 200);
    const body = json as { success: boolean; updatedContent: string };
    assert.equal(body.success, true);
    assert.ok(body.updatedContent.includes('[x]'), 'updated content should contain [x]');
  });

  it('GET /week now shows priority 1 as done', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/week');
    assert.equal(status, 200);
    const body = json as { priorities: Array<{ index: number; done: boolean }> };
    const p1 = body.priorities.find(p => p.index === 1);
    assert.ok(p1, 'priority 1 should exist');
    assert.equal(p1?.done, true);
  });

  it('marks priority 1 as not done — [x] is removed', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await reqWithBody(router, 'PATCH', '/week/priority', { index: 1, done: false });
    assert.equal(status, 200);
    const body = json as { success: boolean; updatedContent: string };
    assert.equal(body.success, true);
    assert.ok(!body.updatedContent.includes('[x]'), 'updated content should not contain [x]');
  });

  it('GET /week now shows priority 1 as not done after toggling off', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/week');
    assert.equal(status, 200);
    const body = json as { priorities: Array<{ index: number; done: boolean }> };
    const p1 = body.priorities.find(p => p.index === 1);
    assert.equal(p1?.done, false);
  });

  it('returns 404 for non-existent priority index', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await reqWithBody(router, 'PATCH', '/week/priority', { index: 99, done: true });
    assert.equal(status, 404);
    const body = json as { error: string };
    assert.ok(body.error.includes('99'));
  });

  it('returns 400 for missing done field', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status } = await reqWithBody(router, 'PATCH', '/week/priority', { index: 1 });
    assert.equal(status, 400);
  });

  it('returns 400 for missing index field', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status } = await reqWithBody(router, 'PATCH', '/week/priority', { done: true });
    assert.equal(status, 400);
  });

  it('toggling done=true twice does not duplicate [x]', async () => {
    const router = createGoalsRouter(tmpDir);
    // First toggle on
    await reqWithBody(router, 'PATCH', '/week/priority', { index: 2, done: true });
    // Second toggle on
    const { status, json } = await reqWithBody(router, 'PATCH', '/week/priority', { index: 2, done: true });
    assert.equal(status, 200);
    const body = json as { updatedContent: string };
    // Count occurrences of [x]
    const matches = body.updatedContent.match(/\[x\]/gi) ?? [];
    // Should have exactly 1 [x] in priority 2's section
    assert.equal(matches.length, 1);
  });
});
