/**
 * Model type definitions barrel export.
 *
 * Re-exports all domain types from a single entry point.
 */
export type { ProductPrimitive, WorkType, SkillCategory, AgentMode, EntityType, MemoryItemType, DateRange, } from './common.js';
export { PRODUCT_PRIMITIVES } from './common.js';
export type { MemoryEntry, MemoryResult, MemorySearchRequest, MemorySearchResult, MemorySearchOptions, CreateMemoryRequest, TimelineItem, MemoryTimeline, MemoryIndex, } from './memory.js';
export type { ContextFile, ContextFileFreshness, ContextGap, ContextBundle, ContextRequest, ContextInventory, ContextInjectionOptions, } from './context.js';
export type { IDETarget, AITask, AITier, AIConfig, QmdScope, QmdCollections, AreteConfig, WorkspacePaths, WorkspaceStatus, CreateWorkspaceOptions, InstallResult, UpdateResult, UpdateWorkspaceOptions, SourceType, SourcePaths, } from './workspace.js';
export type { SkillIntegrationOutputType, SkillIntegrationOutput, SkillIntegration, SkillDefinition, SkillMetadata, SkillCandidate, RoutedSkill, InstallSkillOptions, InstallSkillResult, ToolDefinition, } from './skills.js';
export type { PersonCategory, PersonAffiliation, PersonRoleLens, TrackingIntent, Person, Meeting, Project, PeopleIntelligenceCandidate, PeopleIntelligenceEvidence, PeopleIntelligenceFeatureToggles, PeopleIntelligencePolicy, PeopleIntelligenceSuggestion, PeopleIntelligenceMetrics, PeopleIntelligenceDigest, PeopleIntelligenceSnapshot, ResolvedEntity, MentionSourceType, EntityMention, RelationshipType, EntityRelationship, CommitmentStatus, CommitmentDirection, Commitment, CommitmentsFile, } from './entities.js';
export type { BriefingRequest, Briefing, PrimitiveBriefing, SkillContext, Suggestion, } from './intelligence.js';
export type { StagedItemStatus, StagedItemEdits, StagedItem, StagedSections, FathomTranscript, IntegrationConfig, IntegrationAuth, IntegrationDefinition, IntegrationListEntry, ScriptableIntegration, ScriptResult, PullOptions, PullResult, IntegrationStatus, } from './integrations.js';
export type { TaskStatus, Task, PRD, } from './prd.js';
export { validateTask, validatePRD } from './prd.js';
//# sourceMappingURL=index.d.ts.map