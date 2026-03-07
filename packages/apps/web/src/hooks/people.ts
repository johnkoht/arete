/**
 * TanStack Query hooks for the People Intelligence page.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPeople, fetchPerson, patchPersonNotes } from '@/api/people.js';

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

export function useUpdatePersonNotes(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => patchPersonNotes(slug, content),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['person', slug] });
    },
  });
}
