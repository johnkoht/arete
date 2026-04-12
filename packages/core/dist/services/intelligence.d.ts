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
import type { AIService } from './ai.js';
import type { EmailProvider } from '../integrations/gws/types.js';
import type { BriefingRequest, PrimitiveBriefing, SynthesizedBriefing, SkillDefinition, SkillContext, SkillCandidate, RoutedSkill, WorkspacePaths } from '../models/index.js';
export declare class IntelligenceService {
    private context;
    private memory;
    private entities;
    private emailProvider?;
    constructor(context: ContextService, memory: MemoryService, entities: EntityService, emailProvider?: (EmailProvider | null) | undefined);
    assembleBriefing(request: BriefingRequest): Promise<PrimitiveBriefing>;
    /**
     * Synthesize a briefing using AI.
     *
     * Takes an assembled primitive briefing and topic, sends the markdown
     * context to AIService for synthesis, and returns a structured result.
     * Truncates context to BRIEF_MAX_CONTEXT_CHARS before sending.
     *
     * @param briefing - The assembled primitive briefing
     * @param topic - The original query/topic for the briefing
     * @param aiService - The AIService instance for AI calls
     * @returns SynthesizedBriefing or null if AI call fails
     */
    synthesizeBriefing(briefing: PrimitiveBriefing, topic: string, aiService: AIService): Promise<SynthesizedBriefing | null>;
    /**
     * Search for recent email threads related to resolved entities.
     * Only runs if emailProvider is available; returns empty array otherwise.
     */
    private searchEntityEmails;
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