/**
 * TanStack Query hooks for the Goals Alignment page.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchStrategy, fetchQuarterGoals, fetchWeekGoals, patchWeekPriority, fetchGoalsList, type GoalSummary } from '@/api/goals.js';
import { toast } from 'sonner';

export function useStrategy() {
  return useQuery({
    queryKey: ['goals', 'strategy'],
    queryFn: fetchStrategy,
    staleTime: 10 * 60 * 1000,
  });
}

export function useQuarterGoals() {
  return useQuery({
    queryKey: ['goals', 'quarter'],
    queryFn: fetchQuarterGoals,
    staleTime: 10 * 60 * 1000,
  });
}

export function useWeekGoals() {
  return useQuery({
    queryKey: ['goals', 'week'],
    queryFn: fetchWeekGoals,
    staleTime: 5 * 60 * 1000,
  });
}

export function useToggleWeekPriority() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ index, done }: { index: number; done: boolean }) =>
      patchWeekPriority(index, done),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['goals', 'week'] });
    },
    onError: () => {
      toast.error("Couldn't save — check if file is writable");
    },
  });
}

/** Hook for loading active goals list (for action item linking) */
export function useGoalsList() {
  return useQuery<GoalSummary[]>({
    queryKey: ['goals', 'list'],
    queryFn: fetchGoalsList,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
