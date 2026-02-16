/**
 * MemoryService — manages memory entries and search.
 */

import type { StorageAdapter } from '../storage/adapter.js';
import type { SearchProvider } from '../search/types.js';
import type {
  MemorySearchRequest,
  MemorySearchResult,
  CreateMemoryRequest,
  MemoryEntry,
  MemoryTimeline,
  MemoryIndex,
  DateRange,
} from '../models/index.js';

export class MemoryService {
  constructor(
    private storage: StorageAdapter,
    private searchProvider: SearchProvider
  ) {}

  async search(request: MemorySearchRequest): Promise<MemorySearchResult> {
    throw new Error('Not implemented');
  }

  async create(entry: CreateMemoryRequest): Promise<MemoryEntry> {
    throw new Error('Not implemented');
  }

  async getTimeline(
    query: string,
    range?: DateRange
  ): Promise<MemoryTimeline> {
    throw new Error('Not implemented');
  }

  async getIndex(): Promise<MemoryIndex> {
    throw new Error('Not implemented');
  }
}
