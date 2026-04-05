/**
 * TanStack Query hooks for the Review page.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPendingReview, completeReview, fetchAutoApprovePreview } from '@/api/review.js';
import type { CompleteReviewRequest } from '@/api/types.js';

/** Fetch all pending review items */
export function usePendingReview() {
  return useQuery({
    queryKey: ['review', 'pending'],
    queryFn: fetchPendingReview,
    staleTime: 30 * 1000, // 30 seconds — review data changes frequently
  });
}

/** Fetch auto-approve preview — meetings where all items meet confidence threshold */
export function useAutoApprovePreview(threshold: number, enabled: boolean) {
  return useQuery({
    queryKey: ['review', 'auto-approve-preview', threshold],
    queryFn: () => fetchAutoApprovePreview(threshold),
    enabled,
    staleTime: 60 * 1000, // 1 minute
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
