/**
 * Intelligence domain types.
 *
 * This is the ONLY model file that imports across domains.
 * It imports from: common, context, memory, entities, skills.
 */

import type { ProductPrimitive, WorkType } from './common.js';
import type { ContextBundle } from './context.js';
import type { MemoryResult, MemorySearchResult } from './memory.js';
import type { ResolvedEntity, EntityRelationship } from './entities.js';
import type { SkillCandidate } from './skills.js';
import type { WorkspacePaths } from './workspace.js';

/** Request for assembling a briefing */
export type BriefingRequest = {
  task: string;
  paths: WorkspacePaths;
  skillName?: string;
  primitives?: ProductPrimitive[];
  workType?: WorkType;
  includeMemory?: boolean;
  includeEntities?: boolean;
  includeContext?: boolean;
};

/** Full primitive briefing (matches legacy assembleBriefing output) */
export type PrimitiveBriefing = {
  task: string;
  skill?: string;
  assembledAt: string;
  confidence: 'High' | 'Medium' | 'Low';
  context: ContextBundle;
  memory: MemorySearchResult;
  entities: ResolvedEntity[];
  relationships: EntityRelationship[];
  markdown: string;
};

/** Assembled briefing for a skill or task (simplified, used by prepareForSkill) */
export type Briefing = {
  task: string;
  context?: ContextBundle;
  memory?: MemoryResult[];
  entities?: ResolvedEntity[];
  assembledAt: string;
};

/** Skill context extends briefing with the matched skill */
export type SkillContext = Briefing & {
  skill: SkillCandidate;
};

/** Proactive suggestion from the intelligence layer */
export type Suggestion = {
  type: 'skill' | 'context' | 'memory' | 'entity';
  title: string;
  description: string;
  confidence: number;
  action?: string;
  metadata?: Record<string, unknown>;
};
