/**
 * TanStack Query hooks for the Review page.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPendingReview, completeReview } from '@/api/review.js';
import type { CompleteReviewRequest } from '@/api/types.js';

/** Fetch all pending review items */
export function usePendingReview() {
  return useQuery({
    queryKey: ['review', 'pending'],
    queryFn: fetchPendingReview,
    staleTime: 30 * 1000, // 30 seconds — review data changes frequently
  });
}

/** Submit review completion */
export function useCompleteReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CompleteReviewRequest) => completeReview(request),
    onSuccess: () => {
      // Invalidate review cache after completion
      void queryClient.invalidateQueries({ queryKey: ['review'] });
      // Also invalidate related caches
      void queryClient.invalidateQueries({ queryKey: ['meetings'] });
      void queryClient.invalidateQueries({ queryKey: ['commitments'] });
      void queryClient.invalidateQueries({ queryKey: ['memory'] });
    },
  });
}
