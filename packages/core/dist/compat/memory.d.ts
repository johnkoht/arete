/**
 * Compatibility shim for searchMemory.
 * Delegates to MemoryService for backward compatibility with existing CLI.
 */
import type { WorkspacePaths, MemorySearchResult, MemorySearchOptions } from '../models/index.js';
/**
 * Search workspace memory for items matching a query.
 * Delegates to MemoryService.
 */
export declare function searchMemory(query: string, paths: WorkspacePaths, options?: MemorySearchOptions): Promise<MemorySearchResult>;
//# sourceMappingURL=memory.d.ts.map