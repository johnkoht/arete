/**
 * API functions for intelligence routes.
 */

import { apiFetch } from './client.js';
import type { PatternsResponse, CommitmentsListResponse } from './types.js';

/**
 * GET /api/intelligence/patterns?days=N — cross-person signal patterns.
 * Returns patterns sorted by mention count descending.
 */
export async function fetchPatterns(days = 30): Promise<PatternsResponse> {
  return apiFetch<PatternsResponse>(`/api/intelligence/patterns?days=${days}`);
}

/**
 * GET /api/commitments — open commitments list with optional filter.
 */
export async function fetchCommitments(
  filter?: 'overdue' | 'thisweek'
): Promise<CommitmentsListResponse> {
  const qs = filter ? `?filter=${filter}` : '';
  return apiFetch<CommitmentsListResponse>(`/api/commitments${qs}`);
}
