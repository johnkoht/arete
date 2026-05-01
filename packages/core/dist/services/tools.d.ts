/**
 * Workspace tool discovery — read TOOL.md frontmatter from a tools directory.
 *
 * Business logic only. No chalk, inquirer, or other CLI dependencies.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { ToolDefinition } from '../models/index.js';
/**
 * List all tools in the given tools directory.
 *
 * @param storage - Storage adapter for filesystem access
 * @param toolsDir - Resolved absolute path to the tools directory
 *   (e.g. WorkspacePaths.tools). The caller is responsible for
 *   resolving the IDE-specific path.
 */
export declare function listTools(storage: StorageAdapter, toolsDir: string): Promise<ToolDefinition[]>;
/**
 * Get a specific tool by id from the tools directory.
 *
 * @param storage - Storage adapter for filesystem access
 * @param id - Tool identifier (directory name)
 * @param toolsDir - Resolved absolute path to the tools directory
 */
export declare function getTool(storage: StorageAdapter, id: string, toolsDir: string): Promise<ToolDefinition | null>;
//# sourceMappingURL=tools.d.ts.map