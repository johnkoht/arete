/**
 * Common leaf types shared across multiple domains.
 *
 * RULE: This is a leaf module — it must NOT import from any other model file.
 */

/** Product primitive — the five building blocks of product knowledge */
export type ProductPrimitive = 'Problem' | 'User' | 'Solution' | 'Market' | 'Risk';

/** All valid product primitives */
export const PRODUCT_PRIMITIVES: readonly ProductPrimitive[] = [
  'Problem', 'User', 'Solution', 'Market', 'Risk',
] as const;

/** Work type classification for skills */
export type WorkType = 'discovery' | 'definition' | 'delivery' | 'analysis' | 'planning' | 'operations';

/** Skill category */
export type SkillCategory = 'essential' | 'default' | 'community';

/** Agent mode: builder = building Areté; guide = leading/empowering the user (end-product) */
export type AgentMode = 'builder' | 'guide';

/** Entity type for resolution */
export type EntityType = 'person' | 'meeting' | 'project' | 'any';

/** Memory item type */
export type MemoryItemType = 'decisions' | 'learnings' | 'observations';

/** Date range filter used by search operations */
export type DateRange = {
  start?: string;
  end?: string;
};
