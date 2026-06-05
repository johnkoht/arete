/**
 * Services barrel export.
 */

export { ContextService } from './context.js';
export { MemoryService, getMemoryItemsForTopics } from './memory.js';
export { EntityService } from './entity.js';
export { IntelligenceService } from './intelligence.js';
// Phase 9 — typed-mode brief markdown formatters
export {
  formatPersonBriefMarkdown,
  formatProjectBriefMarkdown,
  formatAreaBriefMarkdown,
  formatMeetingBriefMarkdown,
} from './brief-formatters.js';
export { WorkspaceService } from './workspace.js';
export { SkillService } from './skills.js';
export {
  seedSkillsLocal,
  renderSkillsLocalTemplate,
  PHASE_2_CHEF_ORCHESTRATOR_SKILLS,
  PHASE_4_CHEF_ORCHESTRATOR_SKILLS,
  CHEF_ORCHESTRATOR_SKILLS,
} from './skills-local.js';
export type {
  SeedSkillsLocalResult,
  ChefOrchestratorSkillSlug,
} from './skills-local.js';
export {
  resolveSkillDirTwoTier,
  resolveSkillFileTwoTier,
} from './skill-resolver.js';
export type {
  ResolveSkillDirResult,
  TwoTierResolveResult,
} from './skill-resolver.js';
export {
  forkSkill,
  diffSkill,
  mergeSkill,
  summarizeUpstreamChanges,
  migratePreSplitAgentSkills,
} from './skill-fork.js';
export type {
  ForkSkillOptions,
  ForkSkillResult,
  DiffSkillResult,
  MergeSkillOptions,
  MergeSkillResult,
  HunkDecision,
  UpstreamChangedSkill,
  MigratePreSplitOptions,
  MigratePreSplitResult,
  MigrationCleanup,
} from './skill-fork.js';
export { IntegrationService } from './integrations.js';
// Workspace tool discovery — pure functions, no service class.
// (Skill discovery is the parallel concern; see services/skills.ts.)
export { listTools, getTool } from './tools.js';
export { extractPersonMemorySection } from './person-memory.js';
// Phase 7a AC5 — person channels convention helpers.
export {
  readPersonChannels,
  computeChannelsAudit,
  CHANNEL_FIELD_NAMES,
} from './entity.js';
export type {
  PersonChannels,
  ChannelsAuditEntry,
  ChannelsAuditResult,
} from './entity.js';
export {
  CommitmentsService,
  computeCommitmentPriority,
  computeCounterpartyOverlap,
  getCommitmentCounterpartySlugs,
  LockBootstrapError,
} from './commitments.js';
export { writeWithLock } from './meeting-lock.js';
export type {
  MeetingFrontmatterRead,
  MeetingMutationResult,
  MeetingMutator,
  WriteWithLockOptions,
  WriteWithLockResult,
} from './meeting-lock.js';
export { appendChefSkipLog } from './chef-skip-log.js';
export type { ChefSkipAction, ChefSkipPayload } from './chef-skip-log.js';
export type {
  PriorityLevel,
  CommitmentPriorityInput,
  CommitmentPriorityResult,
  CreateCommitmentOptions,
  CreateCommitmentResult,
  CreateTaskFn,
  CommitmentLike,
} from './commitments.js';

// Migrations (phase-10a-pre and onward)
export {
  applyAddCreatedAt,
  migrateAddCreatedAt,
  parseCommitmentsFile,
  serializeCommitmentsFile,
} from './migrations/add-created-at.js';
export type {
  AddCreatedAtReport,
  AddCreatedAtPerEntryResult,
} from './migrations/add-created-at.js';
export { AIService, parseModelSpec } from './ai.js';
export type {
  AICallOptions,
  AICallResult,
  AIStructuredResult,
  AIServiceTestDeps,
  ModelSpec,
} from './ai.js';

// Similarity utilities (shared Jaccard computation)
export { normalizeForJaccard, jaccardSimilarity } from '../utils/similarity.js';

// Meeting extraction
export {
  buildMeetingExtractionPrompt,
  buildLightExtractionPrompt,
  parseMeetingExtractionResponse,
  extractMeetingIntelligence,
  formatStagedSections,
  updateMeetingContent,
  LIGHT_LIMITS,
  THOROUGH_LIMITS,
  TOPIC_BIAS_BLOCK_PROMPT,
} from './meeting-extraction.js';
export type {
  MeetingIntelligence,
  ActionItem,
  ActionItemDirection,
  MeetingExtractionResult,
  ValidationWarning,
  LLMCallFn as MeetingLLMCallFn,
  PriorItem,
  ExtractionMode,
  CategoryLimits,
} from './meeting-extraction.js';

