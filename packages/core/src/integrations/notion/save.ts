/**
 * Notion page save logic — write markdown with YAML frontmatter.
 *
 * Follows the saveMeetingFile() pattern from ../meetings.ts,
 * adapted for Notion pages with notion_page_id deduplication.
 */

import { join } from 'path';
import { stringify as stringifyYaml } from 'yaml';
import type { StorageAdapter } from '../../storage/adapter.js';
import type { NotionPageResult } from './types.js';
import { slugify } from '../../utils/slugify.js';

/**
 * Generate a filename for a Notion page.
 * Format: {slugified-title}.md
 */
export function notionPageFilename(title: string): string {
  return `${slugify(title)}.md`;
}

/**
 * Check if any existing file in the destination directory has a matching
 * notion_page_id in its YAML frontmatter.
 *
 * Returns the path of the duplicate file if found, null otherwise.
 */
export async function findDuplicateByPageId(
  storage: StorageAdapter,
  directory: string,
  notionPageId: string
): Promise<string | null> {
  const dirExists = await storage.exists(directory);
  if (!dirExists) return null;

  const files = await storage.list(directory, { extensions: ['.md'] });

  for (const filePath of files) {
    const content = await storage.read(filePath);
    if (!content) continue;

    const pageId = extractNotionPageId(content);
    if (pageId === notionPageId) return filePath;
  }

  return null;
}

/**
 * Extract notion_page_id from YAML frontmatter in a markdown file.
 * Returns null if not found or no frontmatter.
 */
function extractNotionPageId(content: string): string | null {
  if (!content.startsWith('---')) return null;

  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) return null;

  const frontmatter = content.slice(4, endIndex);
  const match = frontmatter.match(/^notion_page_id:\s*"?([^"\n]+)"?\s*$/m);
  return match ? match[1].trim() : null;
}

/**
 * Save a Notion page as a markdown file with YAML frontmatter.
 *
 * @returns Full path if saved, null if skipped (duplicate)
 */
export async function saveNotionPage(
  storage: StorageAdapter,
  page: NotionPageResult,
  destination: string,
  options?: { force?: boolean }
): Promise<string | null> {
  const force = options?.force ?? false;

  // Dedup check: skip if a file with the same notion_page_id exists
  if (!force) {
    const duplicate = await findDuplicateByPageId(storage, destination, page.id);
    if (duplicate) return null;
  }

  const filename = notionPageFilename(page.title);
  const fullPath = join(destination, filename);

  const frontmatterData = {
    title: page.title,
    source: 'notion',
    source_url: page.url,
    notion_page_id: page.id,
    fetched_at: new Date().toISOString(),
  };

  const frontmatterYaml = stringifyYaml(frontmatterData).trimEnd();
  const content = `---\n${frontmatterYaml}\n---\n\n${page.markdown}`;

  await storage.mkdir(destination);
  await storage.write(fullPath, content);

  return fullPath;
}
