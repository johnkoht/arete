/**
 * TanStack Query hooks for the Goals Alignment page.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchStrategy, fetchQuarterGoals, fetchWeekGoals } from '@/api/goals.js';

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
