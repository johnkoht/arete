/**
 * EntityService — resolves entity references and relationships.
 */

import type { StorageAdapter } from '../storage/adapter.js';
import type {
  EntityType,
  ResolvedEntity,
  EntityMention,
  EntityRelationship,
} from '../models/index.js';

export class EntityService {
  constructor(private storage: StorageAdapter) {}

  resolve(
    reference: string,
    type: EntityType
  ): ResolvedEntity | null {
    throw new Error('Not implemented');
  }

  resolveAll(
    reference: string,
    type: EntityType,
    limit?: number
  ): ResolvedEntity[] {
    throw new Error('Not implemented');
  }

  async findMentions(entity: ResolvedEntity): Promise<EntityMention[]> {
    throw new Error('Not implemented');
  }

  async getRelationships(
    entity: ResolvedEntity
  ): Promise<EntityRelationship[]> {
    throw new Error('Not implemented');
  }
}
