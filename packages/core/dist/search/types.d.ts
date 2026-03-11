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
}
export interface SearchProvider {
    name: string;
    isAvailable(): Promise<boolean>;
    search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
    semanticSearch(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}
//# sourceMappingURL=types.d.ts.map