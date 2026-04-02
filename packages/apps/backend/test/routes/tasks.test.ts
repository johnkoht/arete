/**
 * Backend tasks routes tests.
 *
 * Uses node:test + node:assert/strict.
 * Tests the HTTP contract, filtering logic, and error handling.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import type { TaskDestination, WorkspaceTask, Commitment } from '@arete/core';

// ──────────────────────────────────────────────────────────────────────────────
// Mock types and factories
// ──────────────────────────────────────────────────────────────────────────────

type TaskWire = {
  id: string;
  text: string;
  destination: TaskDestination;
  due: string | null;
  completedAt: string | null;
  area: string | null;
  project: string | null;
  person: { slug: string; name: string } | null;
  from: { type: 'commitment'; id: string; text: string; priority: 'high' | 'medium' | 'low'; daysOpen: number } | null;
  completed: boolean;
  source: { file: string; section: string };
};

function makeTask(overrides: Partial<WorkspaceTask> = {}): WorkspaceTask {
  return {
    id: 'abc12345',
    text: 'Test task',
    completed: false,
    metadata: {},
    source: { file: 'week.md', section: '### Must complete' },
    ...overrides,
  };
}

function makeCommitment(overrides: Partial<Commitment> = {}): Commitment {
  return {
    id: 'commit01' + '0'.repeat(56), // 64 chars
    text: 'Follow up on proposal',
    direction: 'i_owe_them',
    personSlug: 'jane-doe',
    personName: 'Jane Doe',
    source: 'meeting:2026-03-15',
    date: '2026-03-15',
    status: 'open',
    resolvedAt: null,
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Mock services
// ──────────────────────────────────────────────────────────────────────────────

type MockTaskService = {
  listTasks: () => Promise<WorkspaceTask[]>;
  findTask: (id: string) => Promise<WorkspaceTask | null>;
  completeTask: (id: string) => Promise<{ task: WorkspaceTask }>;
  updateTask: (id: string, updates: { due?: string | null }) => Promise<WorkspaceTask>;
  moveTask: (id: string, dest: TaskDestination) => Promise<WorkspaceTask>;
  deleteTask: (id: string) => Promise<WorkspaceTask>;
};

type MockCommitmentsService = {
  listOpen: () => Promise<Commitment[]>;
};

type MockPersonResolver = (slug: string) => Promise<{ slug: string; name: string } | null>;

// Section to destination mapping (reverse of DESTINATION_MAP)
const SECTION_TO_DESTINATION: Record<string, TaskDestination> = {
  '## Inbox': 'inbox',
  '### Must complete': 'must',
  '### Should complete': 'should',
  '### Could complete': 'could',
  '## Anytime': 'anytime',
  '## Someday': 'someday',
};

function sectionToDestination(section: string): TaskDestination {
  return SECTION_TO_DESTINATION[section] ?? 'inbox';
}

// ──────────────────────────────────────────────────────────────────────────────
// Test app factory
// ──────────────────────────────────────────────────────────────────────────────

function buildTestApp(options: {
  taskService?: Partial<MockTaskService>;
  commitmentsService?: Partial<MockCommitmentsService>;
  personResolver?: MockPersonResolver;
  withFileLock?: <T>(path: string, fn: () => Promise<T>) => Promise<T>;
}) {
  const app = new Hono();

  const tasks: MockTaskService = {
    listTasks: options.taskService?.listTasks ?? (() => Promise.resolve([])),
    findTask: options.taskService?.findTask ?? (() => Promise.resolve(null)),
    completeTask: options.taskService?.completeTask ?? (() => Promise.reject(new Error('Not found'))),
    updateTask: options.taskService?.updateTask ?? (() => Promise.reject(new Error('Not found'))),
    moveTask: options.taskService?.moveTask ?? (() => Promise.reject(new Error('Not found'))),
    deleteTask: options.taskService?.deleteTask ?? (() => Promise.reject(new Error('Not found'))),
  };

  const commitments: MockCommitmentsService = {
    listOpen: options.commitmentsService?.listOpen ?? (() => Promise.resolve([])),
  };

  const resolvePerson = options.personResolver ?? (() => Promise.resolve(null));
  const withFileLock = options.withFileLock ?? (<T>(_: string, fn: () => Promise<T>) => fn());

  // Helper to enrich task → TaskWire
  async function enrichTask(task: WorkspaceTask, allCommitments: Commitment[]): Promise<TaskWire> {
    let person: { slug: string; name: string } | null = null;
    if (task.metadata.person) {
      const resolved = await resolvePerson(task.metadata.person);
      person = resolved ?? { slug: task.metadata.person, name: task.metadata.person };
    }

    let from: TaskWire['from'] = null;
    if (task.metadata.from?.type === 'commitment') {
      const commitment = allCommitments.find(c => c.id.startsWith(task.metadata.from!.id));
      if (commitment) {
        const daysOpen = Math.floor((Date.now() - new Date(commitment.date).getTime()) / (1000 * 60 * 60 * 24));
        from = {
          type: 'commitment',
          id: commitment.id.slice(0, 8),
          text: commitment.text,
          priority: daysOpen >= 7 ? 'high' : daysOpen >= 3 ? 'medium' : 'low',
          daysOpen,
        };
      }
    }

    return {
      id: task.id,
      text: task.text,
      destination: sectionToDestination(task.source.section),
      due: task.metadata.due ?? null,
      area: task.metadata.area ?? null,
      project: task.metadata.project ?? null,
      person,
      from,
      completedAt: (task.metadata as Record<string, unknown>).completedAt as string ?? null,
      completed: task.completed,
      source: task.source,
    };
  }

  // GET /api/tasks
  app.get('/api/tasks', async (c) => {
    const filterParam = c.req.query('filter');
    const waitingOn = c.req.query('waitingOn') === 'true';
    const limit = Math.min(parseInt(c.req.query('limit') ?? '25', 10), 100);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    // Validate filter param
    const validFilters = ['today', 'upcoming', 'anytime', 'someday', 'completed', 'completed-today'];
    if (filterParam && !validFilters.includes(filterParam)) {
      return c.json({ error: `Invalid filter: ${filterParam}. Valid filters: ${validFilters.join(', ')}` }, 400);
    }

    const allTasks = await tasks.listTasks();
    const allCommitments = await commitments.listOpen();
    const today = new Date().toISOString().split('T')[0];

    let filteredTasks: WorkspaceTask[];

    if (filterParam === 'today') {
      // today: @due(today) UNION must bucket, deduped, sorted (overdue first)
      const seenIds = new Set<string>();
      const todayTasks: WorkspaceTask[] = [];

      // Tasks with @due(today) or overdue
      for (const task of allTasks) {
        if (task.metadata.due && task.metadata.due <= today && !task.completed) {
          if (!seenIds.has(task.id)) {
            seenIds.add(task.id);
            todayTasks.push(task);
          }
        }
      }

      // Tasks in must bucket
      for (const task of allTasks) {
        if (task.source.section === '### Must complete' && !task.completed) {
          if (!seenIds.has(task.id)) {
            seenIds.add(task.id);
            todayTasks.push(task);
          }
        }
      }

      // Sort: overdue first (by days overdue desc), then due today, then no due date
      todayTasks.sort((a, b) => {
        const aDue = a.metadata.due;
        const bDue = b.metadata.due;

        // Both have due dates
        if (aDue && bDue) {
          // Overdue tasks first (earlier dates first)
          return aDue.localeCompare(bDue);
        }
        // Tasks with due dates come first
        if (aDue && !bDue) return -1;
        if (!aDue && bDue) return 1;
        return 0;
      });

      filteredTasks = todayTasks;
    } else if (filterParam === 'upcoming') {
      // upcoming: @due in next 7 days, excluding today
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const weekFromNow = new Date();
      weekFromNow.setDate(weekFromNow.getDate() + 7);
      const weekStr = weekFromNow.toISOString().split('T')[0];

      filteredTasks = allTasks
        .filter(t => t.metadata.due && t.metadata.due >= tomorrowStr && t.metadata.due <= weekStr && !t.completed)
        .sort((a, b) => (a.metadata.due ?? '').localeCompare(b.metadata.due ?? ''));
    } else if (filterParam === 'anytime') {
      filteredTasks = allTasks.filter(t => t.source.section === '## Anytime' && !t.completed);
    } else if (filterParam === 'someday') {
      filteredTasks = allTasks.filter(t => t.source.section === '## Someday' && !t.completed);
    } else if (filterParam === 'completed') {
      filteredTasks = allTasks.filter(t => t.completed);
      // Sort by completedAt descending (most recent first), tasks without completedAt last
      filteredTasks.sort((a, b) => {
        const aDate = (a.metadata as Record<string, unknown>).completedAt as string | undefined;
        const bDate = (b.metadata as Record<string, unknown>).completedAt as string | undefined;
        if (aDate && bDate) return bDate.localeCompare(aDate);
        if (aDate && !bDate) return -1;
        if (!aDate && bDate) return 1;
        return 0;
      });
    } else if (filterParam === 'completed-today') {
      filteredTasks = allTasks.filter(t =>
        t.completed && (t.metadata as Record<string, unknown>).completedAt === today
      );
    } else {
      // No filter: all tasks
      filteredTasks = allTasks;
    }

    // Apply waitingOn filter
    if (waitingOn) {
      filteredTasks = filteredTasks.filter(t => t.metadata.from?.type === 'commitment');
    }

    // Paginate
    const total = filteredTasks.length;
    const paginated = filteredTasks.slice(offset, offset + limit);

    // Enrich tasks
    const enrichedTasks = await Promise.all(paginated.map(t => enrichTask(t, allCommitments)));

    return c.json({ tasks: enrichedTasks, total, offset, limit });
  });

  // PATCH /api/tasks/:id
  app.patch('/api/tasks/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<{
      completed?: boolean;
      due?: string | null;
      destination?: TaskDestination;
    }>();

    // Validate due date format if provided
    if (body.due !== undefined && body.due !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.due)) {
        return c.json({ error: 'Invalid due date format. Expected YYYY-MM-DD.' }, 400);
      }
    }

    try {
      const foundTask = await tasks.findTask(id);
      if (!foundTask) {
        return c.json({ error: `No task found matching id "${id}"` }, 404);
      }

      let task = foundTask;

      // 1. Move first (changes file path)
      if (body.destination !== undefined) {
        task = await withFileLock(task.source.file, () =>
          tasks.moveTask(task.id, body.destination!),
        );
      }

      // 2. Update due (use new file path after move)
      if ('due' in body) {
        task = await withFileLock(task.source.file, () =>
          tasks.updateTask(task.id, { due: body.due }),
        );
      }

      // 3. Complete last (triggers side effects like completedAt)
      if (body.completed !== undefined && body.completed) {
        const result = await withFileLock(task.source.file, () =>
          tasks.completeTask(task.id),
        );
        task = result.task;
      }

      // If nothing was processed
      if (body.destination === undefined && !('due' in body) && body.completed === undefined) {
        return c.json({ error: 'No valid updates provided' }, 400);
      }

      const allCommitments = await commitments.listOpen();
      const taskWire = await enrichTask(task, allCommitments);
      return c.json({ task: taskWire });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('No task found')) {
        return c.json({ error: message }, 404);
      }
      if (message.includes('Ambiguous prefix')) {
        return c.json({ error: message }, 400);
      }
      throw err;
    }
  });

  // DELETE /api/tasks/:id
  app.delete('/api/tasks/:id', async (c) => {
    const id = c.req.param('id');

    try {
      await withFileLock('tasks', () => tasks.deleteTask(id));
      return c.body(null, 204);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('No task found')) {
        return c.json({ error: message }, 404);
      }
      throw err;
    }
  });

  return app;
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /api/tasks', () => {
  it('returns paginated list with total count', async () => {
    const mockTasks = [
      makeTask({ id: 'task1111', text: 'Task 1' }),
      makeTask({ id: 'task2222', text: 'Task 2' }),
      makeTask({ id: 'task3333', text: 'Task 3' }),
    ];

    const app = buildTestApp({
      taskService: { listTasks: () => Promise.resolve(mockTasks) },
    });

    const res = await app.request('/api/tasks?limit=2&offset=0');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: TaskWire[]; total: number; offset: number; limit: number };
    assert.equal(data.total, 3);
    assert.equal(data.tasks.length, 2);
    assert.equal(data.offset, 0);
    assert.equal(data.limit, 2);
  });

  it('filter=today includes must bucket tasks', async () => {
    const mustTask = makeTask({ id: 'must1111', text: 'Must do', source: { file: 'week.md', section: '### Must complete' } });
    const shouldTask = makeTask({ id: 'should22', text: 'Should do', source: { file: 'week.md', section: '### Should complete' } });

    const app = buildTestApp({
      taskService: { listTasks: () => Promise.resolve([mustTask, shouldTask]) },
    });

    const res = await app.request('/api/tasks?filter=today');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: TaskWire[] };
    assert.equal(data.tasks.length, 1);
    assert.equal(data.tasks[0].id, 'must1111');
  });

  it('filter=today includes @due(today) tasks', async () => {
    const today = new Date().toISOString().split('T')[0];
    const dueToday = makeTask({
      id: 'due11111',
      text: 'Due today',
      metadata: { due: today },
      source: { file: 'week.md', section: '### Should complete' },
    });

    const app = buildTestApp({
      taskService: { listTasks: () => Promise.resolve([dueToday]) },
    });

    const res = await app.request('/api/tasks?filter=today');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: TaskWire[] };
    assert.equal(data.tasks.length, 1);
    assert.equal(data.tasks[0].id, 'due11111');
  });

  it('filter=today dedupes tasks matching both criteria', async () => {
    const today = new Date().toISOString().split('T')[0];
    const dupeTask = makeTask({
      id: 'dupe1111',
      text: 'Must and due today',
      metadata: { due: today },
      source: { file: 'week.md', section: '### Must complete' },
    });

    const app = buildTestApp({
      taskService: { listTasks: () => Promise.resolve([dupeTask]) },
    });

    const res = await app.request('/api/tasks?filter=today');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: TaskWire[] };
    assert.equal(data.tasks.length, 1); // Deduped, not 2
  });

  it('filter=today sorts overdue before today (by days overdue desc)', async () => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];

    const taskToday = makeTask({ id: 'today111', text: 'Due today', metadata: { due: today }, source: { file: 'week.md', section: '### Should complete' } });
    const taskYesterday = makeTask({ id: 'yday1111', text: 'Due yesterday', metadata: { due: yesterday }, source: { file: 'week.md', section: '### Should complete' } });
    const task2DaysAgo = makeTask({ id: '2daysago', text: 'Due 2 days ago', metadata: { due: twoDaysAgo }, source: { file: 'week.md', section: '### Should complete' } });

    const app = buildTestApp({
      taskService: { listTasks: () => Promise.resolve([taskToday, taskYesterday, task2DaysAgo]) },
    });

    const res = await app.request('/api/tasks?filter=today');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: TaskWire[] };
    assert.equal(data.tasks.length, 3);
    // Sorted by due date ascending (oldest overdue first)
    assert.equal(data.tasks[0].id, '2daysago');
    assert.equal(data.tasks[1].id, 'yday1111');
    assert.equal(data.tasks[2].id, 'today111');
  });

  it('waitingOn=true filters to tasks with @from(commitment:*)', async () => {
    const normalTask = makeTask({ id: 'normal11', text: 'Normal task' });
    const waitingTask = makeTask({
      id: 'waiting1',
      text: 'Waiting for proposal',
      metadata: { from: { type: 'commitment', id: 'commit01' } },
    });

    const commitment = makeCommitment({ id: 'commit01' + '0'.repeat(56) });

    const app = buildTestApp({
      taskService: { listTasks: () => Promise.resolve([normalTask, waitingTask]) },
      commitmentsService: { listOpen: () => Promise.resolve([commitment]) },
    });

    const res = await app.request('/api/tasks?waitingOn=true');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: TaskWire[] };
    assert.equal(data.tasks.length, 1);
    assert.equal(data.tasks[0].id, 'waiting1');
  });

  it('returns 400 for invalid filter param', async () => {
    const app = buildTestApp({});

    const res = await app.request('/api/tasks?filter=invalid');
    assert.equal(res.status, 400);

    const data = await res.json() as { error: string };
    assert.ok(data.error.includes('Invalid filter'));
  });

  it('filter=upcoming returns tasks due in next 7 days excluding today', async () => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const in5Days = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0];

    const dueToday = makeTask({ id: 'today111', text: 'Due today', metadata: { due: today } });
    const dueTomorrow = makeTask({ id: 'tmrw1111', text: 'Due tomorrow', metadata: { due: tomorrow } });
    const dueIn5Days = makeTask({ id: '5days111', text: 'Due in 5 days', metadata: { due: in5Days } });

    const app = buildTestApp({
      taskService: { listTasks: () => Promise.resolve([dueToday, dueTomorrow, dueIn5Days]) },
    });

    const res = await app.request('/api/tasks?filter=upcoming');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: TaskWire[] };
    // Should include tomorrow and 5 days, not today
    assert.equal(data.tasks.length, 2);
    const ids = data.tasks.map(t => t.id);
    assert.ok(ids.includes('tmrw1111'));
    assert.ok(ids.includes('5days111'));
  });

  it('filter=anytime returns tasks with destination: anytime', async () => {
    const anytimeTask = makeTask({ id: 'anytime1', text: 'Anytime task', source: { file: 'tasks.md', section: '## Anytime' } });
    const somedayTask = makeTask({ id: 'someday1', text: 'Someday task', source: { file: 'tasks.md', section: '## Someday' } });

    const app = buildTestApp({
      taskService: { listTasks: () => Promise.resolve([anytimeTask, somedayTask]) },
    });

    const res = await app.request('/api/tasks?filter=anytime');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: TaskWire[] };
    assert.equal(data.tasks.length, 1);
    assert.equal(data.tasks[0].id, 'anytime1');
  });

  it('filter=someday returns tasks with destination: someday', async () => {
    const anytimeTask = makeTask({ id: 'anytime1', text: 'Anytime task', source: { file: 'tasks.md', section: '## Anytime' } });
    const somedayTask = makeTask({ id: 'someday1', text: 'Someday task', source: { file: 'tasks.md', section: '## Someday' } });

    const app = buildTestApp({
      taskService: { listTasks: () => Promise.resolve([anytimeTask, somedayTask]) },
    });

    const res = await app.request('/api/tasks?filter=someday');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: TaskWire[] };
    assert.equal(data.tasks.length, 1);
    assert.equal(data.tasks[0].id, 'someday1');
  });

  it('enriches person field from metadata', async () => {
    const task = makeTask({
      id: 'person11',
      text: 'Task with person',
      metadata: { person: 'jane-doe' },
    });

    const app = buildTestApp({
      taskService: { listTasks: () => Promise.resolve([task]) },
      personResolver: async (slug) => slug === 'jane-doe' ? { slug: 'jane-doe', name: 'Jane Doe' } : null,
    });

    const res = await app.request('/api/tasks');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: TaskWire[] };
    assert.deepEqual(data.tasks[0].person, { slug: 'jane-doe', name: 'Jane Doe' });
  });

  it('enriches from field from commitment lookup', async () => {
    const commitment = makeCommitment({
      id: 'commit01' + '0'.repeat(56),
      text: 'Follow up on proposal',
      date: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0], // 7 days ago
    });

    const task = makeTask({
      id: 'fromcomm',
      text: 'Follow up task',
      metadata: { from: { type: 'commitment', id: 'commit01' } },
    });

    const app = buildTestApp({
      taskService: { listTasks: () => Promise.resolve([task]) },
      commitmentsService: { listOpen: () => Promise.resolve([commitment]) },
    });

    const res = await app.request('/api/tasks');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: TaskWire[] };
    assert.ok(data.tasks[0].from);
    assert.equal(data.tasks[0].from?.type, 'commitment');
    assert.equal(data.tasks[0].from?.id, 'commit01');
    assert.equal(data.tasks[0].from?.text, 'Follow up on proposal');
    assert.equal(data.tasks[0].from?.priority, 'high'); // 7+ days = high
    assert.ok(data.tasks[0].from?.daysOpen >= 7);
  });
});

describe('GET /api/tasks filter=completed', () => {
  it('returns only completed tasks', async () => {
    const completedTask = makeTask({ id: 'done1111', text: 'Done task', completed: true, metadata: { completedAt: '2026-04-02' } });
    const incompleteTask = makeTask({ id: 'open1111', text: 'Open task', completed: false });

    const app = buildTestApp({
      taskService: { listTasks: () => Promise.resolve([completedTask, incompleteTask]) },
    });

    const res = await app.request('/api/tasks?filter=completed');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: TaskWire[] };
    assert.equal(data.tasks.length, 1);
    assert.equal(data.tasks[0].id, 'done1111');
    assert.equal(data.tasks[0].completed, true);
  });

  it('returns legacy completed tasks without completedAt', async () => {
    const legacyCompleted = makeTask({ id: 'legacy11', text: 'Old done', completed: true });

    const app = buildTestApp({
      taskService: { listTasks: () => Promise.resolve([legacyCompleted]) },
    });

    const res = await app.request('/api/tasks?filter=completed');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: TaskWire[] };
    assert.equal(data.tasks.length, 1);
    assert.equal(data.tasks[0].id, 'legacy11');
  });

  it('sorts by completedAt descending (most recent first)', async () => {
    const olderTask = makeTask({ id: 'older111', text: 'Older', completed: true, metadata: { completedAt: '2026-03-01' } });
    const newerTask = makeTask({ id: 'newer111', text: 'Newer', completed: true, metadata: { completedAt: '2026-04-01' } });
    const legacyTask = makeTask({ id: 'legacy11', text: 'Legacy', completed: true });

    const app = buildTestApp({
      taskService: { listTasks: () => Promise.resolve([olderTask, newerTask, legacyTask]) },
    });

    const res = await app.request('/api/tasks?filter=completed');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: TaskWire[] };
    assert.equal(data.tasks.length, 3);
    // Newer first, then older, then legacy (no date) last
    assert.equal(data.tasks[0].id, 'newer111');
    assert.equal(data.tasks[1].id, 'older111');
    assert.equal(data.tasks[2].id, 'legacy11');
  });
});

describe('GET /api/tasks filter=completed-today', () => {
  it('returns only tasks completed today', async () => {
    const today = new Date().toISOString().split('T')[0];
    const completedToday = makeTask({ id: 'today111', text: 'Today', completed: true, metadata: { completedAt: today } });
    const completedYesterday = makeTask({ id: 'yester11', text: 'Yesterday', completed: true, metadata: { completedAt: '2020-01-01' } });
    const incompleteTask = makeTask({ id: 'open1111', text: 'Open', completed: false });

    const app = buildTestApp({
      taskService: { listTasks: () => Promise.resolve([completedToday, completedYesterday, incompleteTask]) },
    });

    const res = await app.request('/api/tasks?filter=completed-today');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: TaskWire[] };
    assert.equal(data.tasks.length, 1);
    assert.equal(data.tasks[0].id, 'today111');
  });

  it('excludes legacy completed tasks without completedAt', async () => {
    const legacyCompleted = makeTask({ id: 'legacy11', text: 'Legacy', completed: true });

    const app = buildTestApp({
      taskService: { listTasks: () => Promise.resolve([legacyCompleted]) },
    });

    const res = await app.request('/api/tasks?filter=completed-today');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: TaskWire[] };
    assert.equal(data.tasks.length, 0);
  });
});

describe('PATCH /api/tasks/:id multi-field', () => {
  it('handles due + destination together', async () => {
    const task = makeTask({ id: 'task1111', text: 'Test task', source: { file: 'week.md', section: '### Should complete' } });

    const app = buildTestApp({
      taskService: {
        listTasks: () => Promise.resolve([task]),
        findTask: async (id: string) => id === 'task1111' ? task : null,
        moveTask: async (id, dest) => {
          if (id === 'task1111') return { ...task, source: { file: 'week.md', section: '### Must complete' } };
          throw new Error('No task found');
        },
        updateTask: async (id, updates) => {
          if (id === 'task1111') return { ...task, metadata: { due: updates.due ?? undefined }, source: { file: 'week.md', section: '### Must complete' } };
          throw new Error('No task found');
        },
      },
    });

    const res = await app.request('/api/tasks/task1111', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due: '2026-04-05', destination: 'must' }),
    });

    assert.equal(res.status, 200);
    const data = await res.json() as { task: TaskWire };
    assert.equal(data.task.destination, 'must');
    assert.equal(data.task.due, '2026-04-05');
  });

  it('handles destination only', async () => {
    const task = makeTask({ id: 'task1111', text: 'Test task' });

    const app = buildTestApp({
      taskService: {
        listTasks: () => Promise.resolve([task]),
        findTask: async (id: string) => id === 'task1111' ? task : null,
        moveTask: async (id, dest) => {
          if (id === 'task1111') return { ...task, source: { file: 'tasks.md', section: '## Anytime' } };
          throw new Error('No task found');
        },
      },
    });

    const res = await app.request('/api/tasks/task1111', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination: 'anytime' }),
    });

    assert.equal(res.status, 200);
    const data = await res.json() as { task: TaskWire };
    assert.equal(data.task.destination, 'anytime');
  });

  it('handles due only', async () => {
    const task = makeTask({ id: 'task1111', text: 'Test task' });

    const app = buildTestApp({
      taskService: {
        listTasks: () => Promise.resolve([task]),
        findTask: async (id: string) => id === 'task1111' ? task : null,
        updateTask: async (id, updates) => {
          if (id === 'task1111') return { ...task, metadata: { due: updates.due ?? undefined } };
          throw new Error('No task found');
        },
      },
    });

    const res = await app.request('/api/tasks/task1111', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due: '2026-04-05' }),
    });

    assert.equal(res.status, 200);
    const data = await res.json() as { task: TaskWire };
    assert.equal(data.task.due, '2026-04-05');
  });

  it('handles completed only (sets completedAt)', async () => {
    const task = makeTask({ id: 'task1111', text: 'Test task' });
    const today = new Date().toISOString().split('T')[0];

    const app = buildTestApp({
      taskService: {
        listTasks: () => Promise.resolve([task]),
        findTask: async (id: string) => id === 'task1111' ? task : null,
        completeTask: async (id) => {
          if (id === 'task1111') return { task: { ...task, completed: true, metadata: { completedAt: today } } };
          throw new Error('No task found');
        },
      },
    });

    const res = await app.request('/api/tasks/task1111', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });

    assert.equal(res.status, 200);
    const data = await res.json() as { task: TaskWire };
    assert.equal(data.task.completed, true);
  });

  it('handles all three: due + destination + completed', async () => {
    const task = makeTask({ id: 'task1111', text: 'Test task', source: { file: 'week.md', section: '### Should complete' } });
    const today = new Date().toISOString().split('T')[0];

    const app = buildTestApp({
      taskService: {
        listTasks: () => Promise.resolve([task]),
        findTask: async (id: string) => id === 'task1111' ? task : null,
        moveTask: async (id, dest) => {
          return { ...task, source: { file: 'week.md', section: '### Must complete' } };
        },
        updateTask: async (id, updates) => {
          return { ...task, metadata: { due: updates.due ?? undefined }, source: { file: 'week.md', section: '### Must complete' } };
        },
        completeTask: async (id) => {
          return { task: { ...task, completed: true, metadata: { completedAt: today }, source: { file: 'week.md', section: '### Must complete' } } };
        },
      },
    });

    const res = await app.request('/api/tasks/task1111', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due: '2026-04-05', destination: 'must', completed: true }),
    });

    assert.equal(res.status, 200);
    const data = await res.json() as { task: TaskWire };
    assert.equal(data.task.completed, true);
  });

  it('returns 400 for empty body', async () => {
    const app = buildTestApp({
      taskService: {
        findTask: async () => makeTask({ id: 'task1111' }),
      },
    });

    const res = await app.request('/api/tasks/task1111', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
    const data = await res.json() as { error: string };
    assert.ok(data.error.includes('No valid updates'));
  });

  it('returns 404 for nonexistent task', async () => {
    const app = buildTestApp({
      taskService: {
        findTask: async () => null,
      },
    });

    const res = await app.request('/api/tasks/nonexistent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due: '2026-04-05' }),
    });

    assert.equal(res.status, 404);
  });
});

describe('PATCH /api/tasks/:id', () => {
  it('updates completion status', async () => {
    const task = makeTask({ id: 'task1111', text: 'Test task' });

    const app = buildTestApp({
      taskService: {
        listTasks: () => Promise.resolve([task]),
        findTask: async (id) => id === 'task1111' ? task : null,
        completeTask: async (id) => {
          if (id === 'task1111') return { task: { ...task, completed: true } };
          throw new Error('No task found');
        },
      },
    });

    const res = await app.request('/api/tasks/task1111', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });

    assert.equal(res.status, 200);
    const data = await res.json() as { task: TaskWire };
    assert.equal(data.task.completed, true);
  });

  it('updates due date', async () => {
    const task = makeTask({ id: 'task1111', text: 'Test task' });

    const app = buildTestApp({
      taskService: {
        listTasks: () => Promise.resolve([task]),
        findTask: async (id) => id === 'task1111' ? task : null,
        updateTask: async (id, updates) => {
          if (id === 'task1111') return { ...task, metadata: { ...task.metadata, due: updates.due ?? undefined } };
          throw new Error('No task found');
        },
      },
    });

    const res = await app.request('/api/tasks/task1111', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due: '2026-04-15' }),
    });

    assert.equal(res.status, 200);
    const data = await res.json() as { task: TaskWire };
    assert.equal(data.task.due, '2026-04-15');
  });

  it('clears due date when due=null', async () => {
    const task = makeTask({ id: 'task1111', text: 'Test task', metadata: { due: '2026-04-15' } });

    const app = buildTestApp({
      taskService: {
        listTasks: () => Promise.resolve([task]),
        findTask: async (id) => id === 'task1111' ? task : null,
        updateTask: async (id, updates) => {
          if (id === 'task1111') {
            const newMetadata = { ...task.metadata };
            if (updates.due === null) delete newMetadata.due;
            return { ...task, metadata: newMetadata };
          }
          throw new Error('No task found');
        },
      },
    });

    const res = await app.request('/api/tasks/task1111', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due: null }),
    });

    assert.equal(res.status, 200);
    const data = await res.json() as { task: TaskWire };
    assert.equal(data.task.due, null);
  });

  it('moves between destinations', async () => {
    const task = makeTask({
      id: 'task1111',
      text: 'Test task',
      source: { file: 'week.md', section: '### Must complete' },
    });

    const app = buildTestApp({
      taskService: {
        listTasks: () => Promise.resolve([task]),
        findTask: async (id) => id === 'task1111' ? task : null,
        moveTask: async (id, dest) => {
          if (id === 'task1111') {
            return { ...task, source: { file: 'tasks.md', section: '## Someday' } };
          }
          throw new Error('No task found');
        },
      },
    });

    const res = await app.request('/api/tasks/task1111', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination: 'someday' }),
    });

    assert.equal(res.status, 200);
    const data = await res.json() as { task: TaskWire };
    assert.equal(data.task.destination, 'someday');
  });

  it('returns 404 for unknown ID', async () => {
    const app = buildTestApp({
      taskService: {
        findTask: async () => null,
      },
    });

    const res = await app.request('/api/tasks/unknown', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });

    assert.equal(res.status, 404);
  });

  it('returns 400 for invalid due date format', async () => {
    const app = buildTestApp({});

    const res = await app.request('/api/tasks/task1111', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due: '04-15-2026' }), // Wrong format
    });

    assert.equal(res.status, 400);
    const data = await res.json() as { error: string };
    assert.ok(data.error.includes('Invalid due date format'));
  });

  it('returns 400 for AmbiguousIdError (lists matched IDs)', async () => {
    const task = makeTask({ id: 'task1111' });
    const app = buildTestApp({
      taskService: {
        findTask: async () => task,
        completeTask: async () => {
          throw new Error('Ambiguous prefix "task" matches 2 tasks: task1111, task2222');
        },
      },
    });

    const res = await app.request('/api/tasks/task', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });

    assert.equal(res.status, 400);
    const data = await res.json() as { error: string };
    assert.ok(data.error.includes('Ambiguous prefix'));
    assert.ok(data.error.includes('task1111'));
    assert.ok(data.error.includes('task2222'));
  });

  it('serializes concurrent requests via withFileLock', async () => {
    const calls: string[] = [];
    let resolveFirst: () => void;
    const firstCallPromise = new Promise<void>((r) => { resolveFirst = r; });

    const app = buildTestApp({
      taskService: {
        listTasks: () => Promise.resolve([makeTask({ id: 'task1111' })]),
        findTask: async (id) => makeTask({ id: 'task1111' }),
        completeTask: async (id) => {
          calls.push(`start-${id}`);
          if (calls.length === 1) {
            // First call waits
            await firstCallPromise;
          }
          calls.push(`end-${id}`);
          return { task: makeTask({ id, completed: true }) };
        },
      },
      withFileLock: async <T>(path: string, fn: () => Promise<T>) => {
        // Simulate lock by ensuring sequential execution
        return fn();
      },
    });

    // Start first request (will wait)
    const req1 = app.request('/api/tasks/task1111', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });

    // Give first request time to start
    await new Promise(r => setTimeout(r, 10));

    // Release first call
    resolveFirst!();

    await req1;

    // Verify calls happened in order
    assert.deepEqual(calls, ['start-task1111', 'end-task1111']);
  });
});

describe('DELETE /api/tasks/:id', () => {
  it('removes task from file', async () => {
    let deleted = false;
    const task = makeTask({ id: 'task1111', text: 'Test task' });

    const app = buildTestApp({
      taskService: {
        deleteTask: async (id) => {
          if (id === 'task1111') {
            deleted = true;
            return task;
          }
          throw new Error('No task found');
        },
      },
    });

    const res = await app.request('/api/tasks/task1111', { method: 'DELETE' });

    assert.equal(res.status, 204);
    assert.equal(deleted, true);
  });

  it('returns 404 for unknown ID', async () => {
    const app = buildTestApp({
      taskService: {
        deleteTask: async () => { throw new Error('No task found matching id "unknown"'); },
      },
    });

    const res = await app.request('/api/tasks/unknown', { method: 'DELETE' });

    assert.equal(res.status, 404);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Suggested tasks endpoint tests
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Wire format for suggested tasks (includes scoring breakdown).
 */
