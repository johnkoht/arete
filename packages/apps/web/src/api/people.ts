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
