/**
 * TanStack Query hooks for the People Intelligence page.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPeople, fetchPerson, patchPersonNotes, patchPerson } from '@/api/people.js';
import type { PeopleResponse, PersonSummary } from '@/api/types.js';

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

/**
 * Toggle favorite status with optimistic update.
 * Follows the cancelQueries + rollback pattern from LEARNINGS.md.
 */
export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ slug, favorite }: { slug: string; favorite: boolean }) =>
      patchPerson(slug, { favorite }),

    onMutate: async ({ slug, favorite }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['people'] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<PeopleResponse>(['people']);

      // Optimistically update the cache
      queryClient.setQueryData<PeopleResponse>(['people'], (old) => {
        if (!old) return old;
        return {
          ...old,
          people: old.people.map((p: PersonSummary) =>
            p.slug === slug ? { ...p, favorite } : p
          ),
        };
      });

      return { previousData };
    },

    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['people'], context.previousData);
      }
    },

    onSettled: () => {
      // Refetch to ensure server state consistency
      void queryClient.invalidateQueries({ queryKey: ['people'] });
    },
  });
}
