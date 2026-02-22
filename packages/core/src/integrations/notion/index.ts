/**
 * Notion integration — pull pages as markdown.
 *
 * Stub: Task 5 implements the full pull logic.
 */

import type { StorageAdapter } from '../../storage/adapter.js';
import type { NotionPullResult, NotionPullOptions } from './types.js';

/**
 * Pull Notion pages into the workspace as markdown.
 *
 * @param storage - Storage adapter for file I/O
 * @param workspaceRoot - Workspace root path
 * @param paths - Workspace path map (from IntegrationService)
 * @param options - Pages to pull and destination directory
 * @returns Pull result with saved/skipped/errors counts
 */
export async function pullNotionPages(
  _storage: StorageAdapter,
  _workspaceRoot: string,
  _paths: Record<string, string>,
  _options: NotionPullOptions
): Promise<NotionPullResult> {
  // TODO: Implement in Task 5
  return { saved: [], skipped: [], errors: [] };
}
