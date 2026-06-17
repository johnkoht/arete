/**
 * Services barrel export.
 */

export { ContextService } from './context.js';
export { MemoryService, getMemoryItemsForTopics, parseMemorySections } from './memory.js';
export { EntityService } from './entity.js';
export { IntelligenceService } from './intelligence.js';
// Phase 9 — typed-mode brief markdown formatters
export {
  formatPersonBriefMarkdown,
  formatProjectBriefMarkdown,
  formatAreaBriefMarkdown,
  formatMeetingBriefMarkdown,
} from './brief-formatters.js';
// Phase 9 follow-up — discussion-topics / next-focus extractors (qualitative
// person-file signal the typed brief does not surface) + agenda scaffold.
export {
  extractDiscussionTopics,
  extractNextFocus,
} from './brief-assemblers.js';
export type {
  DiscussionTopicGroup,
  NextFocusExtract,
} from './brief-assemblers.js';
// Phase 12 AC1/AC2 — project area resolution + backfill helpers
export { resolveProjectArea } from './brief-assemblers.js';
export type { ProjectAreaResolution } from './brief-assemblers.js';
export {
  listProjectsForBackfill,
  applyAreaToProjectReadme,
  resetBackfilledProjectAreas,
  parseProjectReadme,
} from './project-area.js';
export type { ProjectBackfillCandidate } from './project-area.js';
// project-exit (Increment A) — active-project marker + resume sidecar
export {
  activeProjectMarkerPath,
  resumeSidecarPath,
  readActiveProjectMarker,
  writeActiveProjectMarker,
  setActiveProjectMarkerDirty,
  clearActiveProjectMarker,
  readResumeSidecar,
  writeResumeSidecar,
  dirtyByMtime,
  statuslineSegment,
  handleSessionStart,
  GREETING_RECENCY_DAYS,
} from './project-session.js';
export type { ActiveProjectMarker, SessionStartResult } from './project-session.js';
export type { ProjectWhatsNew } from './brief-assemblers.js';
// WS-1 (plan-context-injection) — deterministic project-doc selection engine
export { selectProjectDocs } from './brief-assemblers.js';
export {
  listActiveProjects,
  PROJECT_DOC_BUDGET_DEFAULT,
} from './brief-assemblers.js';
export type { ActiveProject } from './brief-assemblers.js';
// WS-2/WS-3 (plan-context-injection) — plan-context aggregator
export {
  assemblePlanContext,
  resolveTodayAreas,
  extractOpenQuestions,
  PLAN_CONTEXT_PROJECT_DOC_BUDGET,
  PLAN_CONTEXT_MAX_PROJECTS,
  PLAN_CONTEXT_RECENT_DAYS,
} from './plan-context.js';
export type {
  PlanContextBundle,
  PlanContextMode,
  PlanContextProject,
  PlanContextTopic,
  PlanContextGoal,
  PlanContextWhatsNew,
  PlanContextSelectedDoc,
  AssemblePlanContextOptions,
} from './plan-context.js';
export type {
  ProjectDocSelection,
  SelectProjectDocsOptions,
  SelectedExpandedDoc,
  ListedDoc,
} from './brief-assemblers.js';
// Phase 14 AC2 — project topics-cache compute/diff/write (R1/R2 in tested code)
export {
  computeProjectTopicsRefresh,
  applyProjectTopics,
  sameSlugSet,
  PROJECT_TOPICS_CAP,
  PROJECT_TOPICS_SCORE_FLOOR,
  PROJECT_TOPICS_OWNERSHIP_COMMENT,
} from './project-topics.js';
export type {
  ProjectTopicsRefresh,
  ComputedProjectTopic,
  ApplyProjectTopicsResult,
} from './project-topics.js';
export { parseTopicsCache } from './brief-assemblers.js';
// Phase 13 AC2/AC3 — meeting area write surface (set-area + backfill)
export {
  listMeetingsForBackfill,
  qualifyMeetingAreaMatch,
  applyAreaToMeeting,
  resetBackfilledMeetingAreas,
} from './meeting-area.js';
export type {
  MeetingBackfillCandidate,
  MeetingAreaQualification,
  ApplyAreaResult,
} from './meeting-area.js';
// Phase 13 AC4 — archive-prefix-tolerant project lookup (claim validation reuse)
export { resolveArchivedProjectReadme } from './brief-assemblers.js';
export {
  assembleAgendaScaffold,
  renderScaffoldMarkdown,
  classifySection,
  splitOwed,
  inferTemplateType,
  deriveRecurringTemplateType,
} from './agenda-scaffold.js';
export type {
  AgendaScaffold,
  ScaffoldSection,
  ScaffoldCandidate,
  AttendeeScaffoldInput,
  TemplateInput,
  AssembleScaffoldOptions,
} from './agenda-scaffold.js';
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
export {
  parseChefSkipDirectives,
  resolveChefSkipDirective,
  formatDirectiveStatusMessage,
} from './chef-skip-directives.js';
export type {
  ChefSkipDirective,
  ChefSkipDirectiveKind,
  ResolvedDirective,
  ResolveOptions,
} from './chef-skip-directives.js';
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

