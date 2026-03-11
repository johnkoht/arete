/**
 * ContextService — assembles relevant context for queries and skills.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { SearchProvider } from '../search/types.js';
import type { ContextRequest, ContextBundle, ContextInventory, SkillDefinition, WorkspacePaths } from '../models/index.js';
export declare class ContextService {
    private storage;
    private searchProvider;
    constructor(storage: StorageAdapter, searchProvider: SearchProvider);
    getRelevantContext(request: ContextRequest): Promise<ContextBundle>;
    /**
     * Delegate to storage.listSubdirectories for use by IntelligenceService.
     */
    listProjectSubdirs(dir: string): Promise<string[]>;
    /**
     * List all .md files in a directory for proactive search.
     */
    listProjectFiles(dir: string): Promise<string[]>;
    /**
     * Read a single file — delegate to storage for IntelligenceService proactive search.
     */
    readFile(filePath: string): Promise<string | null>;
    getContextForSkill(skill: SkillDefinition, task: string, paths: WorkspacePaths): Promise<ContextBundle>;
    getContextInventory(paths: WorkspacePaths, options?: {
        staleThresholdDays?: number;
    }): Promise<ContextInventory>;
}
//# sourceMappingURL=context.d.ts.map