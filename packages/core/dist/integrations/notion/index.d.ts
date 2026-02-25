/**
 * Notion integration — pull pages as markdown.
 *
 * Follows pullFathom() pattern: load API key → create client → iterate items → save each → return results.
 * Pages are processed sequentially to respect Notion API rate limits.
 */
import type { StorageAdapter } from '../../storage/adapter.js';
import type { NotionPullResult, NotionPullOptions } from './types.js';
/**
 * Pull Notion pages into the workspace as markdown.
 *
 * @param storage - Storage adapter for file I/O
 * @param workspaceRoot - Workspace root path
 * @param _paths - Workspace path map (from IntegrationService)
 * @param options - Pages to pull and destination directory
 * @returns Pull result with saved/skipped/errors
 */
export declare function pullNotionPages(storage: StorageAdapter, workspaceRoot: string, _paths: Record<string, string>, options: NotionPullOptions): Promise<NotionPullResult>;
//# sourceMappingURL=index.d.ts.map