// Phase 10a v2 — commitment hash + text normalization (Step 2)
export {
  normalizeCommitmentTextV2,
  computeCommitmentHashV2,
} from './commitments-hash-v2.js';

// Phase 10a v2 — counterparty parser (Step 3)
export {
  extractCounterpartiesFromText,
  buildPersonDirectory,
} from './commitments-counterparty-parser.js';
export type {
  PersonDirectory,
  AmbiguousName,
  ExtractCounterpartiesResult,
} from './commitments-counterparty-parser.js';

// Phase 10b-min — reactive cross-meeting dedup pipeline (Step 1)
export {
  findDedupCandidates,
  runLLMCrossCheck,
  applyDedupDecisions,
  runDedupPipeline,
  commitmentToDedupInput,
  buildCrossCheckPrompt,
  parseCrossCheckResponse,
  tokenizeForJaccard,
  jaccardSimilarity as dedupJaccardSimilarity,
  extractSlugMentions,
  buildPersonSlugSet,
  DEDUP_JACCARD_THRESHOLD,
  DEDUP_CANDIDATE_CAP,
} from './commitment-dedup-pipeline.js';
export type {
  ExtractedItemForDedup,
  ExistingCommitmentForDedup,
  DedupCandidate,
  FindCandidatesResult,
  ExactMatchDecision,
  LLMPairDecision,
  DedupOutcome,
  LLMCallConcurrentFn,
} from './commitment-dedup-pipeline.js';

// Phase 11 11a — Gmail Sent external-resolution detection pipeline (Step 2)
export {
  findResolutionEvidence,
  runResolutionCrossCheck,
  applyResolutionDecisions,
  runResolutionPipeline,
  commitmentToResolutionInput,
  peopleDirectoryFromMap,
  buildResolutionPrompt,
  parseResolutionResponse,
  isSuppressed,
  computeSuppressUntil,
  inTemporalWindow,
  extractArtifactNouns,
  checkArtifactMatch,
  tokenize as resolutionTokenize,
  jaccard as resolutionJaccard,
  PERMANENT_SUPPRESS_SENTINEL,
  UNRESOLVE_SUPPRESS_DAYS,
  TEMPORAL_WINDOW_FORWARD_DAYS,
  RESOLUTION_JACCARD_THRESHOLD,
  RESOLUTION_CANDIDATE_CAP,
  ARTIFACT_NOUNS,
} from './commitment-resolution-pipeline.js';
export type {
  PeopleDirectory,
  OpenCommitmentForResolution,
  ResolutionCandidate,
  FindEvidenceResult,
  ResolutionLLMDecision,
  ResolutionOutcome,
} from './commitment-resolution-pipeline.js';

// Phase 11 11a — resolution-decisions audit log (Step 5, F1/M2)
export {
  appendResolutionDecisionLog,
  renderResolutionDecisionLine,
  sanitizeReasoning as sanitizeResolutionReasoning,
  parseResolutionLog,
  hasPriorUnresolveForEvidence,
  RESOLUTION_LOG_PHASE,
} from './resolution-decisions-log.js';
export type {
  ResolutionDecisionAction,
  ResolutionDecisionLogPayload,
  ResolutionLogConfidence,
  ResolutionLogEntry,
} from './resolution-decisions-log.js';

