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
import type { CommitmentsService } from './commitments.js';
import type { TopicMemoryService } from './topic-memory.js';
import type { AreaMemoryService } from './area-memory.js';
import type { AreaParserService } from './area-parser.js';
import type { StorageAdapter } from '../storage/adapter.js';
import type { SearchProvider } from '../search/types.js';
import type { EmailProvider } from '../integrations/gws/types.js';
import type { BriefingRequest, PrimitiveBriefing, SkillDefinition, SkillContext, SkillCandidate, RoutedSkill, WorkspacePaths, PersonBrief, ProjectBrief, AreaBrief, MeetingBrief } from '../models/index.js';
import { type MeetingBriefOptions } from './brief-assemblers.js';
export declare class IntelligenceService {
    private context;
    private memory;
    private entities;
    private emailProvider?;
    private commitments?;
    private topicMemory?;
    private areaMemory?;
    private areaParser?;
    private storage?;
    private searchProvider?;
    constructor(context: ContextService, memory: MemoryService, entities: EntityService, emailProvider?: (EmailProvider | null) | undefined);
    /**
     * Inject the dependency surface required by Phase 9 typed-brief modes.
     * Called by the factory; tests that only exercise free-text briefing
     * can skip this entirely.
     *
     * Pure aggregator contract: no AIService is part of this set. The
     * brief CLI verb must not embed LLM calls.
     */
    setBriefDependencies(deps: {
        commitments: CommitmentsService;
        topicMemory: TopicMemoryService;
        areaMemory: AreaMemoryService;
        areaParser: AreaParserService;
        storage: StorageAdapter;
        searchProvider?: SearchProvider;
    }): void;
    private requireBriefDeps;
    /**
     * Assemble a structured brief for a person — AC1 + AC1a.
     * Pure aggregator; no LLM call.
     */
    assembleBriefForPerson(slug: string, paths: WorkspacePaths): Promise<PersonBrief>;
    /** Assemble a structured brief for a project — AC2. Pure aggregator. */
    assembleBriefForProject(slug: string, paths: WorkspacePaths): Promise<ProjectBrief>;
    /** Assemble a structured brief for an area — AC3. Pure aggregator. */
    assembleBriefForArea(slug: string, paths: WorkspacePaths): Promise<AreaBrief>;
    /**
     * Assemble a structured brief for a meeting — AC4, AC4a-d. Pure aggregator.
     * Supports `--project <slug>` override and a calendar events list passed by
     * the caller (the brief service does not fetch calendars itself).
     */
    assembleBriefForMeeting(input: string, paths: WorkspacePaths, opts?: MeetingBriefOptions): Promise<MeetingBrief>;
    assembleBriefing(request: BriefingRequest): Promise<PrimitiveBriefing>;
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