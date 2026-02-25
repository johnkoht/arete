/**
 * Notion API client.
 *
 * Thin fetch-based client — no Notion SDK dependency.
 * Follows the Fathom request<T>() pattern with rate limiting and retry.
 */
import { NOTION_API_BASE } from './config.js';
/** Notion API version header */
const NOTION_VERSION = '2022-06-28';
/** Maximum nested block depth for getAllPageBlocks */
export const MAX_DEPTH = 5;
/** Maximum retries on 429 rate-limit responses */
const MAX_RETRIES = 3;
/** Base delay for exponential backoff in ms */
const BASE_DELAY_MS = 1000;
/** Rate limit: max requests per second */
const RATE_LIMIT_PER_SEC = 3;
// ---------------------------------------------------------------------------
// Error messages
// ---------------------------------------------------------------------------
const ERROR_PAGE_NOT_FOUND = 'Page not found. Make sure the page is shared with your Notion integration. ' +
    "In Notion, open the page → '...' → 'Connect to' → select your integration.";
const ERROR_INVALID_TOKEN = 'Invalid Notion API token. Check your token at notion.so/profile/integrations';
// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------
export class RateLimiter {
    timestamps = [];
    limit;
    windowMs;
    /** Injectable clock for testing */
    nowFn;
    constructor(limit = RATE_LIMIT_PER_SEC, windowMs = 1000) {
        this.limit = limit;
        this.windowMs = windowMs;
        this.nowFn = () => Date.now();
    }
    /**
     * Wait if necessary to stay within the rate limit.
     * Returns the delay in ms that was waited (0 if no wait needed).
     */
    async waitIfNeeded() {
        const now = this.nowFn();
        // Prune timestamps outside the window
        this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
        if (this.timestamps.length >= this.limit) {
            // Need to wait until the oldest timestamp exits the window
            const oldest = this.timestamps[0];
            const delayMs = this.windowMs - (now - oldest) + 1;
            if (delayMs > 0) {
                await this.delay(delayMs);
                // After waiting, prune again
                const afterWait = this.nowFn();
                this.timestamps = this.timestamps.filter((t) => afterWait - t < this.windowMs);
            }
        }
        this.timestamps.push(this.nowFn());
        return 0;
    }
    /** Overridable delay for testing */
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
// ---------------------------------------------------------------------------
// Notion Client
// ---------------------------------------------------------------------------
export class NotionClient {
    apiKey;
    baseUrl;
    rateLimiter;
    /** Injectable delay for testing retry backoff */
    delayFn;
    /** Injectable fetch for testing */
    fetchFn;
    constructor(apiKey, options) {
        if (!apiKey?.trim())
            throw new Error('Notion API key is required');
        this.apiKey = apiKey.trim();
        this.baseUrl = (options?.baseUrl ?? NOTION_API_BASE).replace(/\/$/, '');
        this.rateLimiter = options?.rateLimiter ?? new RateLimiter();
        this.fetchFn = options?.fetchFn ?? fetch;
        this.delayFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    }
    // -------------------------------------------------------------------------
    // Private request helper (Fathom pattern)
    // -------------------------------------------------------------------------
    async request(method, path, params, retryCount = 0) {
        await this.rateLimiter.waitIfNeeded();
        const pathNorm = path.startsWith('/') ? path.slice(1) : path;
        const url = new URL(`${this.baseUrl}/${pathNorm}`);
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                if (v !== undefined && v !== null) {
                    url.searchParams.set(k, String(v));
                }
            }
        }
        const res = await this.fetchFn(url.toString(), {
            method,
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Notion-Version': NOTION_VERSION,
                'Content-Type': 'application/json',
            },
        });
        if (!res.ok) {
            // 429: Rate limited — exponential backoff
            if (res.status === 429 && retryCount < MAX_RETRIES) {
                const delayMs = BASE_DELAY_MS * Math.pow(2, retryCount);
                await this.delayFn(delayMs);
                return this.request(method, path, params, retryCount + 1);
            }
            // 401: Invalid token
            if (res.status === 401) {
                throw new Error(ERROR_INVALID_TOKEN);
            }
            // 404: Page not found / not shared
            if (res.status === 404) {
                throw new Error(ERROR_PAGE_NOT_FOUND);
            }
            // 429 after max retries
            if (res.status === 429) {
                throw new Error(`Notion API rate limited after ${MAX_RETRIES} retries. Try again later.`);
            }
            // Other errors
            const body = await res.text().catch(() => '');
            throw new Error(`Notion API error: ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`);
        }
        return res.json();
    }
    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------
    /**
     * Get page metadata (title, URL, timestamps).
     */
    async getPage(pageId) {
        const page = await this.request('GET', `/v1/pages/${encodeURIComponent(pageId)}`);
        return {
            id: page.id,
            title: extractTitle(page.properties),
            url: page.url,
            createdTime: page.created_time,
            lastEditedTime: page.last_edited_time,
            properties: page.properties,
        };
    }
    /**
     * Get one page of block children with optional pagination cursor.
     */
    async getPageBlocks(blockId, startCursor) {
        const params = {
            page_size: 100,
        };
        if (startCursor)
            params.start_cursor = startCursor;
        return this.request('GET', `/v1/blocks/${encodeURIComponent(blockId)}/children`, params);
    }
    /**
     * Iteratively fetch ALL blocks for a page, including nested children.
     * Returns a flat list with depth metadata — no recursion.
     */
    async getAllPageBlocks(pageId, maxDepth = MAX_DEPTH) {
        const result = [];
        // Queue entries: [blockId to fetch children from, depth of those children]
        const queue = [
            { parentId: pageId, depth: 0 },
        ];
        while (queue.length > 0) {
            const entry = queue.shift();
            let cursor;
            // Paginate through all children of this parent
            do {
                const response = await this.getPageBlocks(entry.parentId, cursor);
                for (const block of response.results) {
                    const flatBlock = toFlatBlock(block, entry.depth);
                    result.push(flatBlock);
                    if (block.has_children) {
                        if (entry.depth < maxDepth) {
                            queue.push({ parentId: block.id, depth: entry.depth + 1 });
                        }
                        else {
                            // Beyond max depth — add placeholder
                            result.push({
                                id: `${block.id}-depth-placeholder`,
                                type: 'depth_limit_placeholder',
                                has_children: false,
                                depth: entry.depth + 1,
                                data: {},
                                rich_text: [],
                            });
                        }
                    }
                }
                cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
            } while (cursor);
        }
        return result;
    }
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Extract page title from Notion properties.
 * The title property can be named "title", "Name", or any custom name —
 * we look for the first property with type "title".
 */
function extractTitle(properties) {
    for (const value of Object.values(properties)) {
        const prop = value;
        if (prop.type === 'title') {
            const titleArr = prop.title;
            if (titleArr?.length) {
                return titleArr.map((t) => t.plain_text).join('');
            }
        }
    }
    return 'Untitled';
}
/** Convert a Notion block API response to our FlatBlock shape */
function toFlatBlock(block, depth) {
    const blockType = block.type;
    const typeData = (block[blockType] ?? {});
    // Extract rich_text if present in the type-specific data
    const richText = (typeData.rich_text ?? []);
    return {
        id: block.id,
        type: blockType,
        has_children: block.has_children,
        depth,
        data: typeData,
        rich_text: richText,
    };
}
//# sourceMappingURL=client.js.map