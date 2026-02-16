/**
 * Memory domain types.
 *
 * Imports from common.ts ONLY.
 */

import type { DateRange, MemoryItemType } from './common.js';

export type { MemoryItemType } from './common.js';

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
  type: MemoryItemType;
  date?: string;
  relevance: string;
  score?: number;
};

/** Request to search memory */
export type MemorySearchRequest = {
  query: string;
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
  source?: string;
  relatedEntities?: string[];
};

/** Timeline of memory entries */
export type MemoryTimeline = {
  entries: MemoryEntry[];
  startDate?: string;
  endDate?: string;
};

/** Index of memory entries by type */
export type MemoryIndex = {
  decisions: MemoryEntry[];
  learnings: MemoryEntry[];
  observations: MemoryEntry[];
  lastUpdated: string;
};
