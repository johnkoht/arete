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

describe('GET /quarter — no goals directory', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-goals-test-no-quarter-'));
    await mkdir(join(tmpDir, 'goals'), { recursive: true });
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns found=false when no goals exist', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/quarter');
    assert.equal(status, 200);
    const body = json as { found: boolean; outcomes: unknown[] };
    assert.equal(body.found, false);
    assert.ok(Array.isArray(body.outcomes));
    assert.equal(body.outcomes.length, 0);
  });
});

describe('GET /quarter — individual goal files (new format)', () => {
  let tmpDir: string;

  // New format: individual goal files with frontmatter
  // Note: YAML values containing colons must be quoted
  const GOAL_1 = `---
id: Q1-1
title: Ship onboarding v2
quarter: 2026-Q1
status: active
type: outcome
successCriteria: "Drop-off reduced by 50%"
orgAlignment: "Pillar 1: User Growth"
---

This is the goal body with details.
`;

  const GOAL_2 = `---
id: Q1-2
title: Launch API v3
quarter: 2026-Q1
status: active
type: outcome
successCriteria: "200 API customers activated"
orgAlignment: "Pillar 2: Platform"
---

API v3 launch details.
`;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-goals-test-quarter-'));
    await mkdir(join(tmpDir, 'goals'), { recursive: true });
    await writeFile(join(tmpDir, 'goals', 'ship-onboarding-v2.md'), GOAL_1, 'utf8');
    await writeFile(join(tmpDir, 'goals', 'launch-api-v3.md'), GOAL_2, 'utf8');
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
    // Goals may be in any order, so find by id
    const goal1 = body.outcomes.find(o => o.id === 'Q1-1');
    const goal2 = body.outcomes.find(o => o.id === 'Q1-2');
    assert.ok(goal1, 'Q1-1 should exist');
    assert.equal(goal1?.title, 'Ship onboarding v2');
    assert.ok(goal2, 'Q1-2 should exist');
    assert.equal(goal2?.title, 'Launch API v3');
  });

  it('parses success criteria', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/quarter');
    assert.equal(status, 200);
    const body = json as { outcomes: Array<{ id: string; successCriteria: string }> };
    const goal1 = body.outcomes.find(o => o.id === 'Q1-1');
    assert.equal(goal1?.successCriteria, 'Drop-off reduced by 50%');
  });

  it('extracts quarter label', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/quarter');
    assert.equal(status, 200);
    const body = json as { quarter: string };
    assert.equal(body.quarter, '2026-Q1');
  });

  it('response shape matches QuarterOutcome contract', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/quarter');
    assert.equal(status, 200);
    const body = json as {
      outcomes: unknown[];
      quarter: string;
      found: boolean;
    };
    // Verify response shape has exactly the expected properties
    assert.deepEqual(Object.keys(body).sort(), ['found', 'outcomes', 'quarter']);
    
    // Verify each outcome has exactly the expected properties
    for (const outcome of body.outcomes) {
      const outcomeKeys = Object.keys(outcome as Record<string, unknown>).sort();
      assert.deepEqual(outcomeKeys, ['id', 'orgAlignment', 'successCriteria', 'title']);
    }
  });
});

describe('GET /quarter — legacy quarter.md format', () => {
  let tmpDir: string;

  // Legacy Format B: ### Qn-N Title with **Success criteria**: and **Org alignment**:
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
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-goals-test-legacy-quarter-'));
    await mkdir(join(tmpDir, 'goals'), { recursive: true });
    await writeFile(join(tmpDir, 'goals', 'quarter.md'), QUARTER_MD, 'utf8');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('parses legacy quarter.md format', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/quarter');
    assert.equal(status, 200);
    const body = json as {
      found: boolean;
      outcomes: Array<{ id: string; title: string; successCriteria: string; orgAlignment: string }>;
      quarter: string;
    };
    assert.equal(body.found, true);
    assert.equal(body.outcomes.length, 2);
    assert.equal(body.quarter, '2026-Q1');
    
    // Verify parsing of legacy format fields
    const goal1 = body.outcomes.find(o => o.id === 'Q1-1');
    assert.ok(goal1);
    assert.equal(goal1?.title, 'Ship onboarding v2');
    assert.equal(goal1?.successCriteria, 'Drop-off reduced by 50%');
    assert.equal(goal1?.orgAlignment, 'Pillar 1: User Growth');
  });
});

