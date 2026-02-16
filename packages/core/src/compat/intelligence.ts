/**
 * Compatibility shims for assembleBriefing and routeToSkill.
 * Delegates to IntelligenceService for backward compatibility.
 */

import { FileStorageAdapter } from '../storage/file.js';
import { getSearchProvider } from '../search/factory.js';
import { ContextService } from '../services/context.js';
import { MemoryService } from '../services/memory.js';
import { EntityService } from '../services/entity.js';
import { IntelligenceService } from '../services/intelligence.js';
import type {
  WorkspacePaths,
  PrimitiveBriefing,
  SkillCandidate,
  RoutedSkill,
} from '../models/index.js';

/** Options for assembleBriefing (legacy BriefingOptions) */
export type BriefingOptions = {
  primitives?: import('../models/index.js').ProductPrimitive[];
  workType?: import('../models/index.js').WorkType;
  skill?: string;
};

/**
 * Assemble a primitive briefing for a task.
 * Delegates to IntelligenceService.
 */
export async function assembleBriefing(
  task: string,
  paths: WorkspacePaths,
  options: BriefingOptions = {}
): Promise<PrimitiveBriefing> {
  const storage = new FileStorageAdapter();
  const searchProvider = getSearchProvider(paths.root);
  const contextService = new ContextService(storage, searchProvider);
  const memoryService = new MemoryService(storage, searchProvider);
  const entityService = new EntityService(storage);
  const intelligence = new IntelligenceService(contextService, memoryService, entityService);

  return intelligence.assembleBriefing({
    task,
    paths,
    skillName: options.skill,
    primitives: options.primitives,
    workType: options.workType,
  });
}

/**
 * Route a user message to the best-matching skill or tool.
 * Delegates to IntelligenceService.
 */
export function routeToSkill(
  query: string,
  skills: SkillCandidate[]
): RoutedSkill | null {
  const storage = new FileStorageAdapter();
  const searchProvider = getSearchProvider(process.cwd()); // routeToSkill doesn't use search
  const contextService = new ContextService(storage, searchProvider);
  const memoryService = new MemoryService(storage, searchProvider);
  const entityService = new EntityService(storage);
  const intelligence = new IntelligenceService(contextService, memoryService, entityService);

  return intelligence.routeToSkill(query, skills);
}
