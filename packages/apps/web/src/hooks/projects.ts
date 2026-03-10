/**
 * Projects hooks
 */

import { useQuery } from '@tanstack/react-query';
import { fetchProjects, type ProjectSummary } from '@/api/projects.js';

export function useProjects() {
  return useQuery<ProjectSummary[]>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
