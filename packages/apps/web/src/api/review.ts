/**
 * Typed API functions for review endpoints.
 */

import { apiFetch } from './client.js';
import type {
  PendingReviewResponse,
  CompleteReviewRequest,
  CompleteReviewResponse,
  AutoApprovePreviewResponse,
} from './types.js';

/** GET /api/review/pending — fetch all pending review items */
export async function fetchPendingReview(): Promise<PendingReviewResponse> {
  return apiFetch<PendingReviewResponse>('/api/review/pending');
}

/** POST /api/review/complete — submit review completion */
export async function completeReview(
  request: CompleteReviewRequest
): Promise<CompleteReviewResponse> {
  return apiFetch<CompleteReviewResponse>('/api/review/complete', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/** GET /api/review/auto-approve-preview — find meetings where all items meet confidence threshold */
export async function fetchAutoApprovePreview(
  threshold = 0.8
): Promise<AutoApprovePreviewResponse> {
  return apiFetch<AutoApprovePreviewResponse>(
    `/api/review/auto-approve-preview?threshold=${threshold}`
  );
}
