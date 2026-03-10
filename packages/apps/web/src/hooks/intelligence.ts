/**
 * TanStack Query hooks for intelligence routes.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPatterns, fetchCommitments, patchCommitment, fetchActivity, reconcileCommitments } from '@/api/intelligence.js';
import type { CommitmentsParams, DirectionFilter, PriorityFilter } from '@/api/intelligence.js';
import type { SignalPattern, CommitmentItem, ActivityItem, ReconciliationCandidate } from '@/api/types.js';

/**
 * Fetch cross-person signal patterns for the last N days.
 * Returns an empty array while loading or on error.
 */
export function useSignalPatterns(days = 30): {
  data: SignalPattern[];
  isLoading: boolean;
  error: Error | null;
} {
  const result = useQuery({
    queryKey: ['intelligence', 'patterns', days],
    queryFn: () => fetchPatterns(days),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    data: result.data?.patterns ?? [],
    isLoading: result.isLoading,
    error: result.error,
  };
}

/**
 * Fetch commitments list with optional filter, direction, person, priority, and pagination.
 */
export function useCommitments(params?: CommitmentsParams): {
  data: CommitmentItem[];
  total: number;
  offset: number;
  limit: number;
  isLoading: boolean;
  error: Error | null;
} {
  const filter = params?.filter ?? 'open';
  const direction = params?.direction ?? 'all';
  const person = params?.person ?? null;
  const priority = params?.priority ?? 'all';
  const limit = params?.limit;
  const offset = params?.offset;

  const result = useQuery({
    queryKey: ['commitments', 'list', filter, direction, person, priority, limit, offset],
    queryFn: () => fetchCommitments(params),
    staleTime: 2 * 60 * 1000,
  });

  return {
    data: result.data?.commitments ?? [],
    total: result.data?.total ?? 0,
    offset: result.data?.offset ?? 0,
    limit: result.data?.limit ?? 25,
    isLoading: result.isLoading,
    error: result.error,
  };
}

// Re-export types for consumers
export type { CommitmentsParams, DirectionFilter, PriorityFilter };

/**
 * Mutation to mark a commitment as resolved or dropped.
 * Optimistically removes the item from the 'open' list, then invalidates
 * all commitment queries on settle.
 */
export function useMarkCommitmentDone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'resolved' | 'dropped' }) =>
      patchCommitment(id, status),
    onMutate: async ({ id }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['commitments'] });

      // Snapshot previous data for rollback
      const previousData = queryClient.getQueriesData<{ commitments: CommitmentItem[] }>({
        queryKey: ['commitments'],
      });

      // Optimistically remove from all commitment list caches
      queryClient.setQueriesData<{ commitments: CommitmentItem[] }>(
        { queryKey: ['commitments', 'list'] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            commitments: old.commitments.filter((c) => c.id !== id),
          };
        },
      );

      return { previousData };
    },
    onError: (_err, _vars, context) => {
      // Roll back optimistic update
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['commitments'] });
    },
  });
}

/**
 * Fetch recent activity events.
 */
export function useActivity(limit = 5): {
  data: ActivityItem[];
  isLoading: boolean;
  error: Error | null;
} {
  const result = useQuery({
    queryKey: ['activity', limit],
    queryFn: () => fetchActivity(limit),
    staleTime: 30 * 1000, // 30 seconds
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
  };
}

/**
 * Mutation to scan meetings and reconcile against open commitments.
 * Returns candidates that match completion signals from recent meetings.
 */
export function useReconcileCommitments() {
  return useMutation({
    mutationFn: reconcileCommitments,
  });
}

// Re-export ReconciliationCandidate for consumers
export type { ReconciliationCandidate };
