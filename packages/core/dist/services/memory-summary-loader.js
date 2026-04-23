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
import { getActiveTopics } from '../models/active-topics.js';
/**
 * Load the workspace memory summary from on-disk state. Returns
 * `{ activeTopics: [] }` on fresh workspaces — caller should omit the
 * section entirely for byte-equal init output.
 */
export async function loadMemorySummary(topicMemory, paths, options = {}) {
    let activeTopics = [];
    try {
        const { topics } = await topicMemory.listAll(paths);
        activeTopics = getActiveTopics(topics, options.activeTopics);
    }
    catch {
        // Partial-state tolerance: leave activeTopics empty on any failure.
    }
    return { activeTopics };
}
//# sourceMappingURL=memory-summary-loader.js.map