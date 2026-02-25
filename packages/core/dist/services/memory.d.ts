/**
 * MemoryService — manages memory entries and search.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { SearchProvider } from '../search/types.js';
import type { MemorySearchRequest, MemorySearchResult, CreateMemoryRequest, MemoryEntry, MemoryTimeline, MemoryIndex, DateRange, WorkspacePaths } from '../models/index.js';
export declare class MemoryService {
    private storage;
    private searchProvider;
    constructor(storage: StorageAdapter, searchProvider: SearchProvider);
    search(request: MemorySearchRequest): Promise<MemorySearchResult>;
    create(entry: CreateMemoryRequest): Promise<MemoryEntry>;
    getTimeline(query: string, paths: WorkspacePaths, range?: DateRange): Promise<MemoryTimeline>;
    getIndex(paths: WorkspacePaths): Promise<MemoryIndex>;
}
//# sourceMappingURL=memory.d.ts.map