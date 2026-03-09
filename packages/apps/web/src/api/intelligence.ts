/**
 * API functions for intelligence routes.
 */

import { apiFetch } from './client.js';
import type {
  PatternsResponse,
  CommitmentsListResponse,
  CommitmentItem,
  ActivityResponse,
  ActivityItem,
} from './types.js';

/**
 * GET /api/intelligence/patterns?days=N — cross-person signal patterns.
 * Returns patterns sorted by mention count descending.
 */
export async function fetchPatterns(days = 30): Promise<PatternsResponse> {
  return apiFetch<PatternsResponse>(`/api/intelligence/patterns?days=${days}`);
}

export type DirectionFilter = 'mine' | 'theirs' | 'all';

export type CommitmentsParams = {
  filter?: 'overdue' | 'thisweek' | 'open' | 'all';
  direction?: DirectionFilter;
  person?: string;
};

/**
 * GET /api/commitments — commitments list with optional filter, direction, and person.
 */
export async function fetchCommitments(
  params?: CommitmentsParams,
): Promise<CommitmentsListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.filter) searchParams.set('filter', params.filter);
  if (params?.direction && params.direction !== 'all') {
    searchParams.set('direction', params.direction);
  }
  if (params?.person) searchParams.set('person', params.person);
  const qs = searchParams.toString();
  return apiFetch<CommitmentsListResponse>(`/api/commitments${qs ? `?${qs}` : ''}`);
}

/**
 * PATCH /api/commitments/:id — update commitment status.
 */
export async function patchCommitment(
  id: string,
  status: 'resolved' | 'dropped',
): Promise<{ commitment: CommitmentItem }> {
  return apiFetch<{ commitment: CommitmentItem }>(`/api/commitments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/**
 * GET /api/activity?limit=N — recent activity events.
 */
export async function fetchActivity(limit = 5): Promise<ActivityItem[]> {
  const response = await apiFetch<ActivityResponse>(`/api/activity?limit=${limit}`);
  return response.events;
}
