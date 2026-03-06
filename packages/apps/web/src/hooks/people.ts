/**
 * TanStack Query hooks for the People Intelligence page.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchPeople, fetchPerson } from '@/api/people.js';

export function usePeople() {
  return useQuery({
    queryKey: ['people'],
    queryFn: fetchPeople,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePerson(slug: string) {
  return useQuery({
    queryKey: ['person', slug],
    queryFn: () => fetchPerson(slug),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });
}
