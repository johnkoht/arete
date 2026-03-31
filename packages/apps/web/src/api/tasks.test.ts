/**
 * Tests for the Tasks API client.
 *
 * Tests fetch, update, delete operations and type mapping.
 * Uses vi.stubGlobal to mock fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BASE_URL } from './client.js';
import { fetchTasks, fetchTaskSuggestions, updateTask, deleteTask } from './tasks.js';
import type { Task, SuggestedTask } from './types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a mock Response. */
function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Sample TaskWire from backend */
const TASK_WIRE = {
  id: 'abc123',
  text: 'Review PRD for task UI',
  destination: 'must' as const,
  due: '2026-03-31',
  area: 'product',
  project: 'task-management-ui',
  person: { slug: 'jane-doe', name: 'Jane Doe' },
  from: {
    type: 'commitment' as const,
    id: 'commit01',
    text: 'Review the PRD by end of week',
    priority: 'high' as const,
    daysOpen: 3,
  },
  completed: false,
  source: { file: 'now/tasks.md', section: '### Must complete' },
};

/** Sample SuggestedTaskWire from backend */
const SUGGESTED_TASK_WIRE = {
  ...TASK_WIRE,
  score: 85,
  breakdown: {
    dueDate: 30,
    commitment: 25,
    meetingRelevance: 15,
    weekPriority: 15,
  },
};

// ── fetchTasks tests ─────────────────────────────────────────────────────────

describe('fetchTasks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches tasks from /api/tasks', async () => {
    const response = { tasks: [TASK_WIRE], total: 1, offset: 0, limit: 25 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(response)));

    const result = await fetchTasks();

    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/tasks`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(result.tasks).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('maps wire format to Task type correctly', async () => {
    const response = { tasks: [TASK_WIRE], total: 1, offset: 0, limit: 25 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(response)));

    const result = await fetchTasks();
    const task: Task = result.tasks[0];

    expect(task.id).toBe('abc123');
    expect(task.text).toBe('Review PRD for task UI');
    expect(task.destination).toBe('must');
    expect(task.due).toBe('2026-03-31');
    expect(task.area).toBe('product');
    expect(task.project).toBe('task-management-ui');
    expect(task.person).toEqual({ slug: 'jane-doe', name: 'Jane Doe' });
    expect(task.from).toEqual({
      type: 'commitment',
      id: 'commit01',
      text: 'Review the PRD by end of week',
      priority: 'high',
      daysOpen: 3,
    });
    expect(task.completed).toBe(false);
    expect(task.source).toEqual({ file: 'now/tasks.md', section: '### Must complete' });
  });

  it('passes filter param to URL query string', async () => {
    const response = { tasks: [], total: 0, offset: 0, limit: 25 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(response)));

    await fetchTasks('today');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/tasks\?filter=today/),
      expect.any(Object),
    );
  });

  it('passes limit and offset options to URL query string', async () => {
    const response = { tasks: [], total: 0, offset: 10, limit: 5 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(response)));

    await fetchTasks(undefined, { limit: 5, offset: 10 });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/limit=5/),
      expect.any(Object),
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/offset=10/),
      expect.any(Object),
    );
  });

  it('passes waitingOn option to URL query string', async () => {
    const response = { tasks: [], total: 0, offset: 0, limit: 25 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(response)));

    await fetchTasks(undefined, { waitingOn: true });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/waitingOn=true/),
      expect.any(Object),
    );
  });

  it('combines filter and options in query string', async () => {
    const response = { tasks: [], total: 0, offset: 0, limit: 10 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(response)));

    await fetchTasks('upcoming', { limit: 10, waitingOn: true });

    const callUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callUrl).toContain('filter=upcoming');
    expect(callUrl).toContain('limit=10');
    expect(callUrl).toContain('waitingOn=true');
  });

  it('handles empty response (returns empty array with total: 0)', async () => {
    const response = { tasks: [], total: 0, offset: 0, limit: 25 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(response)));

    const result = await fetchTasks();

    expect(result.tasks).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('handles tasks with null optional fields', async () => {
    const taskWithNulls = {
      ...TASK_WIRE,
      due: null,
      area: null,
      project: null,
      person: null,
      from: null,
    };
    const response = { tasks: [taskWithNulls], total: 1, offset: 0, limit: 25 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(response)));

    const result = await fetchTasks();
    const task = result.tasks[0];

    expect(task.due).toBeNull();
    expect(task.area).toBeNull();
    expect(task.project).toBeNull();
    expect(task.person).toBeNull();
    expect(task.from).toBeNull();
  });

  it('throws on network error with actionable message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    await expect(fetchTasks()).rejects.toThrow('Network error');
  });

  it('throws on 500 with error from body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse({ error: 'Failed to list tasks' }, 500)),
    );

    await expect(fetchTasks()).rejects.toThrow('Failed to list tasks');
  });

  it('throws on 400 with field-specific error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({ error: 'Invalid filter: invalid. Valid filters: today, upcoming, anytime, someday' }, 400),
      ),
    );

    await expect(fetchTasks('invalid' as any)).rejects.toThrow(/Invalid filter/);
  });

  it('throws on 404 with task ID in message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({ error: 'No task found matching id "nonexistent"' }, 404),
      ),
    );

    await expect(fetchTasks()).rejects.toThrow(/No task found/);
  });
});

// ── fetchTaskSuggestions tests ───────────────────────────────────────────────

describe('fetchTaskSuggestions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches suggested tasks from /api/tasks/suggested', async () => {
    const response = { tasks: [SUGGESTED_TASK_WIRE] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(response)));

    const result = await fetchTaskSuggestions();

    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/tasks/suggested`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(result).toHaveLength(1);
  });

  it('maps wire format to SuggestedTask with score and breakdown', async () => {
    const response = { tasks: [SUGGESTED_TASK_WIRE] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(response)));

    const result = await fetchTaskSuggestions();
    const task: SuggestedTask = result[0];

    // Base Task fields
    expect(task.id).toBe('abc123');
    expect(task.text).toBe('Review PRD for task UI');
    expect(task.destination).toBe('must');

    // SuggestedTask-specific fields
    expect(task.score).toBe(85);
    expect(task.breakdown).toEqual({
      dueDate: 30,
      commitment: 25,
      meetingRelevance: 15,
      weekPriority: 15,
    });
  });

  it('handles empty suggestions (returns empty array)', async () => {
    const response = { tasks: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(response)));

    const result = await fetchTaskSuggestions();

    expect(result).toEqual([]);
  });

  it('throws on 500 error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse({ error: 'Failed to get suggested tasks' }, 500)),
    );

    await expect(fetchTaskSuggestions()).rejects.toThrow('Failed to get suggested tasks');
  });
});

