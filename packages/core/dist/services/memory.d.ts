/**
 * MemoryService — manages memory entries and search.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { SearchProvider } from '../search/types.js';
import type { MemorySearchRequest, MemorySearchResult, CreateMemoryRequest, MemoryEntry, MemoryTimeline, MemoryIndex, DateRange, WorkspacePaths } from '../models/index.js';
export interface MemorySection {
    title: string;
    date?: string;
    source?: string;
    topics?: string[];
    body: string;
    raw: string;
}
/**
 * Parse memory file content into sections.
 *
 * Single-pass classifier:
 *   - Tracks fenced code blocks (toggled by lines starting with ```);
 *     headers inside code fences are NOT parsed as sections.
 *   - For each non-fence line: tries header shapes in priority order
 *     (## Title → ### YYYY-MM-DD: Title → ### Title). First match wins.
 *   - Metadata bullets (- **Date**:, - **Source**:, - **Topics**:) attach
 *     to the most-recently-opened section. Bullets that appear before any
 *     header are discarded (no preamble stub is emitted).
 *   - Topics bullet is split on comma and trimmed; empty entries are
 *     dropped. Absent Topics bullet → section.topics is `undefined`
 *     (preserves "absent" vs. "empty" semantics).
 */
export declare function parseMemorySections(content: string): MemorySection[];
export declare class MemoryService {
    private storage;
    private searchProvider;
    constructor(storage: StorageAdapter, searchProvider: SearchProvider);
    search(request: MemorySearchRequest): Promise<MemorySearchResult>;
    create(entry: CreateMemoryRequest): Promise<MemoryEntry>;
    getTimeline(query: string, paths: WorkspacePaths, range?: DateRange): Promise<MemoryTimeline>;
    getIndex(paths: WorkspacePaths): Promise<MemoryIndex>;
}
/**
 * Read the given memory files and return entries whose `topics` intersects
 * any of the requested slugs. Recency-filtered (default 90 days) and
 * per-slug capped (default 5/slug).
 *
 * Per-slug cap: each requested slug is independently capped at `limit`.
 * An entry tagged with two requested slugs counts toward both caps but
 * is only emitted once (deduped by section identity within a file).
 *
 * The function is async so it composes with the rest of the codebase
 * (which uses `node:fs/promises`); callers in async contexts can `await`
 * it directly.
 */
export declare function getMemoryItemsForTopics(paths: string[], topicSlugs: string[], opts?: {
    limit?: number;
    sinceDays?: number;
}): Promise<MemoryEntry[]>;
//# sourceMappingURL=memory.d.ts.map