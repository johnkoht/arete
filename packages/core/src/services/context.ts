/**
 * ContextService — assembles relevant context for queries and skills.
 */

import type { StorageAdapter } from '../storage/adapter.js';
import type { SearchProvider } from '../search/types.js';
import type {
  ContextRequest,
  ContextBundle,
  ContextInventory,
  SkillDefinition,
} from '../models/index.js';

export class ContextService {
  constructor(
    private storage: StorageAdapter,
    private searchProvider: SearchProvider
  ) {}

  async getRelevantContext(request: ContextRequest): Promise<ContextBundle> {
    throw new Error('Not implemented');
  }

  async getContextForSkill(
    skill: SkillDefinition,
    task: string
  ): Promise<ContextBundle> {
    throw new Error('Not implemented');
  }

  async getContextInventory(): Promise<ContextInventory> {
    throw new Error('Not implemented');
  }
}