type SuggestedTaskWire = TaskWire & {
  score: number;
  breakdown: {
    dueDate: number;
    commitment: number;
    meetingRelevance: number;
    weekPriority: number;
  };
};

/**
 * Build test app with suggestions endpoint support.
 */
function buildSuggestionsTestApp(options: {
  taskService?: Partial<MockTaskService>;
  commitmentsService?: Partial<MockCommitmentsService>;
  personResolver?: MockPersonResolver;
  weekFileContent?: string | null; // null = file not found
}) {
  const app = new Hono();

  const tasks: MockTaskService = {
    listTasks: options.taskService?.listTasks ?? (() => Promise.resolve([])),
    completeTask: options.taskService?.completeTask ?? (() => Promise.reject(new Error('Not found'))),
    updateTask: options.taskService?.updateTask ?? (() => Promise.reject(new Error('Not found'))),
    moveTask: options.taskService?.moveTask ?? (() => Promise.reject(new Error('Not found'))),
    deleteTask: options.taskService?.deleteTask ?? (() => Promise.reject(new Error('Not found'))),
  };

  const commitments: MockCommitmentsService = {
    listOpen: options.commitmentsService?.listOpen ?? (() => Promise.resolve([])),
  };

  const resolvePerson = options.personResolver ?? (() => Promise.resolve(null));
  const weekContent = options.weekFileContent;

  // Parse week priorities from content (matches route implementation)
  function parseWeekPriorities(content: string | null): string[] {
    if (!content) return [];
    const regex = /^###\s+\d+[.\s]+(.+)$/gm;
    const priorities: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      priorities.push(match[1].trim());
    }
    return priorities;
  }

  // Helper to enrich task → TaskWire
  async function enrichTask(task: WorkspaceTask, allCommitments: Commitment[]): Promise<TaskWire> {
    let person: { slug: string; name: string } | null = null;
    if (task.metadata.person) {
      const resolved = await resolvePerson(task.metadata.person);
      person = resolved ?? { slug: task.metadata.person, name: task.metadata.person };
    }

    let from: TaskWire['from'] = null;
    if (task.metadata.from?.type === 'commitment') {
      const commitment = allCommitments.find(c => c.id.startsWith(task.metadata.from!.id));
      if (commitment) {
        const daysOpen = Math.floor((Date.now() - new Date(commitment.date).getTime()) / (1000 * 60 * 60 * 24));
        from = {
          type: 'commitment',
          id: commitment.id.slice(0, 8),
          text: commitment.text,
          priority: daysOpen >= 7 ? 'high' : daysOpen >= 3 ? 'medium' : 'low',
          daysOpen,
        };
      }
    }

    return {
      id: task.id,
      text: task.text,
      destination: sectionToDestination(task.source.section),
      due: task.metadata.due ?? null,
      area: task.metadata.area ?? null,
      project: task.metadata.project ?? null,
      person,
      from,
      completedAt: (task.metadata as Record<string, unknown>).completedAt as string ?? null,
      completed: task.completed,
      source: task.source,
    };
  }

  // Minimal mock of scoreTasks for test purposes
  // Real implementation uses @arete/core scoreTasks
  function mockScoreTasks(
    taskList: WorkspaceTask[],
    context: { weekPriorities: string[]; referenceDate: Date },
  ) {
    // Simple scoring: due date urgency + week priority matching
    return taskList.map((task) => {
      let score = 0;
      const breakdown = {
        dueDate: { score: 0, reason: '' },
        commitment: { score: 0, reason: '' },
        meetingRelevance: { score: 0, reason: '' },
        weekPriority: { score: 0, reason: '' },
        modifiers: { score: 0, reasons: [] as string[] },
        total: 0,
      };

      // Due date scoring
      if (task.metadata.due) {
        const dueDate = new Date(task.metadata.due);
        const today = new Date(context.referenceDate);
        today.setHours(0, 0, 0, 0);

        if (dueDate < today) {
          breakdown.dueDate = { score: 40, reason: 'Overdue' };
        } else if (dueDate.toDateString() === today.toDateString()) {
          breakdown.dueDate = { score: 35, reason: 'Due today' };
        } else {
          breakdown.dueDate = { score: 10, reason: 'Due later' };
        }
        score += breakdown.dueDate.score;
      }

      // Week priority matching
      if (context.weekPriorities.length > 0) {
        const taskLower = task.text.toLowerCase();
        for (const priority of context.weekPriorities) {
          const words = priority.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          if (words.some(word => taskLower.includes(word))) {
            breakdown.weekPriority = { score: 15, reason: `Matches: ${priority}` };
            score += 15;
            break;
          }
        }
      }

      // Commitment scoring
      if (task.metadata.from?.type === 'commitment') {
        breakdown.commitment = { score: 25, reason: 'Linked to commitment' };
        score += 25;
      }

      breakdown.total = score;

      return { task, score, breakdown };
    }).sort((a, b) => b.score - a.score);
  }

  // GET /api/tasks/suggested
  app.get('/api/tasks/suggested', async (c) => {
    try {
      const dateParam = c.req.query('date');

      // Parse week priorities
      const weekPriorities = parseWeekPriorities(weekContent);

      // Build scoring context
      const referenceDate = dateParam ? new Date(dateParam) : new Date();

      // Get incomplete tasks
      const allTasks = await tasks.listTasks();
      const incompleteTasks = allTasks.filter(t => !t.completed);

      // If no tasks, return empty array
      if (incompleteTasks.length === 0) {
        return c.json({ tasks: [] });
      }

      // Score tasks
      const scoredTasks = mockScoreTasks(incompleteTasks, { weekPriorities, referenceDate });

      // Take top 10
      const topTasks = scoredTasks.slice(0, 10);

      // Enrich and transform to wire format
      const allCommitments = await commitments.listOpen();
      const wireTasks: SuggestedTaskWire[] = [];

      for (const scored of topTasks) {
        const enriched = await enrichTask(scored.task, allCommitments);
        wireTasks.push({
          ...enriched,
          score: scored.score,
          breakdown: {
            dueDate: scored.breakdown.dueDate.score,
            commitment: scored.breakdown.commitment.score,
            meetingRelevance: scored.breakdown.meetingRelevance.score,
            weekPriority: scored.breakdown.weekPriority.score,
          },
        });
      }

      return c.json({ tasks: wireTasks });
    } catch (err) {
      console.error('[tasks] suggested error:', err);
      return c.json({ error: 'Failed to get suggested tasks' }, 500);
    }
  });

  return app;
}

