/**
 * MemorySummary loader — gathers the workspace-state snapshot that
 * `generateClaudeMd` consumes. Partial-state tolerant: surface-level
 * errors from any sub-source fall back to an empty list rather than
 * failing the whole load. Callers decide how to handle
 * `activeTopics: []` (render empty section vs omit entirely).
 *
 * Lives in its own module (not inside WorkspaceService) so CLI and
 * service callers can import without a service-graph dependency.
 */

import type { TopicMemoryService } from './topic-memory.js';
import type { WorkspacePaths } from '../models/workspace.js';
import type { MemorySummary } from '../models/memory-summary.js';
import { getActiveTopics, type GetActiveTopicsOptions } from '../models/active-topics.js';

export interface LoadMemorySummaryOptions {
  /** Limit / recency / today injection for `getActiveTopics`. */
  activeTopics?: GetActiveTopicsOptions;
}

/**
 * Load the workspace memory summary from on-disk state. Returns
 * `{ activeTopics: [] }` on fresh workspaces — caller should omit the
 * section entirely for byte-equal init output.
 */
export async function loadMemorySummary(
  topicMemory: TopicMemoryService,
  paths: WorkspacePaths,
  options: LoadMemorySummaryOptions = {},
): Promise<MemorySummary> {
  let activeTopics: MemorySummary['activeTopics'] = [];
  try {
    const { topics } = await topicMemory.listAll(paths);
    activeTopics = getActiveTopics(topics, options.activeTopics);
  } catch {
    // Partial-state tolerance: leave activeTopics empty on any failure.
  }
  return { activeTopics };
}
