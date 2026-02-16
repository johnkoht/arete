/**
 * Search provider interface for semantic and keyword search.
 */

export interface SearchResult {
  path: string;
  score: number;
  excerpt?: string;
}

export interface SearchProvider {
  search(query: string, directory: string): Promise<SearchResult[]>;
  semanticSearch(query: string, directory: string): Promise<SearchResult[]>;
}
