/**
 * IntelligenceService — assembles briefings and routes to skills.
 */

import type { ContextService } from './context.js';
import type { MemoryService } from './memory.js';
import type { EntityService } from './entity.js';
import type {
  BriefingRequest,
  Briefing,
  SkillContext,
  SkillDefinition,
  SkillCandidate,
  RoutedSkill,
} from '../models/index.js';

export class IntelligenceService {
  constructor(
    private context: ContextService,
    private memory: MemoryService,
    private entities: EntityService
  ) {}

  async assembleBriefing(request: BriefingRequest): Promise<Briefing> {
    throw new Error('Not implemented');
  }

  async prepareForSkill(
    skill: SkillDefinition,
    task: string
  ): Promise<SkillContext> {
    throw new Error('Not implemented');
  }

  routeToSkill(
    query: string,
    availableSkills: SkillCandidate[]
  ): RoutedSkill | null {
    throw new Error('Not implemented');
  }
}
