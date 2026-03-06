/**
 * TanStack Query hook for workspace search with debouncing.
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchWorkspace } from '@/api/search.js';
import type { SearchResult } from '@/api/types.js';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 2;

/**
 * Debounced search hook.
 * Only fires a query when `q` has >= 2 characters after a 300ms pause.
 */
export function useSearch(
  q: string,
  type?: 'meetings' | 'people' | 'memory' | 'projects' | 'all',
): {
  data: SearchResult[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
} {
  const [debouncedQ, setDebouncedQ] = useState(q);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  const enabled = debouncedQ.trim().length >= MIN_QUERY_LEN;

  const result = useQuery({
    queryKey: ['search', debouncedQ, type ?? 'all'],
    queryFn: () => searchWorkspace(debouncedQ, type),
    enabled,
    staleTime: 60 * 1000, // 1 minute
    placeholderData: (prev) => prev,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading && enabled,
    isFetching: result.isFetching,
    error: result.error,
  };
}
