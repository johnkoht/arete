/**
 * API functions for the Memory Feed page.
 */

import { apiFetch } from './client.js';
import type { MemoryResponse, MemoryItemType } from './types.js';

type FetchMemoryParams = {
  type?: MemoryItemType | 'all';
  q?: string;
  limit?: number;
  offset?: number;
};

/** GET /api/memory — paginated, filterable memory feed */
export async function fetchMemory({
  type = 'all',
  q = '',
  limit = 100,
  offset = 0,
}: FetchMemoryParams = {}): Promise<MemoryResponse> {
  const params = new URLSearchParams({
    type,
    limit: String(limit),
    offset: String(offset),
  });
  if (q.trim()) params.set('q', q.trim());

  return apiFetch<MemoryResponse>(`/api/memory?${params.toString()}`);
}
