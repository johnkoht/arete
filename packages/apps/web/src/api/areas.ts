/**
 * Areas API client
 */

import { apiFetch } from './client.js';

export type AreaSummary = {
  slug: string;
  name: string;
};

type AreasResponse = {
  areas: AreaSummary[];
};

/**
 * GET /api/areas — list all available areas.
 */
export async function fetchAreas(): Promise<AreaSummary[]> {
  const data = await apiFetch<AreasResponse>('/api/areas');
  return data.areas;
}
