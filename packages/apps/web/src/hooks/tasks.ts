/**
 * TanStack Query hooks for the Tasks page.
 *
 * Features:
 * - useTasks: Fetch tasks with filter and pagination
 * - useTaskSuggestions: Fetch AI-scored task recommendations
 * - useUpdateTask: Optimistic updates with rollback and debounce
 * - useCompleteTask: Mark task complete with invalidation and debounce
 *
 * Both mutations use:
 * - 100ms debounce to batch rapid updates
 * - Pending-check to ignore calls while mutation is in flight
 * - Ref pattern to avoid stale closure bugs
 */

import { useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchTasks,
  fetchCompletedTodayTasks,
  fetchTaskSuggestions,
  updateTask,
} from '@/api/tasks.js';
import type { TasksFilter, FetchTasksOptions, TasksResponse, TaskUpdate } from '@/api/types.js';

// ── Constants ───────────────────────────────────────────────────────────────

const STALE_TIME = 30_000; // 30 seconds
const GC_TIME = 300_000; // 5 minutes
const DEBOUNCE_MS = 100;

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
 * Update a task with optimistic updates, debounce, and pending-check.
 *
 * Features:
 * - Optimistically updates all paginated cache entries
 * - Rolls back on error using saved previous data
 * - Debounces rapid calls (100ms)
 * - Ignores calls while mutation is pending
 * - Uses ref pattern to avoid stale closure bugs
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();

  // Refs for debounce and pending state
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingParamsRef = useRef<UpdateTaskParams | null>(null);

  // Ref for stable mutation callback (avoids stale closures)
  const mutationRef = useRef<((params: UpdateTaskParams) => void) | null>(null);

  const mutation = useMutation({
    mutationFn: ({ id, updates }: UpdateTaskParams) => updateTask(id, updates),

    onMutate: async ({ id, updates }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['tasks'] });

      // Snapshot all pagination variants (plural form does partial key matching)
      const previousData = queryClient.getQueriesData<TasksResponse>({ queryKey: ['tasks'] });

      // Optimistically update all cached pages (plural form updates all variants)
      queryClient.setQueriesData<TasksResponse>({ queryKey: ['tasks'] }, (old) => {
        if (!old) return old;
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
      // Refetch to ensure server state consistency
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      // Also invalidate suggestions cache (tasks updated may no longer be suggestions)
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'suggested'] });
      // Invalidate completed-today cache (task may have moved in/out of completed)
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'completed-today'] });
    },
  });

  // Update ref when mutation changes (keeps callback fresh)
  useEffect(() => {
    mutationRef.current = (params: UpdateTaskParams) => {
      mutation.mutate(params);
    };
  }, [mutation]);

  // Debounced mutate function with pending-check
  const mutate = useCallback((params: UpdateTaskParams) => {
    // Clear existing timeout
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Store latest params for debounced call
    pendingParamsRef.current = params;

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;

      // Check if mutation is pending - if so, ignore this call
      if (mutation.isPending) {
        return;
      }

      const paramsToUse = pendingParamsRef.current;
      pendingParamsRef.current = null;

      if (paramsToUse && mutationRef.current) {
        mutationRef.current(paramsToUse);
      }
    }, DEBOUNCE_MS);
  }, [mutation.isPending]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    mutate,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}

/**
 * Complete a task (convenience wrapper around updateTask).
 *
 * Uses invalidation instead of optimistic update because completion
 * typically triggers visual removal from the active list.
 *
 * Features:
 * - Debounces rapid calls (100ms)
 * - Ignores calls while mutation is pending
 * - Uses ref pattern to avoid stale closure bugs
 */
export function useCompleteTask() {
  const queryClient = useQueryClient();

  // Refs for debounce and pending state
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingIdRef = useRef<string | null>(null);

  // Ref for stable mutation callback (avoids stale closures)
  const mutationRef = useRef<((id: string) => void) | null>(null);

  const mutation = useMutation({
    mutationFn: (id: string) => updateTask(id, { completed: true }),

    onSuccess: () => {
      // Invalidate to trigger refetch (completed task should disappear from list)
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      // Also invalidate suggestions cache (completed tasks are not suggestions)
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'suggested'] });
      // Invalidate completed-today cache (newly completed task should appear)
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'completed-today'] });
    },
  });

  // Update ref when mutation changes (keeps callback fresh)
  useEffect(() => {
    mutationRef.current = (id: string) => {
      mutation.mutate(id);
    };
  }, [mutation]);

  // Debounced mutate function with pending-check
  const mutate = useCallback((id: string) => {
    // Clear existing timeout
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Store latest id for debounced call
    pendingIdRef.current = id;

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;

      // Check if mutation is pending - if so, ignore this call
      if (mutation.isPending) {
        return;
      }

      const idToUse = pendingIdRef.current;
      pendingIdRef.current = null;

      if (idToUse && mutationRef.current) {
        mutationRef.current(idToUse);
      }
    }, DEBOUNCE_MS);
  }, [mutation.isPending]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    mutate,
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