// Phase 11 11a — resolution directive parser + mutators (Steps 3+4, F2/M4)
export {
  parseResolutionDirectives,
  stageResolve,
  autoResolve,
  applyConfirm,
  applyUnconfirm,
  applyUnresolve,
  evaluatePromotionGate,
  UNCONFIRM_WINDOW_HOURS,
  PROMOTION_WINDOW_DAYS,
} from './resolution-directives.js';
export type {
  ResolutionDirective,
  ResolutionDirectiveKind,
  RejectedBulkDirective,
  ParseDirectivesResult,
  MutatorResult,
  PromotionGateInput,
  PromotionGateResult,
} from './resolution-directives.js';

// Phase 11 11a — auto-resolve vs followup-2 ordering guard (Step 6, G1/AC8/M2)
export { decideResolutionOrdering } from './resolution-ordering.js';
export type { OrderingDecision } from './resolution-ordering.js';

// Phase 10b-min — extract-time dedup orchestration (Step 2)
export {
  runExtractDedup,
  filterSameDayOpenCommitments,
  decorateStagedSectionsWithDupeBadges,
  buildDupeSkipReasonEntries,
  buildDupeStatusEntries,
} from './commitment-dedup-extract.js';
export type {
  ExtractDedupDecision,
  ExtractDedupInputs,
  ExtractedItemForExtractDedup,
} from './commitment-dedup-extract.js';

// Phase 10b-min — reverse-stamp on canonical's meeting (Step 5)
export {
  buildReverseStampMarker,
  matchReverseStampMarker,
  insertReverseStampIntoBody,
  applyReverseStamp,
} from './commitment-dedup-reverse-stamp.js';
export type {
  ReverseStampRequest,
  ReverseStampResult,
} from './commitment-dedup-reverse-stamp.js';

// Phase 10b-min — dedup-decisions audit log writer (Step 6, AC9)
export {
  sanitizeReasoning,
  renderDedupDecisionLine,
  payloadFromExtractDecision,
  appendDedupDecisionLog,
  appendDedupDecisionLogBatch,
} from './dedup-decisions-log.js';
export type {
  DedupDecisionKind,
  DedupDecisionLogPayload,
  DedupLLMTier,
} from './dedup-decisions-log.js';

// Phase 10b-aux — `arete dedup --explain <id>` provenance (Step 1, AC7)
export {
  parseDedupLog,
  filterLogForCommitment,
  buildDupeSourceMapping,
  lookupCommitmentById,
  formatExplainReport,
} from './dedup-explain.js';
export type {
  DedupLogEntry,
  CommitmentLookupResult,
} from './dedup-explain.js';

// Phase 10b-aux — [[unmerge]] directive parser + resolver (Step 2, AC8)
export {
  parseUnmergeDirectives,
  resolveUnmerge,
} from './unmerge-directives.js';
export type {
  UnmergeDirective,
  UnmergeResolution,
} from './unmerge-directives.js';

// Phase 10b-aux — dedup decision surfacing in winddown (Step 3, AC8a/AC4a)
export {
  filterLogByDate,
  formatDedupedTodaySection,
  formatPossiblyMergeableSection,
  formatDedupWinddownSections,
} from './dedup-winddown-surface.js';

// Phase 10e — background dedup hygiene engine
export {
  runBackgroundDedup,
  applyCommitmentsDedup,
  collectDupeProvenance,
  formatBackgroundDedupDiff,
  BACKGROUND_DEDUP_MEMORY_JACCARD_FLOOR,
  BACKGROUND_DEDUP_TOPICS_JACCARD_FLOOR,
} from './background-dedup.js';
export type {
  BackgroundDedupScope,
  BackgroundDedupGroup,
  BackgroundDedupDuplicate,
  BackgroundDedupCandidatePair,
  BackgroundDedupSummary,
  BackgroundDedupResult,
  RunBackgroundDedupInputs,
  MemorySectionInput,
  TopicPageInput,
} from './background-dedup.js';