// ── GET /list ─────────────────────────────────────────────────────────────────

describe('GET /list — returns full Goal metadata', () => {
  let tmpDir: string;

  // Note: YAML values containing colons must be quoted
  const GOAL = `---
id: Q1-1
title: Ship onboarding v2
quarter: 2026-Q1
status: active
type: outcome
successCriteria: "Drop-off reduced by 50%"
orgAlignment: "Pillar 1: User Growth"
---

Goal body content.
`;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-goals-test-list-'));
    await mkdir(join(tmpDir, 'goals'), { recursive: true });
    await writeFile(join(tmpDir, 'goals', 'ship-onboarding-v2.md'), GOAL, 'utf8');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns full Goal[] with all metadata', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await req(router, 'GET', '/list');
    assert.equal(status, 200);
    const body = json as {
      found: boolean;
      goals: Array<{
        id: string;
        slug: string;
        title: string;
        status: string;
        quarter: string;
        type: string;
        orgAlignment: string;
        successCriteria: string;
        filePath: string;
        body?: string;
      }>;
    };
    assert.equal(body.found, true);
    assert.equal(body.goals.length, 1);
    
    const goal = body.goals[0];
    assert.ok(goal);
    assert.equal(goal.id, 'Q1-1');
    assert.equal(goal.slug, 'ship-onboarding-v2');
    assert.equal(goal.title, 'Ship onboarding v2');
    assert.equal(goal.status, 'active');
    assert.equal(goal.quarter, '2026-Q1');
    assert.equal(goal.type, 'outcome');
    assert.equal(goal.orgAlignment, 'Pillar 1: User Growth');
    assert.equal(goal.successCriteria, 'Drop-off reduced by 50%');
    assert.ok(goal.filePath.endsWith('ship-onboarding-v2.md'));
    assert.equal(goal.body, 'Goal body content.');
  });

  it('returns found=false when no goals exist', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'arete-goals-test-list-empty-'));
    await mkdir(join(emptyDir, 'goals'), { recursive: true });
    
    const router = createGoalsRouter(emptyDir);
    const { status, json } = await req(router, 'GET', '/list');
    assert.equal(status, 200);
    const body = json as { found: boolean; goals: unknown[] };
    assert.equal(body.found, false);
    assert.ok(Array.isArray(body.goals));
    assert.equal(body.goals.length, 0);
    
    await rm(emptyDir, { recursive: true, force: true });
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

- [ ] Complete frontend
- [ ] Write tests
- [ ] Get review

### 2. Finalize pricing model

**Success criteria**: Approved by finance
**Advances quarter goal**: Q1-3
**Effort**: medium

