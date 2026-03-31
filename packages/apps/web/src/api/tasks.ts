/**
 * Typed API functions for task-related backend endpoints.
 *
 * Handles fetching, updating, and deleting tasks from the Tasks page.
 * Type mapping from wire format happens here (though currently 1:1).
 */

import { apiFetch, BASE_URL } from './client.js';
import type {
  Task,
  SuggestedTask,
  TasksFilter,
  FetchTasksOptions,
  TasksResponse,
  TaskUpdate,
} from './types.js';

// ── Wire format types (match backend) ────────────────────────────────────────

type TaskWire = {
  id: string;
  text: string;
  destination: 'inbox' | 'must' | 'should' | 'could' | 'anytime' | 'someday';
  due: string | null;
  area: string | null;
  project: string | null;
  person: { slug: string; name: string } | null;
  from: {
    type: 'commitment';
    id: string;
    text: string;
    priority: 'high' | 'medium' | 'low';
    daysOpen: number;
  } | null;
  completed: boolean;
  source: { file: string; section: string };
};

type SuggestedTaskWire = TaskWire & {
  score: number;
  breakdown: {
    dueDate: number;
    commitment: number;
    meetingRelevance: number;
    weekPriority: number;
  };
};

type TasksWireResponse = {
  tasks: TaskWire[];
  total: number;
  offset: number;
  limit: number;
};

type SuggestedTasksWireResponse = {
  tasks: SuggestedTaskWire[];
};

type UpdateTaskWireResponse = {
  task: TaskWire;
};

// ── Mapping helpers ─────────────────────────────────────────────────────────

/**
 * Map wire format to frontend Task type.
 * Currently 1:1, but this provides a layer for future divergence.
 */
function mapTask(wire: TaskWire): Task {
  return {
    id: wire.id,
    text: wire.text,
    destination: wire.destination,
    due: wire.due,
    area: wire.area,
    project: wire.project,
    person: wire.person,
    from: wire.from,
    completed: wire.completed,
    source: wire.source,
  };
}

/**
 * Map wire format to frontend SuggestedTask type.
 */
function mapSuggestedTask(wire: SuggestedTaskWire): SuggestedTask {
  return {
    ...mapTask(wire),
    score: wire.score,
    breakdown: wire.breakdown,
  };
}

// ── API functions ───────────────────────────────────────────────────────────

/**
 * GET /api/tasks — list tasks with optional filter and pagination.
 *
 * @param filter - Filter by 'today', 'upcoming', 'anytime', or 'someday'
 * @param options - Pagination (limit, offset) and waitingOn filter
 * @returns TasksResponse with tasks array and pagination info
 * @throws Error with context on network error, 4xx, or 5xx
 */
export async function fetchTasks(
  filter?: TasksFilter,
  options?: FetchTasksOptions,
): Promise<TasksResponse> {
  const params = new URLSearchParams();

  if (filter) {
    params.set('filter', filter);
  }
  if (options?.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  if (options?.offset !== undefined) {
    params.set('offset', String(options.offset));
  }
  if (options?.waitingOn) {
    params.set('waitingOn', 'true');
  }

  const queryString = params.toString();
  const url = queryString ? `/api/tasks?${queryString}` : '/api/tasks';

  const raw = await apiFetch<TasksWireResponse>(url);

  return {
    tasks: raw.tasks.map(mapTask),
    total: raw.total,
    offset: raw.offset,
    limit: raw.limit,
  };
}

/**
 * GET /api/tasks/suggested — get AI-scored task recommendations.
 *
 * @returns Array of SuggestedTask with score and breakdown
 * @throws Error with context on network error or 5xx
 */
export async function fetchTaskSuggestions(): Promise<SuggestedTask[]> {
  const raw = await apiFetch<SuggestedTasksWireResponse>('/api/tasks/suggested');
  return raw.tasks.map(mapSuggestedTask);
}

/**
 * PATCH /api/tasks/:id — update task properties.
 *
 * @param id - Task ID (can be prefix)
 * @param updates - Fields to update (completed, due, destination)
 * @returns Updated Task
 * @throws Error with task ID on 404, field-specific error on 400
 */
export async function updateTask(id: string, updates: TaskUpdate): Promise<Task> {
  const raw = await apiFetch<UpdateTaskWireResponse>(`/api/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return mapTask(raw.task);
}

/**
 * DELETE /api/tasks/:id — delete a task.
 *
 * @param id - Task ID (can be prefix)
 * @throws Error with task ID on 404, generic error on 5xx
 */
export async function deleteTask(id: string): Promise<void> {
  // Can't use apiFetch because DELETE returns 204 No Content (empty body)
  const res = await fetch(`${BASE_URL}/api/tasks/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status}: ${res.statusText}`);
  }
  // 204 No Content — nothing to return
}
