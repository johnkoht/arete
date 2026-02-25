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
export function resolvePageId(urlOrId) {
    const trimmed = urlOrId.trim();
    // Raw 32-char hex (no dashes)
    if (/^[0-9a-f]{32}$/i.test(trimmed)) {
        return trimmed.toLowerCase();
    }
    // Raw UUID with dashes (8-4-4-4-12)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
        return trimmed.replace(/-/g, '').toLowerCase();
    }
    // URL: extract the last 32-char hex string from the path portion
    // Strip query params and hash first
    const pathPart = trimmed.split('?')[0].split('#')[0];
    const match = pathPart.match(/[0-9a-f]{32}/gi);
    if (match) {
        // Take the last match (the page ID is typically at the end of the URL path)
        return match[match.length - 1].toLowerCase();
    }
    // No pattern matched — return as-is
    return trimmed;
}
//# sourceMappingURL=url.js.map