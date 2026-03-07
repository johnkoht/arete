/**
 * TanStack Query hooks for the Memory Feed page.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchMemory } from '@/api/memory.js';
import type { MemoryItemType } from '@/api/types.js';

type UseMemoryParams = {
  type?: MemoryItemType | 'all';
  q?: string;
  limit?: number;
  offset?: number;
};

export function useMemory({ type = 'all', q = '', limit = 100, offset = 0 }: UseMemoryParams = {}) {
  return useQuery({
    queryKey: ['memory', 'feed', type, q, limit, offset],
    queryFn: () => fetchMemory({ type, q, limit, offset }),
    staleTime: 3 * 60 * 1000,
  });
}
