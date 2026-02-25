/**
 * Notion integration — pull pages as markdown.
 *
 * Follows pullFathom() pattern: load API key → create client → iterate items → save each → return results.
 * Pages are processed sequentially to respect Notion API rate limits.
 */
import { loadNotionApiKey } from './config.js';
import { NotionClient } from './client.js';
import { resolvePageId } from './url.js';
import { blocksToMarkdown } from './blocks-to-markdown.js';
import { saveNotionPage } from './save.js';
/**
 * Pull Notion pages into the workspace as markdown.
 *
 * @param storage - Storage adapter for file I/O
 * @param workspaceRoot - Workspace root path
 * @param _paths - Workspace path map (from IntegrationService)
 * @param options - Pages to pull and destination directory
 * @returns Pull result with saved/skipped/errors
 */
export async function pullNotionPages(storage, workspaceRoot, _paths, options) {
    const saved = [];
    const skipped = [];
    const errors = [];
    // Load API key (single source of truth)
    const apiKey = await loadNotionApiKey(storage, workspaceRoot);
    if (!apiKey) {
        return {
            saved: [],
            skipped: [],
            errors: [{ pageId: '', error: 'Notion API key not found. Run `arete integration configure notion` first.' }],
        };
    }
    const client = new NotionClient(apiKey, {
        baseUrl: process.env.ARETE_NOTION_API_BASE,
    });
    // Process pages sequentially to respect rate limits
    for (const urlOrId of options.pages) {
        const pageId = resolvePageId(urlOrId);
        try {
            // 1. Fetch page metadata
            const metadata = await client.getPage(pageId);
            // 2. Fetch all blocks
            const blocks = await client.getAllPageBlocks(pageId);
            // 3. Convert to markdown
            const markdown = blocksToMarkdown(blocks);
            // 4. Build NotionPageResult
            const pageResult = {
                id: metadata.id,
                title: metadata.title,
                url: metadata.url,
                createdTime: metadata.createdTime,
                lastEditedTime: metadata.lastEditedTime,
                markdown,
                properties: metadata.properties,
            };
            // 5. Save (dedup handled inside saveNotionPage)
            const savedPath = await saveNotionPage(storage, pageResult, options.destination);
            if (savedPath) {
                saved.push(savedPath);
            }
            else {
                skipped.push(pageId);
            }
        }
        catch (err) {
            errors.push({
                pageId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    return { saved, skipped, errors };
}
//# sourceMappingURL=index.js.map