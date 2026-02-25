/**
 * ToolService — manages tool discovery from workspace tools directory.
 *
 * Business logic only. No chalk, inquirer, or other CLI dependencies.
 * Mirrors SkillService pattern for consistency.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { ToolDefinition } from '../models/index.js';
export declare class ToolService {
    private storage;
    constructor(storage: StorageAdapter);
    /**
     * List all tools in the given tools directory.
     *
     * @param toolsDir - Resolved absolute path to the tools directory
     *   (e.g. WorkspacePaths.tools). The caller is responsible for
     *   resolving the IDE-specific path.
     */
    list(toolsDir: string): Promise<ToolDefinition[]>;
    /**
     * Get a specific tool by id from the tools directory.
     *
     * @param id - Tool identifier (directory name)
     * @param toolsDir - Resolved absolute path to the tools directory
     */
    get(id: string, toolsDir: string): Promise<ToolDefinition | null>;
    /**
     * Read tool metadata from a tool directory.
     * If no TOOL.md exists, returns a minimal definition with id and name from dirname.
     */
    private getInfo;
}
//# sourceMappingURL=tools.d.ts.map