- [ ] Draft pricing doc
- [ ] Review with finance

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

  it('marks priority 1 as done — toggles first checkbox to [x]', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await reqWithBody(router, 'PATCH', '/week/priority', { index: 1, done: true });
    assert.equal(status, 200);
    const body = json as { success: boolean; updatedContent: string };
    assert.equal(body.success, true);
    assert.ok(body.updatedContent.includes('- [x] Complete frontend'), 'first checkbox should be toggled to [x]');
    assert.ok(body.updatedContent.includes('- [ ] Write tests'), 'second checkbox should remain unchecked');
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

  it('marks priority 1 as not done — toggles first [x] back to [ ]', async () => {
    const router = createGoalsRouter(tmpDir);
    const { status, json } = await reqWithBody(router, 'PATCH', '/week/priority', { index: 1, done: false });
    assert.equal(status, 200);
    const body = json as { success: boolean; updatedContent: string };
    assert.equal(body.success, true);
    assert.ok(body.updatedContent.includes('- [ ] Complete frontend'), 'first checkbox should be toggled back to [ ]');
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

  it('toggling done=true multiple times marks more checkboxes', async () => {
    const router = createGoalsRouter(tmpDir);
    // First toggle on priority 2 - marks first checkbox
    const res1 = await reqWithBody(router, 'PATCH', '/week/priority', { index: 2, done: true });
    assert.equal(res1.status, 200);
    const body1 = res1.json as { updatedContent: string };
    assert.ok(body1.updatedContent.includes('- [x] Draft pricing doc'), 'first checkbox marked');

    // Second toggle on priority 2 - marks second checkbox
    const res2 = await reqWithBody(router, 'PATCH', '/week/priority', { index: 2, done: true });
    assert.equal(res2.status, 200);
    const body2 = res2.json as { updatedContent: string };
    assert.ok(body2.updatedContent.includes('- [x] Draft pricing doc'), 'first checkbox still marked');
    assert.ok(body2.updatedContent.includes('- [x] Review with finance'), 'second checkbox now marked');
  });

  it('returns 400 when no unchecked items to mark done', async () => {
    const router = createGoalsRouter(tmpDir);
    // Priority 2 already has all checkboxes marked from previous test
    const { status, json } = await reqWithBody(router, 'PATCH', '/week/priority', { index: 2, done: true });
    assert.equal(status, 400);
    const body = json as { error: string };
    assert.ok(body.error.includes('No unchecked items'), 'should return error about no unchecked items');
  });

  it('returns 400 when no checked items to uncheck', async () => {
    // Create a fresh workspace with no checked items
    const freshDir = await mkdtemp(join(tmpdir(), 'arete-goals-test-no-checked-'));
    await mkdir(join(freshDir, 'now'), { recursive: true });
    await writeFile(join(freshDir, 'now', 'week.md'), WEEK_MD, 'utf8');

    const router = createGoalsRouter(freshDir);
    const { status, json } = await reqWithBody(router, 'PATCH', '/week/priority', { index: 1, done: false });
    assert.equal(status, 400);
    const body = json as { error: string };
    assert.ok(body.error.includes('No checked items'), 'should return error about no checked items');

    await rm(freshDir, { recursive: true, force: true });
  });

  it('handles legacy standalone [x] format — backwards compatibility', async () => {
    // Create workspace with old-style standalone [x] (from buggy code)
    const legacyDir = await mkdtemp(join(tmpdir(), 'arete-goals-test-legacy-'));
    await mkdir(join(legacyDir, 'now'), { recursive: true });
    
    const legacyContent = `# This Week

**Week of**: 2026-03-03

## Priorities

### 1. Legacy priority

Some text about this priority.
[x]

### 2. Another priority

- [ ] Task A
`;
    await writeFile(join(legacyDir, 'now', 'week.md'), legacyContent, 'utf8');

    const router = createGoalsRouter(legacyDir);
    
    // First verify GET sees it as done
    const getRes = await req(router, 'GET', '/week');
    assert.equal(getRes.status, 200);
    const getBody = getRes.json as { priorities: Array<{ index: number; done: boolean }> };
    const p1 = getBody.priorities.find(p => p.index === 1);
    assert.equal(p1?.done, true, 'legacy [x] should be detected as done');

    // Now PATCH to unmark done — should succeed and remove standalone [x]
    const { status, json } = await reqWithBody(router, 'PATCH', '/week/priority', { index: 1, done: false });
    assert.equal(status, 200, 'should successfully unmark legacy done');
    const body = json as { success: boolean; updatedContent: string };
    assert.equal(body.success, true);
    assert.ok(!body.updatedContent.includes('[x]'), 'standalone [x] should be removed');
    assert.ok(body.updatedContent.includes('Some text about this priority.'), 'other content preserved');

    // Verify GET now sees it as not done
    const getRes2 = await req(router, 'GET', '/week');
    const getBody2 = getRes2.json as { priorities: Array<{ index: number; done: boolean }> };
    const p1After = getBody2.priorities.find(p => p.index === 1);
    assert.equal(p1After?.done, false, 'should now be marked as not done');

    await rm(legacyDir, { recursive: true, force: true });
  });
});
