/**
 * Notion URL and page ID resolution.
 */
/**
 * Extract a 32-char hex page ID from any Notion URL format or raw UUID.
 *
 * Supported formats:
 * - Workspace URL: notion.so/workspace/Title-abc123...
 * - Short URL: notion.so/abc123...
 * - Custom domain: workspace.notion.site/Title-abc123...
 * - URL with query params: ...?v=xxx&p=yyy
 * - Raw UUID with dashes: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 * - Raw UUID without dashes: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *
 * If input doesn't match any pattern, returns as-is (let the API error handle it).
 */
export declare function resolvePageId(urlOrId: string): string;
//# sourceMappingURL=url.d.ts.map