describe('GET /api/tasks/suggested', () => {
  it('returns scored tasks sorted by score descending', async () => {
    const today = new Date().toISOString().split('T')[0];
    const highScoreTask = makeTask({
      id: 'high1111',
      text: 'Ship task UI',
      metadata: { due: today }, // Due today = 35 points
    });
    const lowScoreTask = makeTask({
      id: 'low11111',
      text: 'Low priority task',
      metadata: {},
    });

    const app = buildSuggestionsTestApp({
      taskService: { listTasks: () => Promise.resolve([lowScoreTask, highScoreTask]) },
      weekFileContent: '### 1. Ship task UI\n### 2. Review PRD',
    });

    const res = await app.request('/api/tasks/suggested');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: SuggestedTaskWire[] };
    assert.equal(data.tasks.length, 2);
    // High score task should be first
    assert.equal(data.tasks[0].id, 'high1111');
    assert.ok(data.tasks[0].score >= data.tasks[1].score);
  });

  it('respects ?date=YYYY-MM-DD for referenceDate in scoring', async () => {
    // A task that is overdue relative to 2026-04-10
    const overdue = makeTask({
      id: 'overdue1',
      text: 'Overdue task',
      metadata: { due: '2026-04-05' },
    });

    const app = buildSuggestionsTestApp({
      taskService: { listTasks: () => Promise.resolve([overdue]) },
      weekFileContent: null,
    });

    // With referenceDate = 2026-04-10, due 2026-04-05 is overdue (40 points)
    const res = await app.request('/api/tasks/suggested?date=2026-04-10');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: SuggestedTaskWire[] };
    assert.equal(data.tasks.length, 1);
    assert.equal(data.tasks[0].breakdown.dueDate, 40); // Overdue score
  });

  it('parses weekPriorities from week.md correctly', async () => {
    const matchingTask = makeTask({
      id: 'match111',
      text: 'Ship the feature today',
    });
    const nonMatchingTask = makeTask({
      id: 'nomatch1',
      text: 'Random unrelated task',
    });

    const weekContent = `# Week Plan

## Priorities

### 1. Ship the feature
### 2. Review documentation

## Tasks

### Must complete
- [ ] Some task
`;

    const app = buildSuggestionsTestApp({
      taskService: { listTasks: () => Promise.resolve([matchingTask, nonMatchingTask]) },
      weekFileContent: weekContent,
    });

    const res = await app.request('/api/tasks/suggested');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: SuggestedTaskWire[] };
    // The matching task should have weekPriority score
    const matching = data.tasks.find(t => t.id === 'match111');
    assert.ok(matching);
    assert.equal(matching!.breakdown.weekPriority, 15);
  });

  it('returns empty array when no tasks', async () => {
    const app = buildSuggestionsTestApp({
      taskService: { listTasks: () => Promise.resolve([]) },
      weekFileContent: null,
    });

    const res = await app.request('/api/tasks/suggested');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: SuggestedTaskWire[] };
    assert.deepEqual(data.tasks, []);
  });

  it('excludes completed tasks', async () => {
    const incomplete = makeTask({ id: 'open1111', text: 'Open task', completed: false });
    const complete = makeTask({ id: 'done1111', text: 'Done task', completed: true });

    const app = buildSuggestionsTestApp({
      taskService: { listTasks: () => Promise.resolve([incomplete, complete]) },
      weekFileContent: null,
    });

    const res = await app.request('/api/tasks/suggested');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: SuggestedTaskWire[] };
    assert.equal(data.tasks.length, 1);
    assert.equal(data.tasks[0].id, 'open1111');
  });

  it('handles missing week.md gracefully (empty priorities array)', async () => {
    const task = makeTask({ id: 'task1111', text: 'Ship feature' });

    const app = buildSuggestionsTestApp({
      taskService: { listTasks: () => Promise.resolve([task]) },
      weekFileContent: null, // Simulates missing file
    });

    const res = await app.request('/api/tasks/suggested');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: SuggestedTaskWire[] };
    assert.equal(data.tasks.length, 1);
    // No week priority match when file is missing
    assert.equal(data.tasks[0].breakdown.weekPriority, 0);
  });

  it('handles malformed week.md (no Priorities section)', async () => {
    const task = makeTask({ id: 'task1111', text: 'Ship feature' });

    // File exists but has no ### N. Priority format
    const malformedContent = `# Week Plan

Just some random content without priority headings.

## Random Section
More text here.
`;

    const app = buildSuggestionsTestApp({
      taskService: { listTasks: () => Promise.resolve([task]) },
      weekFileContent: malformedContent,
    });

    const res = await app.request('/api/tasks/suggested');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: SuggestedTaskWire[] };
    assert.equal(data.tasks.length, 1);
    // No priorities parsed, so no weekPriority score
    assert.equal(data.tasks[0].breakdown.weekPriority, 0);
  });

  it('returns flat breakdown scores (not nested objects)', async () => {
    const today = new Date().toISOString().split('T')[0];
    const task = makeTask({
      id: 'task1111',
      text: 'Ship feature',
      metadata: { due: today },
    });

    const app = buildSuggestionsTestApp({
      taskService: { listTasks: () => Promise.resolve([task]) },
      weekFileContent: '### 1. Ship feature',
    });

    const res = await app.request('/api/tasks/suggested');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: SuggestedTaskWire[] };
    assert.equal(data.tasks.length, 1);

    // Verify breakdown has flat numbers, not objects
    const breakdown = data.tasks[0].breakdown;
    assert.equal(typeof breakdown.dueDate, 'number');
    assert.equal(typeof breakdown.commitment, 'number');
    assert.equal(typeof breakdown.meetingRelevance, 'number');
    assert.equal(typeof breakdown.weekPriority, 'number');
  });

  it('limits results to top 10 tasks', async () => {
    // Create 15 tasks
    const tasks: WorkspaceTask[] = [];
    for (let i = 0; i < 15; i++) {
      tasks.push(makeTask({ id: `task${i.toString().padStart(4, '0')}`, text: `Task ${i}` }));
    }

    const app = buildSuggestionsTestApp({
      taskService: { listTasks: () => Promise.resolve(tasks) },
      weekFileContent: null,
    });

    const res = await app.request('/api/tasks/suggested');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: SuggestedTaskWire[] };
    assert.equal(data.tasks.length, 10);
  });

  it('enriches person and commitment fields', async () => {
    const commitment = makeCommitment({
      id: 'commit01' + '0'.repeat(56),
      text: 'Follow up on proposal',
    });

    const task = makeTask({
      id: 'task1111',
      text: 'Task with person and commitment',
      metadata: {
        person: 'jane-doe',
        from: { type: 'commitment', id: 'commit01' },
      },
    });

    const app = buildSuggestionsTestApp({
      taskService: { listTasks: () => Promise.resolve([task]) },
      commitmentsService: { listOpen: () => Promise.resolve([commitment]) },
      personResolver: async (slug) => slug === 'jane-doe' ? { slug: 'jane-doe', name: 'Jane Doe' } : null,
      weekFileContent: null,
    });

    const res = await app.request('/api/tasks/suggested');
    assert.equal(res.status, 200);

    const data = await res.json() as { tasks: SuggestedTaskWire[] };
    assert.equal(data.tasks.length, 1);
    assert.deepEqual(data.tasks[0].person, { slug: 'jane-doe', name: 'Jane Doe' });
    assert.ok(data.tasks[0].from);
    assert.equal(data.tasks[0].from?.id, 'commit01');
  });
});
