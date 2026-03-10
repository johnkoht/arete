/**
 * API functions for the People Intelligence page.
 */

import { apiFetch } from './client.js';
import type { PeopleResponse, PersonDetail } from './types.js';

export type FetchPeopleParams = {
  limit?: number;
  offset?: number;
};

/** GET /api/people — all people with summary data */
export async function fetchPeople(params?: FetchPeopleParams): Promise<PeopleResponse> {
  const query = new URLSearchParams();
  if (params?.limit !== undefined) query.set('limit', String(params.limit));
  if (params?.offset !== undefined) query.set('offset', String(params.offset));
  const qs = query.toString();
  return apiFetch<PeopleResponse>(`/api/people${qs ? `?${qs}` : ''}`);
}

/** GET /api/people/:slug — full person detail */
export async function fetchPerson(slug: string): Promise<PersonDetail> {
  return apiFetch<PersonDetail>(`/api/people/${slug}`);
}

/** PATCH /api/people/:slug/notes — update person notes */
export async function patchPersonNotes(slug: string, content: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/people/${slug}/notes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

/** PATCH /api/people/:slug — update person properties (e.g. favorite status) */
export async function patchPerson(slug: string, data: { favorite?: boolean }): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/people/${slug}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
