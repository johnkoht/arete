/**
 * TanStack Query hooks for the Tasks page.
 *
 * Features:
 * - useTasks: Fetch tasks with filter and pagination
 * - useTaskSuggestions: Fetch AI-scored task recommendations
 * - useCompletedTodayTasks: Fetch tasks completed today
 * - useUpdateTask: Optimistic updates with rollback
 * - useCompleteTask: Mark task complete with cache invalidation
 *
 * Mutations call mutation.mutate() directly — no debounce.
 * Scheduling/completing are deliberate user actions, not rapid-fire inputs.
 *
 * Cache invalidation strategy:
 * - Only invalidate queries for the ACTIVE tab + directly affected caches
 * - Avoid invalidating all ['tasks'] variants (causes N refetches for N tabs)
 * - Suggested and completed-today are always invalidated (cross-cutting)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchTasks,
  fetchCompletedTodayTasks,
  fetchTaskSuggestions,
  updateTask,
} from '@/api/tasks.js';
import type { TasksFilter, FetchTasksOptions, TasksResponse, TaskUpdate } from '@/api/types.js';

// ── Constants ───────────────────────────────────────────────────────────────

const STALE_TIME = 30_000; // 30s — prevents refetching tabs visited recently
const GC_TIME = 300_000; // 5 minutes

// ── Query Hooks ─────────────────────────────────────────────────────────────

/**
 * Fetch tasks with optional filter and pagination.
 * Query key includes filter and options for proper cache isolation.
 */
export function useTasks(filter?: TasksFilter, options?: FetchTasksOptions) {
  return useQuery({
    queryKey: ['tasks', filter, options],
    queryFn: () => fetchTasks(filter, options),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });
}

/**
 * Fetch AI-scored task suggestions.
 */
export function useTaskSuggestions() {
  return useQuery({
    queryKey: ['tasks', 'suggested'],
    queryFn: fetchTaskSuggestions,
    staleTime: STALE_TIME,
  });
}

/**
 * Fetch tasks completed today.
 * Uses dedicated query key for proper cache isolation.
 */
export function useCompletedTodayTasks() {
  return useQuery({
    queryKey: ['tasks', 'completed-today'],
    queryFn: fetchCompletedTodayTasks,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });
}

// ── Mutation Hooks ──────────────────────────────────────────────────────────

type UpdateTaskParams = {
  id: string;
  updates: TaskUpdate;
};

/**
 * Invalidate all task-related caches.
 *
 * Uses exact:false (default) so ['tasks'] matches all task queries.
 * This is intentional: moving a task between tabs means multiple filters
 * need to refetch. The staleTime prevents unnecessary network calls
 * for tabs the user hasn't visited recently.
 */
function invalidateAllTaskCaches(queryClient: ReturnType<typeof useQueryClient>) {
  // Invalidate all task list queries (today, upcoming, anytime, etc.)
  void queryClient.invalidateQueries({ queryKey: ['tasks'] });
}

/**
 * Update a task with optimistic updates and rollback.
 *
 * No debounce — scheduling and metadata changes are deliberate user actions.
 * Calls mutation.mutate() directly for immediate execution.
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ id, updates }: UpdateTaskParams) => updateTask(id, updates),

    onMutate: async ({ id, updates }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['tasks'] });

      // Snapshot all pagination variants for rollback
      const previousData = queryClient.getQueriesData<TasksResponse>({ queryKey: ['tasks'] });

      // Optimistically update all cached pages.
      // Guard: ['tasks'] prefix matches both TasksResponse caches (today, upcoming, etc.)
      // AND SuggestedTask[] caches (['tasks', 'suggested']). Only update objects with .tasks array.
      queryClient.setQueriesData<TasksResponse>({ queryKey: ['tasks'] }, (old) => {
        if (!old || !('tasks' in old) || !Array.isArray(old.tasks)) return old;
        return {
          ...old,
          tasks: old.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        };
      });

      return { previousData };
    },

    onError: (_err, _vars, context) => {
      // Rollback all cached pages on error
      if (context?.previousData) {
        for (const [key, data] of context.previousData) {
          queryClient.setQueryData(key, data);
        }
      }
    },

    onSettled: () => {
      invalidateAllTaskCaches(queryClient);
    },
  });

  return {
    mutate: mutation.mutate,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}

/**
 * Complete a task with cache invalidation.
 *
 * No debounce — completing is a deliberate user action.
 * Uses invalidation (not optimistic update) because completion
 * triggers visual removal from the active list.
 */
export function useCompleteTask() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => updateTask(id, { completed: true }),

    onSuccess: () => {
      invalidateAllTaskCaches(queryClient);
    },
  });

  return {
    mutate: mutation.mutate,
    isPending: mutation.isPending,
    /** The task ID currently being completed (only valid when isPending is true) */
    pendingTaskId: mutation.isPending ? (mutation.variables ?? null) : null,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}
