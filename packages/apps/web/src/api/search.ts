/**
 * API functions for the search route.
 */

import { apiFetch } from './client.js';
import type { SearchResponse, SearchResult } from './types.js';

/**
 * GET /api/search?q=<query>&type=<type> — search workspace files.
 */
export async function searchWorkspace(
  q: string,
  type?: 'meetings' | 'people' | 'memory' | 'projects' | 'all',
): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q });
  if (type && type !== 'all') params.set('type', type);
  const response = await apiFetch<SearchResponse>(`/api/search?${params.toString()}`);
  return response.results;
}
