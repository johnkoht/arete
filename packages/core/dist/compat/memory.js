/**
 * Compatibility shim for searchMemory.
 * Delegates to MemoryService for backward compatibility with existing CLI.
 */
import { FileStorageAdapter } from '../storage/file.js';
import { getSearchProvider } from '../search/factory.js';
import { MemoryService } from '../services/memory.js';
/**
 * Search workspace memory for items matching a query.
 * Delegates to MemoryService.
 */
export async function searchMemory(query, paths, options = {}) {
    const storage = new FileStorageAdapter();
    const searchProvider = getSearchProvider(paths.root);
    const service = new MemoryService(storage, searchProvider);
    return service.search({
        query,
        paths,
        types: options.types,
        limit: options.limit,
    });
}
//# sourceMappingURL=memory.js.map