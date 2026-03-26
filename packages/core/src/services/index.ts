/**
 * Services barrel export.
 */

export { ContextService } from './context.js';
export { MemoryService } from './memory.js';
export { EntityService } from './entity.js';
export { IntelligenceService } from './intelligence.js';
export { WorkspaceService } from './workspace.js';
export { SkillService } from './skills.js';
export { IntegrationService } from './integrations.js';
export { ToolService } from './tools.js';
export { extractPersonMemorySection } from './person-memory.js';
export { CommitmentsService, computeCommitmentPriority } from './commitments.js';
export type {
  PriorityLevel,
  CommitmentPriorityInput,
  CommitmentPriorityResult,
} from './commitments.js';
export { AIService, parseModelSpec } from './ai.js';
export type {
  AICallOptions,
  AICallResult,
  AIStructuredResult,
  AIServiceTestDeps,
  ModelSpec,
} from './ai.js';

// Meeting extraction
export {
  buildMeetingExtractionPrompt,
  parseMeetingExtractionResponse,
  extractMeetingIntelligence,
  formatStagedSections,
  updateMeetingContent,
  normalizeForJaccard,
  jaccardSimilarity,
} from './meeting-extraction.js';
export type {
  MeetingIntelligence,
  ActionItem,
  ActionItemDirection,
  MeetingExtractionResult,
  ValidationWarning,
  LLMCallFn as MeetingLLMCallFn,
  PriorItem,
} from './meeting-extraction.js';

// Meeting file parsing
export { parseActionItemsFromMeeting } from './meeting-parser.js';
export type { ParsedActionItem } from './meeting-parser.js';

// Meeting processing
export {
  processMeetingExtraction,
  extractUserNotes,
  clearApprovedSections,
  formatFilteredStagedSections,
} from './meeting-processing.js';
export type {
  ProcessedMeetingResult,
  ProcessingOptions,
  FilteredItem,
  ItemSource,
  ItemStatus,
  ItemOwnerMeta,
} from './meeting-processing.js';

// Pattern detection
export { detectCrossPersonPatterns } from './patterns.js';
export type { SignalPattern } from './patterns.js';

// Momentum analysis
export { computeCommitmentMomentum, computeRelationshipMomentum } from './momentum.js';
export type {
  CommitmentBucket,
  CommitmentMomentumItem,
  CommitmentMomentum,
  RelationshipBucket,
  RelationshipMomentumItem,
  RelationshipMomentum,
} from './momentum.js';

// Person health
export { computeRelationshipHealth } from './person-health.js';
export type { HealthIndicator, RelationshipHealth } from './person-health.js';

// Goal migration
export { GoalMigrationService, slugifyTitle, extractQuarter } from './goal-migration.js';
export type { ParsedGoal, GoalMigrationResult } from './goal-migration.js';

// Goal parsing
export {
  parseGoals,
  parseIndividualGoals,
  parseLegacyQuarterFile,
} from './goal-parser.js';

// Meeting context assembly
export { buildMeetingContext } from './meeting-context.js';
export type {
  ResolvedAttendee,
  UnknownAttendee,
  RelatedContext,
  MeetingContextBundle,
  BuildMeetingContextOptions,
  MeetingContextDeps,
  AgendaCandidate,
} from './meeting-context.js';
// Note: AgendaItem is exported from '../utils/agenda.js' — don't re-export here

// Meeting apply service
export { applyMeetingIntelligence, clearStagedSections } from './meeting-apply.js';
export type {
  ApplyMeetingOptions,
  ApplyMeetingResult,
  ApplyMeetingDeps,
} from './meeting-apply.js';

// Area parsing
export { AreaParserService } from './area-parser.js';
export type { AreaContext } from '../models/index.js';