// Meeting file parsing
export { parseActionItemsFromMeeting } from './meeting-parser.js';
export type { ParsedActionItem } from './meeting-parser.js';

// Meeting processing
export {
  processMeetingExtraction,
  applyReconciliationDecision,
  extractUserNotes,
  clearApprovedSections,
  formatFilteredStagedSections,
  calculateSpeakingRatio,
  inferUrgency,
  buildSkippedItemFateEvents,
  buildDismissedItemFateEvents,
} from './meeting-processing.js';
export type {
  ProcessedMeetingResult,
  ProcessingOptions,
  FilteredItem,
  ItemSource,
  ItemStatus,
  ItemOwnerMeta,
  UrgencyBucket,
  MeetingItemFateInput,
} from './meeting-processing.js';

// Meeting reconciliation
export { reconcileMeetingBatch, loadReconciliationContext, loadRecentMeetingBatch, parseMemoryItems, batchLLMReview, parseApprovedSection } from './meeting-reconciliation.js';
export type { MeetingExtractionBatch } from './meeting-reconciliation.js';

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

// Topic detection (lexical pre-pass before extraction)
export { detectTopicsLexical, detectTopicsLexicalDetailed, STOP_TOKENS } from './topic-detection.js';
export type { DetectTopicsOptions, DetectedTopic } from './topic-detection.js';

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

// Meeting manifest generator
export { generateMeetingManifest } from './meeting-manifest.js';

// Area parsing
export { AreaParserService } from './area-parser.js';

// Area memory (L3 computed summaries)
export { AreaMemoryService, isAreaMemoryStale } from './area-memory.js';
export type {
  RefreshAreaMemoryOptions,
  RefreshAreaMemoryResult,
  CompactDecisionsOptions,
  CompactDecisionsResult,
} from './area-memory.js';
export type { AreaContext } from '../models/index.js';

// Hygiene (workspace entropy scanning and cleanup)
export { HygieneService } from './hygiene.js';

// Task management
export { TaskService, TaskNotFoundError, AmbiguousIdError, parseMetadata, parseTaskLine, formatTask, computeTaskId } from './tasks.js';
export type { CompleteTaskResult } from './tasks.js';
export type {
  TaskMetadata,
  TaskDestination,
  WorkspaceTask,
  ParsedTaskLine,
  ListTasksOptions,
} from '../models/tasks.js';

// Task scoring
export {
  scoreTask,
  scoreTasks,
  getTopTasks,
  scoreDueDate,
  scoreCommitment,
  scoreMeetingRelevance,
  scoreWeekPriority,
  calculateModifiers,
  formatScoredTask,
  formatTaskRecommendations,
} from './task-scoring.js';
export type {
  ScoringContext,
  ScoreBreakdown,
  ScoredTask,
} from './task-scoring.js';

// Slack-thread substantial heuristic (Phase 1 §a.3 / MC3)
export {
  evaluateSlackThread,
  formatSlackEvalLogLine,
  slackSummariesEnabled,
  DEFAULT_SLACK_MESSAGE_THRESHOLD,
  DEFAULT_SLACK_PARTICIPANT_THRESHOLD,
} from './slack-heuristic.js';
export type {
  SlackThreadEvalInput,
  SlackHeuristicTrigger,
  SlackHeuristicConfig,
  SlackHeuristicResult,
} from './slack-heuristic.js';

// Org entity auto-detection + refresh (Phase 1 §b)
export {
  detectOrgsFromMeetings,
  refreshOrgs,
  createOrgEntityManual,
  renderOrgAutoSection,
  slugifyDomain,
  DEFAULT_INTERNAL_DOMAINS,
  DEFAULT_DETECTION_WINDOW_DAYS,
  DEFAULT_DETECTION_MIN_MEETINGS,
} from './org-entity.js';
export type {
  DetectOrgsOptions,
  DetectedOrg,
  RefreshOrgsOptions,
  RefreshOrgsResult,
} from './org-entity.js';

// Summary writers (Phase 1 wiki expansion)
export {
  writeMeetingSummary,
  writeInboxSummary,
  readMeetingSummary,
  buildMeetingSummaryPrompt,
  buildInboxSummaryPrompt,
  parseMeetingSummaryResponse,
  parseInboxSummaryResponse,
  summaryAlreadyFresh,
  summaryPathForMeeting,
  summaryPathForInbox,
  hashSummarySource,
  resolveMeetingSourcePath,
  SUMMARY_EXTRACTION_VERSION,
} from './summary-writer.js';
export type {
  MeetingSummaryInput,
  InboxSummaryInput,
  WriteSummaryDeps,
  WriteSummaryResult,
} from './summary-writer.js';
