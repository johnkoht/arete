/**
 * TanStack Query hooks for the Dashboard page.
 */

import { useQuery } from '@tanstack/react-query';
import {
  fetchCalendarToday,
  fetchCommitmentsSummary,
  fetchProjects,
  fetchRecentMemory,
} from '@/api/dashboard.js';

export function useCalendarToday() {
  return useQuery({
    queryKey: ['calendar', 'today'],
    queryFn: fetchCalendarToday,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCommitmentsSummary() {
  return useQuery({
    queryKey: ['commitments', 'summary'],
    queryFn: fetchCommitmentsSummary,
    staleTime: 2 * 60 * 1000,
  });
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecentMemory(limit = 5) {
  return useQuery({
    queryKey: ['memory', 'recent', limit],
    queryFn: () => fetchRecentMemory(limit),
    staleTime: 5 * 60 * 1000,
  });
}
