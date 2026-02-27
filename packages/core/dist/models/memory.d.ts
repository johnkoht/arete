/**
 * Memory domain types.
 *
 * Imports from common.ts and workspace.ts.
 */
import type { DateRange, ExtendedMemoryItemType, MemoryItemType } from './common.js';
import type { WorkspacePaths } from './workspace.js';
export type { ExtendedMemoryItemType, MemoryItemType } from './common.js';
/** A single memory entry (stored document) */
export type MemoryEntry = {
    type: MemoryItemType;
    title: string;
    content: string;
    date: string;
    source: string;
    relatedEntities?: string[];
};
/** A single memory search result */
export type MemoryResult = {
    content: string;
    source: string;
    type: ExtendedMemoryItemType;
    date?: string;
    relevance: string;
    score?: number;
};
/** Request to search memory */
export type MemorySearchRequest = {
    query: string;
    paths: WorkspacePaths;
    types?: MemoryItemType[];
    limit?: number;
    dateRange?: DateRange;
};
/** Memory search results */
export type MemorySearchResult = {
    query: string;
    results: MemoryResult[];
    total: number;
};
/** Options for searchMemory */
export type MemorySearchOptions = {
    types?: MemoryItemType[];
    limit?: number;
};
/** Request to create a new memory entry */
export type CreateMemoryRequest = {
    type: MemoryItemType;
    title: string;
    content: string;
    paths: WorkspacePaths;
    source?: string;
    relatedEntities?: string[];
};
/** A timeline item with relevance score */
export type TimelineItem = {
    type: ExtendedMemoryItemType;
    title: string;
    content: string;
    date: string;
    source: string;
    relevanceScore: number;
};
/** Timeline of memory entries for a topic */
export type MemoryTimeline = {
    query: string;
    items: TimelineItem[];
    themes: string[];
    dateRange: DateRange;
};
/** Index of memory entries by type */
export type MemoryIndex = {
    decisions: MemoryEntry[];
    learnings: MemoryEntry[];
    observations: MemoryEntry[];
    lastUpdated: string;
};
//# sourceMappingURL=memory.d.ts.map