/**
 * Notion API client.
 *
 * Thin fetch-based client — no Notion SDK dependency.
 * Follows the Fathom request<T>() pattern with rate limiting and retry.
 */
import type { FlatBlock } from './types.js';
/** Maximum nested block depth for getAllPageBlocks */
export declare const MAX_DEPTH = 5;
/** Notion block object (subset we use) */
type NotionBlockResponse = {
    object: 'block';
    id: string;
    type: string;
    has_children: boolean;
    [key: string]: unknown;
};
/** Page metadata returned by getPage */
export type PageMetadata = {
    id: string;
    title: string;
    url: string;
    createdTime: string;
    lastEditedTime: string;
    properties: Record<string, unknown>;
};
export declare class RateLimiter {
    private timestamps;
    private readonly limit;
    private readonly windowMs;
    /** Injectable clock for testing */
    nowFn: () => number;
    constructor(limit?: number, windowMs?: number);
    /**
     * Wait if necessary to stay within the rate limit.
     * Returns the delay in ms that was waited (0 if no wait needed).
     */
    waitIfNeeded(): Promise<number>;
    /** Overridable delay for testing */
    delay(ms: number): Promise<void>;
}
export declare class NotionClient {
    private readonly apiKey;
    private readonly baseUrl;
    private readonly rateLimiter;
    /** Injectable delay for testing retry backoff */
    delayFn: (ms: number) => Promise<void>;
    /** Injectable fetch for testing */
    fetchFn: typeof fetch;
    constructor(apiKey: string, options?: {
        baseUrl?: string;
        rateLimiter?: RateLimiter;
        fetchFn?: typeof fetch;
    });
    private request;
    /**
     * Get page metadata (title, URL, timestamps).
     */
    getPage(pageId: string): Promise<PageMetadata>;
    /**
     * Get one page of block children with optional pagination cursor.
     */
    getPageBlocks(blockId: string, startCursor?: string): Promise<{
        results: NotionBlockResponse[];
        next_cursor: string | null;
        has_more: boolean;
    }>;
    /**
     * Iteratively fetch ALL blocks for a page, including nested children.
     * Returns a flat list with depth metadata — no recursion.
     */
    getAllPageBlocks(pageId: string, maxDepth?: number): Promise<FlatBlock[]>;
}
export {};
//# sourceMappingURL=client.d.ts.map