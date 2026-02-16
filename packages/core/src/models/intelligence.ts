/**
 * Intelligence domain types.
 *
 * This is the ONLY model file that imports across domains.
 * It imports from: common, context, memory, entities, skills.
 */

import type { ProductPrimitive, WorkType } from './common.js';
import type { ContextBundle } from './context.js';
import type { MemoryResult } from './memory.js';
import type { ResolvedEntity } from './entities.js';
import type { SkillCandidate } from './skills.js';

/** Request for assembling a briefing */
export type BriefingRequest = {
  task: string;
  skillName?: string;
  primitives?: ProductPrimitive[];
  workType?: WorkType;
  includeMemory?: boolean;
  includeEntities?: boolean;
  includeContext?: boolean;
};

/** Assembled briefing for a skill or task */
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
