/**
 * Areas hooks
 */

import { useQuery } from '@tanstack/react-query';
import { fetchAreas } from '@/api/areas.js';
import type { AreaSummary } from '@/api/types.js';

export function useAreas() {
  return useQuery<AreaSummary[]>({
    queryKey: ['areas'],
    queryFn: fetchAreas,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
