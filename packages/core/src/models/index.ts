/**
 * Model type definitions barrel export.
 *
 * Re-exports all domain types from a single entry point.
 */

// Common leaf types
export type {
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
  MemoryTimeline,
  MemoryIndex,
} from './memory.js';

// Context domain
export type {
  ContextFile,
  ContextGap,
  ContextBundle,
  ContextRequest,
  ContextInventory,
  ContextInjectionOptions,
} from './context.js';

// Workspace domain
export type {
  IDETarget,
  AreteConfig,
  WorkspacePaths,
  WorkspaceStatus,
  CreateWorkspaceOptions,
  InstallResult,
  UpdateResult,
  SourceType,
  SourcePaths,
} from './workspace.js';

// Skills domain
export type {
  SkillDefinition,
  SkillMetadata,
  SkillCandidate,
  RoutedSkill,
  InstallSkillOptions,
  InstallSkillResult,
} from './skills.js';

// Entities domain
export type {
  PersonCategory,
  Person,
  Meeting,
  Project,
  ResolvedEntity,
  EntityMention,
  EntityRelationship,
} from './entities.js';

// Intelligence domain
export type {
  BriefingRequest,
  Briefing,
  PrimitiveBriefing,
  SkillContext,
  Suggestion,
} from './intelligence.js';

// Integrations domain
export type {
  CalendarEvent,
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
