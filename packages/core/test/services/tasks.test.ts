/**
 * Tests for TaskService.
 *
 * Uses a mock StorageAdapter — no filesystem access.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { StorageAdapter } from '../../src/storage/adapter.js';
import type { WorkspacePaths } from '../../src/models/workspace.js';
import type { TaskMetadata, TaskDestination, WorkspaceTask } from '../../src/models/tasks.js';
import {
  TaskService,
  TaskNotFoundError,
  AmbiguousIdError,
  parseMetadata,
  parseTaskLine,
  formatTask,
  computeTaskId,
} from '../../src/services/tasks.js';

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

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

function makeWeekFile(content: string): MockStore {
  const store = new Map<string, string>();
  store.set(WEEK_FILE, content);
  return store;
}

function makeTasksFile(content: string): MockStore {
  const store = new Map<string, string>();
  store.set(TASKS_FILE, content);
  return store;
}

function makeBothFiles(weekContent: string, tasksContent: string): MockStore {
  const store = new Map<string, string>();
  store.set(WEEK_FILE, weekContent);
  store.set(TASKS_FILE, tasksContent);
  return store;
}

// ---------------------------------------------------------------------------
// parseMetadata tests
// ---------------------------------------------------------------------------

describe('parseMetadata', () => {
  it('extracts @area tag', () => {
    const result = parseMetadata('Send slides @area(sales)');
    assert.equal(result.cleanText, 'Send slides');
    assert.equal(result.metadata.area, 'sales');
  });

  it('extracts @project tag', () => {
    const result = parseMetadata('Review docs @project(onboarding)');
    assert.equal(result.cleanText, 'Review docs');
    assert.equal(result.metadata.project, 'onboarding');
  });

  it('extracts @person tag', () => {
    const result = parseMetadata('Follow up with @person(john-smith)');
    assert.equal(result.cleanText, 'Follow up with');
    assert.equal(result.metadata.person, 'john-smith');
  });

  it('extracts @due tag', () => {
    const result = parseMetadata('Submit report @due(2026-03-31)');
    assert.equal(result.cleanText, 'Submit report');
    assert.equal(result.metadata.due, '2026-03-31');
  });

  it('extracts @from(commitment:xxx) tag', () => {
    const result = parseMetadata('Send API docs @from(commitment:abc12345)');
    assert.equal(result.cleanText, 'Send API docs');
    assert.deepEqual(result.metadata.from, { type: 'commitment', id: 'abc12345' });
  });

  it('extracts @from(meeting:xxx) tag', () => {
    const result = parseMetadata('Review notes @from(meeting:2026-03-15)');
    assert.equal(result.cleanText, 'Review notes');
    assert.deepEqual(result.metadata.from, { type: 'meeting', id: '2026-03-15' });
  });

  it('extracts multiple tags', () => {
    const result = parseMetadata('Fix bug @area(eng) @project(api) @person(jane) @due(2026-04-01)');
    assert.equal(result.cleanText, 'Fix bug');
    assert.equal(result.metadata.area, 'eng');
    assert.equal(result.metadata.project, 'api');
    assert.equal(result.metadata.person, 'jane');
    assert.equal(result.metadata.due, '2026-04-01');
  });

  it('ignores unknown tags', () => {
    const result = parseMetadata('Task @unknown(foo) @area(sales)');
    assert.equal(result.cleanText, 'Task @unknown(foo)');
    assert.equal(result.metadata.area, 'sales');
  });

  it('handles malformed @from tag gracefully', () => {
    const result = parseMetadata('Task @from(invalid)');
    // No colon = invalid, so @from not parsed
    assert.equal(result.cleanText, 'Task');
    assert.equal(result.metadata.from, undefined);
  });

  it('handles empty metadata', () => {
    const result = parseMetadata('Simple task');
    assert.equal(result.cleanText, 'Simple task');
    assert.deepEqual(result.metadata, {});
  });

  it('collapses whitespace', () => {
    const result = parseMetadata('Task   with   spaces @area(foo)');
    assert.equal(result.cleanText, 'Task with spaces');
  });
});

// ---------------------------------------------------------------------------
// parseTaskLine tests
// ---------------------------------------------------------------------------

describe('parseTaskLine', () => {
  it('parses unchecked task', () => {
    const result = parseTaskLine('- [ ] Send the slides');
    assert.notEqual(result, null);
    assert.equal(result?.text, 'Send the slides');
    assert.equal(result?.completed, false);
  });

  it('parses checked task with lowercase x', () => {
    const result = parseTaskLine('- [x] Done task');
    assert.notEqual(result, null);
    assert.equal(result?.completed, true);
  });

  it('parses checked task with uppercase X', () => {
    const result = parseTaskLine('- [X] Done task');
    assert.notEqual(result, null);
    assert.equal(result?.completed, true);
  });

  it('returns null for non-task lines', () => {
    assert.equal(parseTaskLine('Not a task'), null);
    assert.equal(parseTaskLine('## Section'), null);
    assert.equal(parseTaskLine(''), null);
    assert.equal(parseTaskLine('  - [ ] Indented'), null);
  });

  it('extracts metadata from task', () => {
    const result = parseTaskLine('- [ ] Task @area(sales) @person(john)');
    assert.notEqual(result, null);
    assert.equal(result?.text, 'Task');
    assert.equal(result?.metadata.area, 'sales');
    assert.equal(result?.metadata.person, 'john');
  });
});

// ---------------------------------------------------------------------------
// formatTask tests
// ---------------------------------------------------------------------------

describe('formatTask', () => {
  it('formats task without metadata', () => {
    const result = formatTask('Simple task', {});
    assert.equal(result, '- [ ] Simple task');
  });

  it('formats completed task', () => {
    const result = formatTask('Done task', {}, true);
    assert.equal(result, '- [x] Done task');
  });

  it('formats task with all metadata', () => {
    const metadata: TaskMetadata = {
      area: 'eng',
      project: 'api',
      person: 'john',
      from: { type: 'commitment', id: 'abc123' },
      due: '2026-04-01',
    };
    const result = formatTask('Fix bug', metadata);
    assert.equal(
      result,
      '- [ ] Fix bug @area(eng) @project(api) @person(john) @from(commitment:abc123) @due(2026-04-01)'
    );
  });
});

// ---------------------------------------------------------------------------
// computeTaskId tests
// ---------------------------------------------------------------------------

describe('computeTaskId', () => {
  it('returns 8-char hash', () => {
    const id = computeTaskId('Send the slides');
    assert.equal(id.length, 8);
    assert.match(id, /^[a-f0-9]{8}$/);
  });

  it('normalizes text before hashing', () => {
    const id1 = computeTaskId('Send the slides');
    const id2 = computeTaskId('  SEND  the  SLIDES  ');
    assert.equal(id1, id2);
  });

  it('different text produces different ids', () => {
    const id1 = computeTaskId('Task A');
    const id2 = computeTaskId('Task B');
    assert.notEqual(id1, id2);
  });
});

// ---------------------------------------------------------------------------
// TaskService.listTasks tests
// ---------------------------------------------------------------------------

describe('TaskService.listTasks', () => {
  it('returns empty array when files do not exist', async () => {
    const storage = createMockStorage();
    const service = new TaskService(storage, makePaths());
    const tasks = await service.listTasks();
    assert.deepEqual(tasks, []);
  });

  it('reads tasks from week.md sections', async () => {
    const weekContent = `# Week

## Inbox
- [ ] Quick note

### Must complete
- [ ] Urgent task

### Should complete
- [ ] Important task

### Could complete
- [ ] Nice to have
`;
    const storage = createMockStorage(makeWeekFile(weekContent));
    const service = new TaskService(storage, makePaths());
    const tasks = await service.listTasks();

    assert.equal(tasks.length, 4);
    assert.equal(tasks[0].text, 'Quick note');
    assert.equal(tasks[0].source.section, '## Inbox');
    assert.equal(tasks[1].text, 'Urgent task');
    assert.equal(tasks[1].source.section, '### Must complete');
    assert.equal(tasks[2].text, 'Important task');
    assert.equal(tasks[3].text, 'Nice to have');
  });

  it('reads tasks from tasks.md sections', async () => {
    const tasksContent = `# Tasks

## Anytime
- [ ] Backlog item

## Someday
- [ ] Maybe later
`;
    const storage = createMockStorage(makeTasksFile(tasksContent));
    const service = new TaskService(storage, makePaths());
    const tasks = await service.listTasks();

    assert.equal(tasks.length, 2);
    assert.equal(tasks[0].text, 'Backlog item');
    assert.equal(tasks[0].source.section, '## Anytime');
    assert.equal(tasks[1].text, 'Maybe later');
    assert.equal(tasks[1].source.section, '## Someday');
  });

  it('reads from both files', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Inbox task
`;
    const tasksContent = `# Tasks
## Anytime
- [ ] Backlog task
`;
    const storage = createMockStorage(makeBothFiles(weekContent, tasksContent));
    const service = new TaskService(storage, makePaths());
    const tasks = await service.listTasks();

    assert.equal(tasks.length, 2);
    const texts = tasks.map((t) => t.text);
    assert.ok(texts.includes('Inbox task'));
    assert.ok(texts.includes('Backlog task'));
  });

  it('filters by destination', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Inbox task
### Must complete
- [ ] Must task
`;
    const storage = createMockStorage(makeWeekFile(weekContent));
    const service = new TaskService(storage, makePaths());

    const inboxTasks = await service.listTasks({ destination: 'inbox' });
    assert.equal(inboxTasks.length, 1);
    assert.equal(inboxTasks[0].text, 'Inbox task');

    const mustTasks = await service.listTasks({ destination: 'must' });
    assert.equal(mustTasks.length, 1);
    assert.equal(mustTasks[0].text, 'Must task');
  });

  it('filters by area', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Task A @area(sales)
- [ ] Task B @area(eng)
- [ ] Task C
`;
    const storage = createMockStorage(makeWeekFile(weekContent));
    const service = new TaskService(storage, makePaths());

    const salesTasks = await service.listTasks({ area: 'sales' });
    assert.equal(salesTasks.length, 1);
    assert.equal(salesTasks[0].text, 'Task A');
  });

  it('filters by project', async () => {
    const tasksContent = `# Tasks
## Anytime
- [ ] Task A @project(api)
- [ ] Task B @project(web)
`;
    const storage = createMockStorage(makeTasksFile(tasksContent));
    const service = new TaskService(storage, makePaths());

    const apiTasks = await service.listTasks({ project: 'api' });
    assert.equal(apiTasks.length, 1);
    assert.equal(apiTasks[0].text, 'Task A');
  });

  it('filters by person', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Follow up @person(john)
- [ ] Review @person(jane)
`;
    const storage = createMockStorage(makeWeekFile(weekContent));
    const service = new TaskService(storage, makePaths());

    const johnTasks = await service.listTasks({ person: 'john' });
    assert.equal(johnTasks.length, 1);
    assert.equal(johnTasks[0].text, 'Follow up');
  });

  it('filters by due date', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Due soon @due(2026-03-15)
- [ ] Due later @due(2026-04-01)
- [ ] No due date
`;
    const storage = createMockStorage(makeWeekFile(weekContent));
    const service = new TaskService(storage, makePaths());

    const dueTasks = await service.listTasks({ due: '2026-03-20' });
    assert.equal(dueTasks.length, 1);
    assert.equal(dueTasks[0].text, 'Due soon');
  });

  it('filters by completed state', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Pending
- [x] Done
`;
    const storage = createMockStorage(makeWeekFile(weekContent));
    const service = new TaskService(storage, makePaths());

    const pending = await service.listTasks({ completed: false });
    assert.equal(pending.length, 1);
    assert.equal(pending[0].text, 'Pending');

    const done = await service.listTasks({ completed: true });
    assert.equal(done.length, 1);
    assert.equal(done[0].text, 'Done');
  });

  it('extracts metadata into tasks', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Complex task @area(eng) @project(api) @person(john) @from(commitment:abc123) @due(2026-04-01)
`;
    const storage = createMockStorage(makeWeekFile(weekContent));
    const service = new TaskService(storage, makePaths());
    const tasks = await service.listTasks();

    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].text, 'Complex task');
    assert.equal(tasks[0].metadata.area, 'eng');
    assert.equal(tasks[0].metadata.project, 'api');
    assert.equal(tasks[0].metadata.person, 'john');
    assert.deepEqual(tasks[0].metadata.from, { type: 'commitment', id: 'abc123' });
    assert.equal(tasks[0].metadata.due, '2026-04-01');
  });
});

// ---------------------------------------------------------------------------
// TaskService.addTask tests
// ---------------------------------------------------------------------------

describe('TaskService.addTask', () => {
  it('adds task to inbox', async () => {
    const weekContent = `# Week
## Inbox
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const task = await service.addTask('New task', 'inbox');
    assert.equal(task.text, 'New task');
    assert.equal(task.source.section, '## Inbox');

    const content = store.get(WEEK_FILE);
    assert.ok(content?.includes('- [ ] New task'));
  });

  it('adds task to must', async () => {
    const weekContent = `# Week
### Must complete
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    await service.addTask('Urgent', 'must');

    const content = store.get(WEEK_FILE);
    assert.ok(content?.includes('- [ ] Urgent'));
  });

  it('adds task to anytime', async () => {
    const tasksContent = `# Tasks
## Anytime
`;
    const store = makeTasksFile(tasksContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    await service.addTask('Backlog item', 'anytime');

    const content = store.get(TASKS_FILE);
    assert.ok(content?.includes('- [ ] Backlog item'));
  });

  it('adds task to someday', async () => {
    const tasksContent = `# Tasks
## Someday
`;
    const store = makeTasksFile(tasksContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    await service.addTask('Maybe later', 'someday');

    const content = store.get(TASKS_FILE);
    assert.ok(content?.includes('- [ ] Maybe later'));
  });

  it('adds task with metadata', async () => {
    const weekContent = `# Week
## Inbox
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    await service.addTask('Task', 'inbox', {
      area: 'sales',
      person: 'john',
      due: '2026-04-01',
    });

    const content = store.get(WEEK_FILE);
    assert.ok(content?.includes('@area(sales)'));
    assert.ok(content?.includes('@person(john)'));
    assert.ok(content?.includes('@due(2026-04-01)'));
  });

  it('creates section if missing', async () => {
    const weekContent = `# Week
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    await service.addTask('New task', 'inbox');

    const content = store.get(WEEK_FILE);
    assert.ok(content?.includes('## Inbox'));
    assert.ok(content?.includes('- [ ] New task'));
  });

  it('creates file if missing', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    await service.addTask('First task', 'anytime');

    const content = store.get(TASKS_FILE);
    assert.ok(content?.includes('## Anytime'));
    assert.ok(content?.includes('- [ ] First task'));
  });

  it('returns task with correct id', async () => {
    const store = makeWeekFile(`# Week\n## Inbox\n`);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const task = await service.addTask('My task', 'inbox');
    assert.equal(task.id.length, 8);
    assert.match(task.id, /^[a-f0-9]{8}$/);
  });
});

// ---------------------------------------------------------------------------
// TaskService.completeTask tests
// ---------------------------------------------------------------------------

describe('TaskService.completeTask', () => {
  it('marks task as completed', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Task to complete
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    const { task } = await service.completeTask(tasks[0].id);

    assert.equal(task.completed, true);
    const content = store.get(WEEK_FILE);
    assert.ok(content?.includes('- [x] Task to complete'));
    assert.ok(!content?.includes('- [ ] Task to complete'));
  });

  it('returns linked commitment id', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Send docs @from(commitment:abc12345)
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    const { linkedCommitmentId } = await service.completeTask(tasks[0].id);

    assert.equal(linkedCommitmentId, 'abc12345');
  });

  it('returns undefined commitment id when no @from', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Regular task
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    const { linkedCommitmentId } = await service.completeTask(tasks[0].id);

    assert.equal(linkedCommitmentId, undefined);
  });

  it('supports id prefix matching', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Task to complete
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    const prefix = tasks[0].id.slice(0, 4);
    const { task } = await service.completeTask(prefix);

    assert.equal(task.completed, true);
  });

  it('throws on unknown task id', async () => {
    const store = makeWeekFile(`# Week\n## Inbox\n`);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    await assert.rejects(
      () => service.completeTask('nonexistent'),
      /No task found matching id "nonexistent"/
    );
  });

  it('throws on ambiguous prefix', async () => {
    // Create two tasks that might have similar prefixes
    const weekContent = `# Week
## Inbox
- [ ] Task one
- [ ] Task two
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    // Try with a very short prefix that might match both (unlikely but test the logic)
    // Since real hashes differ, we test the error path differently
    await assert.rejects(
      () => service.completeTask(''), // Empty prefix matches all
      /Ambiguous prefix/
    );
  });
});

// ---------------------------------------------------------------------------
// TaskService.completeTask auto-resolution tests
// ---------------------------------------------------------------------------

describe('TaskService.completeTask with CommitmentsService', () => {
  // Helper to create a mock CommitmentsService
  function createMockCommitmentsService(options: {
    resolveResult?: { id: string; text: string; status: string };
    resolveThrows?: Error;
  } = {}) {
    return {
      resolve: async (id: string) => {
        if (options.resolveThrows) {
          throw options.resolveThrows;
        }
        return options.resolveResult ?? {
          id: id + 'f'.repeat(56),
          text: 'Test commitment',
          status: 'resolved',
          resolvedAt: new Date().toISOString(),
        };
      },
    } as unknown as import('../../src/services/commitments.js').CommitmentsService;
  }

  it('auto-resolves linked commitment when completing task', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Send docs @from(commitment:abc12345)
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const mockCommitments = createMockCommitmentsService({
      resolveResult: {
        id: 'abc12345' + 'f'.repeat(56),
        text: 'Send docs to team',
        status: 'resolved',
      },
    });
    const service = new TaskService(storage, makePaths(), mockCommitments);

    const tasks = await service.listTasks();
    const result = await service.completeTask(tasks[0].id);

    assert.equal(result.linkedCommitmentId, 'abc12345');
    assert.ok(result.resolvedCommitment !== undefined);
    assert.equal(result.resolvedCommitment?.id, 'abc12345' + 'f'.repeat(56));
    assert.equal(result.resolvedCommitment?.text, 'Send docs to team');
  });

  it('returns undefined resolvedCommitment when no @from', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Regular task
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const mockCommitments = createMockCommitmentsService();
    const service = new TaskService(storage, makePaths(), mockCommitments);

    const tasks = await service.listTasks();
    const result = await service.completeTask(tasks[0].id);

    assert.equal(result.linkedCommitmentId, undefined);
    assert.equal(result.resolvedCommitment, undefined);
  });

  it('silently handles missing commitment (Harvester requirement)', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Task @from(commitment:missing1)
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const mockCommitments = createMockCommitmentsService({
      resolveThrows: new Error('No commitment found matching id'),
    });
    const service = new TaskService(storage, makePaths(), mockCommitments);

    const tasks = await service.listTasks();
    // Should NOT throw - silent failure
    const result = await service.completeTask(tasks[0].id);

    assert.equal(result.task.completed, true);
    assert.equal(result.linkedCommitmentId, 'missing1');
    assert.equal(result.resolvedCommitment, undefined);
  });

  it('works without CommitmentsService (backward compatible)', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Task @from(commitment:abc12345)
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    // No CommitmentsService passed
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    const result = await service.completeTask(tasks[0].id);

    assert.equal(result.task.completed, true);
    assert.equal(result.linkedCommitmentId, 'abc12345');
    // No resolvedCommitment since no CommitmentsService
    assert.equal(result.resolvedCommitment, undefined);
  });

  it('does not attempt resolution for @from(meeting:xxx)', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Review notes @from(meeting:2026-03-27)
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    let resolveAttempted = false;
    const mockCommitments = {
      resolve: async () => {
        resolveAttempted = true;
        return { id: 'test', text: 'test', status: 'resolved' };
      },
    } as unknown as import('../../src/services/commitments.js').CommitmentsService;
    const service = new TaskService(storage, makePaths(), mockCommitments);

    const tasks = await service.listTasks();
    const result = await service.completeTask(tasks[0].id);

    assert.equal(resolveAttempted, false, 'Should not attempt to resolve meeting references');
    assert.equal(result.linkedCommitmentId, undefined);
  });
});

// ---------------------------------------------------------------------------
// TaskService.moveTask tests
// ---------------------------------------------------------------------------

describe('TaskService.moveTask', () => {
  it('moves task within same file', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Task to move

### Must complete
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    const moved = await service.moveTask(tasks[0].id, 'must');

    assert.equal(moved.source.section, '### Must complete');

    const content = store.get(WEEK_FILE);
    assert.ok(!content?.includes('## Inbox\n- [ ] Task to move'));
    assert.ok(content?.includes('### Must complete\n- [ ] Task to move'));
  });

  it('moves task between files', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Task to move
`;
    const tasksContent = `# Tasks
## Anytime
`;
    const store = makeBothFiles(weekContent, tasksContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    const moved = await service.moveTask(tasks[0].id, 'anytime');

    assert.equal(moved.source.section, '## Anytime');

    const weekFile = store.get(WEEK_FILE);
    const tasksFile = store.get(TASKS_FILE);
    assert.ok(!weekFile?.includes('Task to move'));
    assert.ok(tasksFile?.includes('Task to move'));
  });

  it('preserves metadata during move', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Task @area(sales) @person(john)
`;
    const tasksContent = `# Tasks
## Anytime
`;
    const store = makeBothFiles(weekContent, tasksContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    await service.moveTask(tasks[0].id, 'anytime');

    const content = store.get(TASKS_FILE);
    assert.ok(content?.includes('@area(sales)'));
    assert.ok(content?.includes('@person(john)'));
  });

  it('no-op when already in destination', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Already here
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    const moved = await service.moveTask(tasks[0].id, 'inbox');

    assert.equal(moved.source.section, '## Inbox');
  });
});

// ---------------------------------------------------------------------------
// TaskService.findTask tests
// ---------------------------------------------------------------------------

describe('TaskService.findTask', () => {
  it('finds task by full id', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Find me
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    const found = await service.findTask(tasks[0].id);

    assert.notEqual(found, null);
    assert.equal(found?.text, 'Find me');
  });

  it('finds task by prefix', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Find me
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    const prefix = tasks[0].id.slice(0, 4);
    const found = await service.findTask(prefix);

    assert.notEqual(found, null);
    assert.equal(found?.text, 'Find me');
  });

  it('returns null when not found', async () => {
    const store = makeWeekFile(`# Week\n## Inbox\n`);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const found = await service.findTask('nonexistent');
    assert.equal(found, null);
  });
});

// ---------------------------------------------------------------------------
// TaskService.deleteTask tests
// ---------------------------------------------------------------------------

describe('TaskService.deleteTask', () => {
  it('removes task from file', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Task to delete
- [ ] Keep this
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    const toDelete = tasks.find((t) => t.text === 'Task to delete')!;
    await service.deleteTask(toDelete.id);

    const content = store.get(WEEK_FILE);
    assert.ok(!content?.includes('Task to delete'));
    assert.ok(content?.includes('Keep this'));
  });

  it('returns deleted task', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Task to delete
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    const deleted = await service.deleteTask(tasks[0].id);

    assert.equal(deleted.text, 'Task to delete');
  });

  it('throws on unknown task', async () => {
    const store = makeWeekFile(`# Week\n## Inbox\n`);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    await assert.rejects(
      () => service.deleteTask('nonexistent'),
      /No task found/
    );
  });
});

// ---------------------------------------------------------------------------
// TaskService.updateTask tests
// ---------------------------------------------------------------------------

describe('TaskService.updateTask', () => {
  it('adds @due to task without existing date', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Task without date
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    const updated = await service.updateTask(tasks[0].id, { due: '2026-04-15' });

    assert.equal(updated.metadata.due, '2026-04-15');
    const content = store.get(WEEK_FILE);
    assert.ok(content?.includes('@due(2026-04-15)'));
  });

  it('modifies existing @due date', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Task with date @due(2026-03-01)
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    const updated = await service.updateTask(tasks[0].id, { due: '2026-04-30' });

    assert.equal(updated.metadata.due, '2026-04-30');
    const content = store.get(WEEK_FILE);
    assert.ok(content?.includes('@due(2026-04-30)'));
    assert.ok(!content?.includes('@due(2026-03-01)'));
  });

  it('removes @due when due=null', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Task with date @due(2026-03-01)
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    const updated = await service.updateTask(tasks[0].id, { due: null });

    assert.equal(updated.metadata.due, undefined);
    const content = store.get(WEEK_FILE);
    assert.ok(!content?.includes('@due'));
  });

  it('preserves other metadata (@area, @person, @from)', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Complex task @area(sales) @person(john) @from(commitment:abc123) @due(2026-03-01)
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    const updated = await service.updateTask(tasks[0].id, { due: '2026-05-01' });

    assert.equal(updated.metadata.area, 'sales');
    assert.equal(updated.metadata.person, 'john');
    assert.deepEqual(updated.metadata.from, { type: 'commitment', id: 'abc123' });
    assert.equal(updated.metadata.due, '2026-05-01');
    
    const content = store.get(WEEK_FILE);
    assert.ok(content?.includes('@area(sales)'));
    assert.ok(content?.includes('@person(john)'));
    assert.ok(content?.includes('@from(commitment:abc123)'));
    assert.ok(content?.includes('@due(2026-05-01)'));
  });

  it('throws TaskNotFoundError for non-existent ID', async () => {
    const store = makeWeekFile(`# Week\n## Inbox\n`);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    await assert.rejects(
      () => service.updateTask('nonexistent', { due: '2026-04-01' }),
      (err: Error) => {
        assert.ok(err instanceof TaskNotFoundError);
        assert.ok(err.message.includes('nonexistent'));
        return true;
      }
    );
  });

  it('throws AmbiguousIdError for ambiguous prefix', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Task one
- [ ] Task two
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    // Empty prefix matches all
    await assert.rejects(
      () => service.updateTask('', { due: '2026-04-01' }),
      (err: Error) => {
        assert.ok(err instanceof AmbiguousIdError);
        assert.ok(err.message.includes('Ambiguous'));
        return true;
      }
    );
  });

  it('supports id prefix matching', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Update me
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    const prefix = tasks[0].id.slice(0, 4);
    const updated = await service.updateTask(prefix, { due: '2026-04-01' });

    assert.equal(updated.metadata.due, '2026-04-01');
  });

  it('is atomic — file unchanged on validation error', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Existing task
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const originalContent = store.get(WEEK_FILE);

    // Try to update non-existent task
    try {
      await service.updateTask('nonexistent', { due: '2026-04-01' });
    } catch {
      // Expected
    }

    // File should be unchanged
    assert.equal(store.get(WEEK_FILE), originalContent);
  });

  it('works with tasks in tasks.md', async () => {
    const tasksContent = `# Tasks
## Anytime
- [ ] Backlog task
`;
    const store = makeTasksFile(tasksContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    const updated = await service.updateTask(tasks[0].id, { due: '2026-06-01' });

    assert.equal(updated.metadata.due, '2026-06-01');
    const content = store.get(TASKS_FILE);
    assert.ok(content?.includes('@due(2026-06-01)'));
  });

  it('preserves completed state when updating', async () => {
    const weekContent = `# Week
## Inbox
- [x] Completed task @due(2026-03-01)
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks({ completed: true });
    const updated = await service.updateTask(tasks[0].id, { due: '2026-04-01' });

    assert.equal(updated.completed, true);
    const content = store.get(WEEK_FILE);
    assert.ok(content?.includes('- [x]'));
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('TaskService edge cases', () => {
  it('handles empty sections', async () => {
    const weekContent = `# Week
## Inbox

### Must complete

### Should complete
- [ ] One task
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].text, 'One task');
  });

  it('handles tasks with special characters', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Task with "quotes" and (parens)
- [ ] Task with @symbol not a tag
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    assert.equal(tasks.length, 2);
    assert.equal(tasks[0].text, 'Task with "quotes" and (parens)');
    // @symbol without (value) is not parsed as tag
    assert.equal(tasks[1].text, 'Task with @symbol not a tag');
  });

  it('handles missing sections gracefully', async () => {
    const weekContent = `# Week
## Some Other Section
- [ ] Not a task section
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    assert.equal(tasks.length, 0);
  });

  it('handles file with only headers', async () => {
    const weekContent = `# Week
## Inbox
### Must complete
### Should complete
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    assert.equal(tasks.length, 0);
  });

  it('respects section boundaries for ### headers', async () => {
    const weekContent = `# Week
### Must complete
- [ ] Must task
### Should complete
- [ ] Should task
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const mustTasks = await service.listTasks({ destination: 'must' });
    const shouldTasks = await service.listTasks({ destination: 'should' });

    assert.equal(mustTasks.length, 1);
    assert.equal(mustTasks[0].text, 'Must task');
    assert.equal(shouldTasks.length, 1);
    assert.equal(shouldTasks[0].text, 'Should task');
  });

  it('handles @from with meeting type', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Review notes @from(meeting:2026-03-15-team-sync)
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks();
    assert.equal(tasks.length, 1);
    assert.deepEqual(tasks[0].metadata.from, {
      type: 'meeting',
      id: '2026-03-15-team-sync',
    });
  });

  it('handles multiple combined filters', async () => {
    const weekContent = `# Week
## Inbox
- [ ] Match @area(sales) @person(john)
- [ ] No match @area(sales) @person(jane)
- [ ] No match @area(eng) @person(john)
`;
    const store = makeWeekFile(weekContent);
    const storage = createMockStorage(store);
    const service = new TaskService(storage, makePaths());

    const tasks = await service.listTasks({ area: 'sales', person: 'john' });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].text, 'Match');
  });
});
