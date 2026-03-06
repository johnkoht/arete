/**
 * TanStack Query hooks for intelligence routes.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchPatterns } from '@/api/intelligence.js';
import type { SignalPattern } from '@/api/types.js';

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
