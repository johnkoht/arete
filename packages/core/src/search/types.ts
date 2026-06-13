/**
 * Search provider interface for semantic and keyword search.
 */

export type SearchMatchType = 'keyword' | 'semantic' | 'hybrid';

export interface SearchResult {
  path: string;
  content: string;
  score: number;
  matchType: SearchMatchType;
}

export interface SearchOptions {
  limit?: number;
  paths?: string[];
  minScore?: number;
  /**
   * Opt-in degradation signal. A provider invokes this when it returns `[]`
   * NOT because the corpus genuinely had no matches, but because the search
   * was cut short — e.g. the qmd subprocess hit its timeout. This lets
   * latency-sensitive callers (wiki retrieval) tell "found nothing" apart
   * from "didn't finish" and degrade to a cheaper fallback instead of
   * silently dropping a section. Callers that omit it keep the existing
   * graceful-`[]`-on-failure behavior, unchanged.
   */
  onDegraded?: (reason: 'timeout') => void;
}

export interface SearchProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  semanticSearch(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}
