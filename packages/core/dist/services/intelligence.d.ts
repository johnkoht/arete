/**
 * IntelligenceService — assembles briefings and routes to skills.
 *
 * Ported from src/core/briefing.ts and src/core/skill-router.ts.
 * Orchestrates ContextService, MemoryService, and EntityService.
 * No direct fs imports — uses injected services only.
 */
import type { ContextService } from './context.js';
import type { MemoryService } from './memory.js';
import type { EntityService } from './entity.js';
import type { BriefingRequest, PrimitiveBriefing, SkillDefinition, SkillContext, SkillCandidate, RoutedSkill, WorkspacePaths } from '../models/index.js';
export declare class IntelligenceService {
    private context;
    private memory;
    private entities;
    constructor(context: ContextService, memory: MemoryService, entities: EntityService);
    assembleBriefing(request: BriefingRequest): Promise<PrimitiveBriefing>;
    /**
     * Proactively search meeting transcripts for content matching the task.
     * Uses the memory timeline service to find meetings, then adds them as
     * context files if not already present.
     */
    private searchMeetingTranscripts;
    /**
     * Proactively search project docs beyond README.md (e.g. PRDs, specs, notes).
     */
    private searchProjectDocs;
    /**
     * Merge proactive context results into the main context bundle, deduplicating by path.
     */
    private mergeProactiveResults;
    routeToSkill(query: string, skills: SkillCandidate[]): RoutedSkill | null;
    prepareForSkill(skill: SkillDefinition, task: string, paths: WorkspacePaths): Promise<SkillContext>;
}
//# sourceMappingURL=intelligence.d.ts.map