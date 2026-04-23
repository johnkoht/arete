/**
 * Model type definitions barrel export.
 *
 * Re-exports all domain types from a single entry point.
 */

// Common leaf types
export type {
  ItemSource,
  ProductPrimitive,
  WorkType,
  SkillCategory,
  AgentMode,
  EntityType,
  MemoryItemType,
  DateRange,
} from './common.js';
export { PRODUCT_PRIMITIVES } from './common.js';

// Memory domain
export type {
  MemoryEntry,
  MemoryResult,
  MemorySearchRequest,
  MemorySearchResult,
  MemorySearchOptions,
  CreateMemoryRequest,
  TimelineItem,
  MemoryTimeline,
  MemoryIndex,
} from './memory.js';

// Context domain
export type {
  ContextFile,
  ContextFileFreshness,
  ContextGap,
  ContextBundle,
  ContextRequest,
  ContextInventory,
  ContextInjectionOptions,
} from './context.js';

// Workspace domain
export type {
  IDETarget,
  AITask,
  AITier,
  AIConfig,
  QmdScope,
  QmdCollections,
  AreteConfig,
  WorkspacePaths,
  WorkspaceStatus,
  CreateWorkspaceOptions,
  InstallResult,
  UpdateResult,
  UpdateWorkspaceOptions,
  SourceType,
  SourcePaths,
} from './workspace.js';

// Skills domain
export type {
  SkillIntegrationOutputType,
  SkillIntegrationOutput,
  SkillIntegration,
  SkillDefinition,
  SkillMetadata,
  SkillCandidate,
  RoutedSkill,
  InstallSkillOptions,
  InstallSkillResult,
  ToolDefinition,
} from './skills.js';

// Entities domain
export type {
  PersonCategory,
  PersonAffiliation,
  PersonRoleLens,
  TrackingIntent,
  Person,
  Meeting,
  Project,
  GoalStatus,
  GoalType,
  Goal,
  PeopleIntelligenceCandidate,
  PeopleIntelligenceEvidence,
  PeopleIntelligenceFeatureToggles,
  PeopleIntelligencePolicy,
  PeopleIntelligenceSuggestion,
  PeopleIntelligenceMetrics,
  PeopleIntelligenceDigest,
  PeopleIntelligenceSnapshot,
  ResolvedEntity,
  MentionSourceType,
  EntityMention,
  RelationshipType,
  EntityRelationship,
  CommitmentStatus,
  CommitmentDirection,
  Commitment,
  CommitmentsFile,
  // Areas domain
  RecurringMeeting,
  AreaFrontmatter,
  AreaMatch,
  AreaSections,
  AreaMemory,
  AreaContext,
  // Reconciliation domain
  ReconciliationActionItem,
  ExtractedItemType,
  ReconciledItem,
  ReconciliationResult,
  ReconciliationContext,
} from './entities.js';

// Intelligence domain
export type {
  BriefingRequest,
  Briefing,
  PrimitiveBriefing,
  SynthesizedBriefing,
  SkillContext,
  Suggestion,
} from './intelligence.js';

// Integrations domain
export type {
  StagedItemDirection,
  StagedItemStatus,
  StagedItemEdits,
  StagedItemOwnerMeta,
  StagedItemOwner,
  StagedItem,
  StagedSections,
  FathomTranscript,
  IntegrationConfig,
  IntegrationAuth,
  IntegrationDefinition,
  IntegrationListEntry,
  ScriptableIntegration,
  ScriptResult,
  PullOptions,
  PullResult,
  IntegrationStatus,
} from './integrations.js';

// PRD domain (includes runtime validators)
export type {
  TaskStatus,
  Task,
  PRD,
} from './prd.js';
export { validateTask, validatePRD } from './prd.js';

// Hygiene domain
export type {
  HygieneTier,
  HygieneCategory,
  HygieneActionType,
  HygieneItem,
  HygieneReport,
  ApprovedAction,
  HygieneResult,
  HygieneScanOptions,
} from './hygiene.js';

// Task management domain
export type {
  TaskMetadata,
  TaskDestination,
  WorkspaceTask,
  ParsedTaskLine,
  ListTasksOptions,
} from './tasks.js';