// Phase 10b-min wiring — CLI-facing glue that bridges meeting.ts and
// the pure pipeline modules above. See extract-dedup-wiring.ts for the
// flow (lock → load same-day → orchestrator → reverse-stamp → log).
export {
  wireExtractDedup,
  loadSameDayStagedItems,
  resolveMeetingSlugToPath,
  adaptFilteredItemsForDedup,
} from './extract-dedup-wiring.js';
export type {
  WireExtractDedupInputs,
  WireExtractDedupOptions,
  WireExtractDedupResult,
} from './extract-dedup-wiring.js';

// Phase 10a v2 — migration engine (Step 4)
export {
  migrateCommitmentsToV2,
  formatMigrationDiff,
} from './migrations/migrate-to-v2.js';
export type {
  Disambiguations,
  MigrationRowCategory,
  MigrationDiffRow,
  MigrationResult,
  MigrationInputs,
} from './migrations/migrate-to-v2.js';

// Phase 10a v2 — feature flag for v2 read path (Step 5)
export {
  isCommitmentsV2Active,
  isCommitmentsV2ActiveFromConfig,
} from './commitments-v2-flag.js';
export { AIService, parseModelSpec, TruncationError, isRetryableTransportError } from './ai.js';
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
  buildSinglePassExtractionPrompt,
  buildKnownItemsSection,
  parseMeetingExtractionResponse,
  extractMeetingIntelligence,
  formatStagedSections,
  updateMeetingContent,
  SINGLE_PASS_STAGED_HEADERS,
  LIGHT_LIMITS,
  THOROUGH_LIMITS,
  TOPIC_BIAS_BLOCK_PROMPT,
  ParseError,
  PARSE_ERROR_PREVIEW_CHARS,
} from './meeting-extraction.js';
export type {
  MeetingIntelligence,
  ActionItem,
  ActionItemDirection,
  ItemImportance,
  ItemJudgment,
  ExtractionTelemetryEvent,
  SinglePassContextSections,
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

// Meeting series resolution (single-pass W1.5)
export {
  resolveMeetingSeries,
  renderSeriesContext,
  normalizeTitleTokens,
  titleSimilarity,
  attendeeOverlap,
  matchesRecurringTitle,
  parseOpenQuestionsSection,
  SERIES_WINDOW_DAYS,
  SERIES_TITLE_JACCARD,
  SERIES_ATTENDEE_OVERLAP,
  SERIES_MAX_PRIOR,
} from './meeting-series.js';
export type { SeriesMeeting, SeriesResolution } from './meeting-series.js';

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

// Reconcile-engine R2 nomination primitive (CHR W2)
export {
  nominateCandidates,
  ledgerEntriesFromBatch,
  NOMINATION_JACCARD_THRESHOLD,
  UNCERTAIN_BAND_FLOOR,
} from './reconcile-nominate.js';
export type {
  ReconcileLedger,
  ReconcileLedgerEntry,
  NominationCandidate,
  NominationRef,
  NominationResult,
} from './reconcile-nominate.js';

// Reconcile-engine W7 shadow-soak infra (raw snapshots + shadow log)
export {
  writeRawExtractionSnapshot,
  writeFailureSnapshot,
  appendReconcileShadowLog,
  parseMeetingFilename,
  RAW_EXTRACTIONS_DIR,
  RECONCILE_SHADOW_LOG,
} from './reconcile-shadow.js';
export type { RawExtractionSnapshot, ShadowLogEntry, ExtractionFailureReason } from './reconcile-shadow.js';

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

// Area integrity (report-only scan backing `arete areas check`)
export { checkAreaIntegrity } from './area-integrity.js';
export type {
  AreaIntegrityReport,
  DanglingAreaRef,
  DuplicateAlias,
  ShadowingAlias,
  OrphanAreaArtifact,
} from './area-integrity.js';

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

// Summary writers (Phase 1 wiki expansion)
export {
  writeMeetingSummary,
  writeMeetingSummaryFromFrontmatter,
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
  MeetingSummaryFromFrontmatterInput,
  InboxSummaryInput,
  WriteSummaryDeps,
  WriteSummaryResult,
} from './summary-writer.js';
