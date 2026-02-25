/**
 * Notion page save logic — write markdown with YAML frontmatter.
 *
 * Follows the saveMeetingFile() pattern from ../meetings.ts,
 * adapted for Notion pages with notion_page_id deduplication.
 */
import type { StorageAdapter } from '../../storage/adapter.js';
import type { NotionPageResult } from './types.js';
/**
 * Generate a filename for a Notion page.
 * Format: {slugified-title}.md
 */
export declare function notionPageFilename(title: string): string;
/**
 * Check if any existing file in the destination directory has a matching
 * notion_page_id in its YAML frontmatter.
 *
 * Returns the path of the duplicate file if found, null otherwise.
 */
export declare function findDuplicateByPageId(storage: StorageAdapter, directory: string, notionPageId: string): Promise<string | null>;
/**
 * Save a Notion page as a markdown file with YAML frontmatter.
 *
 * @returns Full path if saved, null if skipped (duplicate)
 */
export declare function saveNotionPage(storage: StorageAdapter, page: NotionPageResult, destination: string, options?: {
    force?: boolean;
}): Promise<string | null>;
//# sourceMappingURL=save.d.ts.map