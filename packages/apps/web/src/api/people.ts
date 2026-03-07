/**
 * API functions for the People Intelligence page.
 */

import { apiFetch } from './client.js';
import type { PeopleResponse, PersonDetail } from './types.js';

/** GET /api/people — all people with summary data */
export async function fetchPeople(): Promise<PeopleResponse> {
  return apiFetch<PeopleResponse>('/api/people');
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
