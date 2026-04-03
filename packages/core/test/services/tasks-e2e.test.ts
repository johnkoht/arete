/**
 * E2E-style tests for task scheduling flows.
 *
 * Tests full TaskService flows: schedule → filter → complete → verify.
 * Uses mock StorageAdapter (no filesystem) but exercises real service logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { StorageAdapter } from '../../src/storage/adapter.js';
import type { WorkspacePaths } from '../../src/models/workspace.js';
import { TaskService } from '../../src/services/tasks.js';

// ---------------------------------------------------------------------------
// Mock StorageAdapter
// ---------------------------------------------------------------------------

type MockStore = Map<string, string>;

function createMockStorage(initial: MockStore = new Map()): StorageAdapter {
  const store: MockStore = initial;
  return {
    async read(path: string): Promise<string | null> {
      return store.get(path) ?? null;
    },
    async write(path: string, content: string): Promise<void> {
      store.set(path, content);
    },
    async exists(path: string): Promise<boolean> {
      return store.has(path);
    },
    async delete(path: string): Promise<void> {
      store.delete(path);
    },
    async list(): Promise<string[]> {
      return [];
    },
    async listSubdirectories(): Promise<string[]> {
      return [];
    },
    async mkdir(): Promise<void> {},
    async getModified(): Promise<Date | null> {
      return null;
    },
  };
}

const WORKSPACE_ROOT = '/workspace';
const WEEK_FILE = join(WORKSPACE_ROOT, 'now/week.md');
const TASKS_FILE = join(WORKSPACE_ROOT, 'now/tasks.md');

function makePaths(): WorkspacePaths {
  return {
    root: WORKSPACE_ROOT,
    manifest: join(WORKSPACE_ROOT, 'arete.yaml'),
    ideConfig: join(WORKSPACE_ROOT, '.cursor'),
    rules: join(WORKSPACE_ROOT, '.cursor/rules'),
    agentSkills: join(WORKSPACE_ROOT, '.agents/skills'),
    tools: join(WORKSPACE_ROOT, '.cursor/tools'),
    integrations: join(WORKSPACE_ROOT, '.arete/integrations'),
    context: join(WORKSPACE_ROOT, 'context'),
    memory: join(WORKSPACE_ROOT, '.arete/memory'),
    now: join(WORKSPACE_ROOT, 'now'),
    goals: join(WORKSPACE_ROOT, 'goals'),
    projects: join(WORKSPACE_ROOT, 'projects'),
    resources: join(WORKSPACE_ROOT, 'resources'),
    people: join(WORKSPACE_ROOT, 'people'),
    credentials: join(WORKSPACE_ROOT, '.credentials'),
    templates: join(WORKSPACE_ROOT, 'templates'),
  };
}

// ---------------------------------------------------------------------------
// E2E Scheduling Flow Tests
// ---------------------------------------------------------------------------

describe('E2E: Schedule task for tomorrow → appears in upcoming filter', () => {
  it('adds a task with tomorrow due date, then filters by upcoming', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const store = new Map<string, string>();
    store.set(WEEK_FILE, `# Week\n### Should complete\n`);
    store.set(TASKS_FILE, `# Tasks\n## Anytime\n`);

    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    // Add a task to should-complete with a due date of tomorrow
    const task = await service.addTask('Prepare slides', 'should', { due: tomorrowStr });
    assert.equal(task.metadata.due, tomorrowStr);

    // List tasks with due filter (upcoming = due <= 7 days from now)
    const allTasks = await service.listTasks({ completed: false });
    const upcomingTasks = allTasks.filter(t => {
      if (!t.metadata.due) return false;
      const today = new Date().toISOString().split('T')[0];
      const weekFromNow = new Date();
      weekFromNow.setDate(weekFromNow.getDate() + 7);
      const weekStr = weekFromNow.toISOString().split('T')[0];
      const tomorrowCheck = new Date();
      tomorrowCheck.setDate(tomorrowCheck.getDate() + 1);
      const tomorrowCheckStr = tomorrowCheck.toISOString().split('T')[0];
      return t.metadata.due >= tomorrowCheckStr && t.metadata.due <= weekStr;
    });

    assert.equal(upcomingTasks.length, 1);
    assert.equal(upcomingTasks[0].text, 'Prepare slides');
    assert.equal(upcomingTasks[0].metadata.due, tomorrowStr);
  });
});

describe('E2E: Move task from someday to today → appears in today filter', () => {
  it('moves a task from someday to must, verifies it appears in must section', async () => {
    const store = new Map<string, string>();
    store.set(WEEK_FILE, `# Week\n### Must complete\n`);
    store.set(TASKS_FILE, `# Tasks\n## Someday\n- [ ] Maybe do this\n`);

    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    // Verify task is in someday
    const somedayTasks = await service.listTasks({ destination: 'someday' });
    assert.equal(somedayTasks.length, 1);
    assert.equal(somedayTasks[0].text, 'Maybe do this');

    // Move to must (today)
    const moved = await service.moveTask(somedayTasks[0].id, 'must');
    assert.equal(moved.source.section, '### Must complete');

    // Verify it's now in must, not someday
    const mustTasks = await service.listTasks({ destination: 'must' });
    assert.equal(mustTasks.length, 1);
    assert.equal(mustTasks[0].text, 'Maybe do this');

    const remainingSomeday = await service.listTasks({ destination: 'someday' });
    assert.equal(remainingSomeday.length, 0);
  });
});

describe('E2E: Complete task → appears in completed filter with completedAt', () => {
  it('completes a task and verifies completedAt is set and task appears in completed filter', async () => {
    const store = new Map<string, string>();
    store.set(WEEK_FILE, `# Week\n### Must complete\n- [ ] Ship feature\n`);
    store.set(TASKS_FILE, `# Tasks\n## Anytime\n`);

    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks({ destination: 'must' });
    assert.equal(tasks.length, 1);

    // Complete the task
    const { task: completedTask } = await service.completeTask(tasks[0].id);
    assert.equal(completedTask.completed, true);

    const today = new Date().toISOString().split('T')[0];
    assert.equal(completedTask.metadata.completedAt, today);

    // Verify via completed filter
    const completedTasks = await service.listTasks({ completed: true });
    assert.equal(completedTasks.length, 1);
    assert.equal(completedTasks[0].text, 'Ship feature');
    assert.equal(completedTasks[0].metadata.completedAt, today);

    // Verify it no longer appears in incomplete filter
    const incompleteTasks = await service.listTasks({ completed: false });
    assert.equal(incompleteTasks.length, 0);

    // Verify the file content has both [x] and @completedAt
    const fileContent = store.get(WEEK_FILE)!;
    assert.ok(fileContent.includes('[x]'));
    assert.ok(fileContent.includes(`@completedAt(${today})`));
  });
});

describe('E2E: Move + update due + complete in sequence', () => {
  it('simulates full PATCH sequential processing: move, then due, then complete', async () => {
    const store = new Map<string, string>();
    store.set(WEEK_FILE, `# Week\n### Must complete\n### Should complete\n`);
    store.set(TASKS_FILE, `# Tasks\n## Someday\n- [ ] Big project @area(eng)\n`);

    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks({ destination: 'someday' });
    assert.equal(tasks.length, 1);
    const taskId = tasks[0].id;

    // Step 1: Move from someday to must
    const movedTask = await service.moveTask(taskId, 'must');
    assert.equal(movedTask.source.section, '### Must complete');

    // Step 2: Set due date (using the updated source file after move)
    const today = new Date().toISOString().split('T')[0];
    const updatedTask = await service.updateTask(taskId, { due: today });
    assert.equal(updatedTask.metadata.due, today);
    assert.equal(updatedTask.metadata.area, 'eng'); // Metadata preserved

    // Step 3: Complete
    const { task: completedTask } = await service.completeTask(taskId);
    assert.equal(completedTask.completed, true);
    assert.equal(completedTask.metadata.completedAt, today);

    // Verify final state
    const fileContent = store.get(WEEK_FILE)!;
    assert.ok(fileContent.includes('[x]'));
    assert.ok(fileContent.includes('@area(eng)'));
    assert.ok(fileContent.includes(`@due(${today})`));
    assert.ok(fileContent.includes(`@completedAt(${today})`));

    // Verify someday is empty
    const somedayTasks = await service.listTasks({ destination: 'someday' });
    assert.equal(somedayTasks.length, 0);
  });
});

describe('E2E: Legacy completed tasks (no completedAt) handled gracefully', () => {
  it('legacy completed tasks appear in completed filter but not completed-today', async () => {
    const store = new Map<string, string>();
    store.set(WEEK_FILE, `# Week\n### Must complete\n- [x] Old done task\n- [ ] Open task\n`);

    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    // Legacy completed task has no @completedAt
    const completed = await service.listTasks({ completed: true });
    assert.equal(completed.length, 1);
    assert.equal(completed[0].text, 'Old done task');
    assert.equal(completed[0].metadata.completedAt, undefined);

    // It should NOT have a completedAt date
    // When filtering for "completed today", this should be excluded
    const today = new Date().toISOString().split('T')[0];
    const completedToday = completed.filter(t => t.metadata.completedAt === today);
    assert.equal(completedToday.length, 0);
  });
});
