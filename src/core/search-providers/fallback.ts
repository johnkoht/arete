/**
 * Fallback search provider — token-based keyword matching.
 * Used when QMD is not available. Full implementation in task A2;
 * this stub satisfies the SearchProvider interface for the factory in A1.
 */

import type { SearchOptions, SearchProvider, SearchResult } from '../search.js';

export const FALLBACK_PROVIDER_NAME = 'fallback';

/**
 * Token-based search provider. isAvailable() always true.
 * search() and semanticSearch() return empty until A2 implements scoring.
 */
export function getSearchProvider(_workspaceRoot: string): SearchProvider {
  return {
    name: FALLBACK_PROVIDER_NAME,
    async isAvailable(): Promise<boolean> {
      return true;
    },
    async search(_query: string, _options?: SearchOptions): Promise<SearchResult[]> {
      return [];
    },
    async semanticSearch(_query: string, _options?: SearchOptions): Promise<SearchResult[]> {
      return [];
    },
  };
}