// ── updateTask tests ─────────────────────────────────────────────────────────

describe('updateTask', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends PATCH request to /api/tasks/:id', async () => {
    const response = { task: TASK_WIRE };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(response)));

    await updateTask('abc123', { completed: true });

    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/tasks/abc123`,
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('sends correct body for completed update', async () => {
    const response = { task: { ...TASK_WIRE, completed: true } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(response)));

    await updateTask('abc123', { completed: true });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ completed: true }),
      }),
    );
  });

  it('sends correct body for due date update', async () => {
    const response = { task: { ...TASK_WIRE, due: '2026-04-01' } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(response)));

    await updateTask('abc123', { due: '2026-04-01' });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ due: '2026-04-01' }),
      }),
    );
  });

  it('sends correct body for destination update', async () => {
    const response = { task: { ...TASK_WIRE, destination: 'should' } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(response)));

    await updateTask('abc123', { destination: 'should' });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ destination: 'should' }),
      }),
    );
  });

  it('returns updated Task', async () => {
    const updatedTask = { ...TASK_WIRE, completed: true };
    const response = { task: updatedTask };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(response)));

    const result = await updateTask('abc123', { completed: true });

    expect(result.id).toBe('abc123');
    expect(result.completed).toBe(true);
  });

  it('throws on 404 with task ID in message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({ error: 'No task found matching id "nonexistent"' }, 404),
      ),
    );

    await expect(updateTask('nonexistent', { completed: true })).rejects.toThrow(
      /No task found matching id "nonexistent"/,
    );
  });

  it('throws on 400 with validation error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({ error: 'Invalid due date format. Expected YYYY-MM-DD.' }, 400),
      ),
    );

    await expect(updateTask('abc123', { due: 'invalid' })).rejects.toThrow(
      /Invalid due date format/,
    );
  });
});

// ── deleteTask tests ─────────────────────────────────────────────────────────

describe('deleteTask', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends DELETE request to /api/tasks/:id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await deleteTask('abc123');

    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/tasks/abc123`,
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('returns void on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    const result = await deleteTask('abc123');

    expect(result).toBeUndefined();
  });

  it('throws on 404 with task ID in message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({ error: 'No task found matching id "nonexistent"' }, 404),
      ),
    );

    await expect(deleteTask('nonexistent')).rejects.toThrow(
      /No task found matching id "nonexistent"/,
    );
  });

  it('throws on 500 error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse({ error: 'Failed to delete task' }, 500)),
    );

    await expect(deleteTask('abc123')).rejects.toThrow('Failed to delete task');
  });
});
