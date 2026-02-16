/**
 * Entities domain types.
 *
 * Imports from common.ts ONLY.
 */

import type { EntityType } from './common.js';

/** People category for person classification */
export type PersonCategory = 'internal' | 'customers' | 'users';

/** Person record (from frontmatter or API) */
export type Person = {
  slug: string;
  name: string;
  email?: string | null;
  role?: string | null;
  company?: string | null;
  team?: string | null;
  category: PersonCategory;
};

/** Meeting record */
export type Meeting = {
  id: string;
  title: string;
  date: string;
  attendees: string[];
  notes?: string;
  transcriptPath?: string;
  projectSlug?: string;
};

/** Project record */
export type Project = {
  slug: string;
  name: string;
  description?: string;
  status?: 'active' | 'completed' | 'archived';
  created?: string;
  updated?: string;
};

/** A resolved entity */
export type ResolvedEntity = {
  type: 'person' | 'meeting' | 'project';
  path: string;
  name: string;
  slug?: string;
  metadata: Record<string, unknown>;
  score: number;
};

/** Source type classification for entity mentions */
export type MentionSourceType = 'context' | 'meeting' | 'memory' | 'project';

/** Mention of an entity in content */
export type EntityMention = {
  entity: string;
  entityType: EntityType;
  sourcePath: string;
  sourceType: MentionSourceType;
  excerpt: string;
  date?: string;
};

/** Relationship type — exactly three types */
export type RelationshipType = 'works_on' | 'attended' | 'mentioned_in';

/** Relationship between two entities */
export type EntityRelationship = {
  from: string;
  fromType: EntityType;
  to: string;
  toType: EntityType;
  type: RelationshipType;
  evidence?: string;
};
