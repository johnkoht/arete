/**
 * Model type definitions barrel export.
 *
 * Re-exports all domain types from a single entry point.
 */
export type { ItemSource, ProductPrimitive, WorkType, SkillCategory, AgentMode, EntityType, MemoryItemType, DateRange, } from './common.js';
export { PRODUCT_PRIMITIVES } from './common.js';
export type { MemoryEntry, MemoryResult, MemorySearchRequest, MemorySearchResult, MemorySearchOptions, CreateMemoryRequest, TimelineItem, MemoryTimeline, MemoryIndex, } from './memory.js';
export type { ContextFile, ContextFileFreshness, ContextGap, ContextBundle, ContextRequest, ContextInventory, ContextInjectionOptions, } from './context.js';
export type { IDETarget, AITask, AITier, AIConfig, QmdScope, QmdCollections, AreteConfig, WorkspacePaths, WorkspaceStatus, CreateWorkspaceOptions, InstallResult, UpdateResult, UpdateWorkspaceOptions, SourceType, SourcePaths, } from './workspace.js';
export type { SkillIntegrationOutputType, SkillIntegrationOutput, SkillIntegration, SkillDefinition, SkillMetadata, SkillCandidate, RoutedSkill, InstallSkillOptions, InstallSkillResult, ToolDefinition, } from './skills.js';
export type { PersonCategory, PersonAffiliation, PersonRoleLens, TrackingIntent, Person, Meeting, Project, GoalStatus, GoalType, Goal, PeopleIntelligenceCandidate, PeopleIntelligenceEvidence, PeopleIntelligenceFeatureToggles, PeopleIntelligencePolicy, PeopleIntelligenceSuggestion, PeopleIntelligenceMetrics, PeopleIntelligenceDigest, PeopleIntelligenceSnapshot, ResolvedEntity, MentionSourceType, EntityMention, RelationshipType, EntityRelationship, CommitmentStatus, CommitmentDirection, StakeholderRole, Stakeholder, ExternalSource, Commitment, CommitmentsFile, RecurringMeeting, AreaFrontmatter, AreaMatch, AreaSections, AreaMemory, AreaContext, ReconciliationActionItem, ExtractedItemType, ReconciledItem, ReconciliationResult, ReconciliationContext, } from './entities.js';
export { COMMITMENT_TEXT_VARIANTS_MAX } from './entities.js';
export type { BriefingRequest, Briefing, PrimitiveBriefing, SkillContext, Suggestion, BriefSection, BriefBase, PersonBrief, ProjectBrief, AreaBrief, MeetingBrief, AttendeeMiniBrief, TypedBrief, } from './intelligence.js';
export type { StagedItemDirection, StagedItemStatus, StagedItemElevated, StagedItemSkipReasonMeta, StagedItemSkipReason, StagedItemEdits, StagedItemOwnerMeta, StagedItemOwner, StagedItem, StagedSections, FathomTranscript, IntegrationConfig, IntegrationAuth, IntegrationDefinition, IntegrationListEntry, ScriptableIntegration, ScriptResult, PullOptions, PullResult, IntegrationStatus, } from './integrations.js';
export type { TaskStatus, Task, PRD, } from './prd.js';
export { validateTask, validatePRD } from './prd.js';
export type { HygieneTier, HygieneCategory, HygieneActionType, HygieneItem, HygieneReport, ApprovedAction, HygieneResult, HygieneScanOptions, } from './hygiene.js';
export type { TaskMetadata, TaskDestination, WorkspaceTask, ParsedTaskLine, ListTasksOptions, } from './tasks.js';
export type { SourceType as SummarySourceType, SourceSummaryFrontmatter, MeetingSectionName, InboxSectionName, MeetingSummarySections, InboxSummarySections, MeetingSummary, InboxSummary, SourceSummary, } from './source-summary.js';
export { MEETING_SECTION_NAMES, INBOX_SECTION_NAMES, renderSourceSummary, parseSourceSummary, } from './source-summary.js';
//# sourceMappingURL=index.d.ts.map