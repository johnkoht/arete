/**
 * Services barrel export.
 */
export { ContextService } from './context.js';
export { MemoryService, getMemoryItemsForTopics } from './memory.js';
export { EntityService } from './entity.js';
export { IntelligenceService } from './intelligence.js';
export { WorkspaceService } from './workspace.js';
export { SkillService } from './skills.js';
export { IntegrationService } from './integrations.js';
export { ToolService } from './tools.js';
export { extractPersonMemorySection } from './person-memory.js';
export { CommitmentsService, computeCommitmentPriority } from './commitments.js';
export { AIService, parseModelSpec } from './ai.js';
// Similarity utilities (shared Jaccard computation)
export { normalizeForJaccard, jaccardSimilarity } from '../utils/similarity.js';
// Meeting extraction
export { buildMeetingExtractionPrompt, buildLightExtractionPrompt, parseMeetingExtractionResponse, extractMeetingIntelligence, formatStagedSections, updateMeetingContent, LIGHT_LIMITS, THOROUGH_LIMITS, } from './meeting-extraction.js';
// Meeting file parsing
export { parseActionItemsFromMeeting } from './meeting-parser.js';
// Meeting processing
export { processMeetingExtraction, applyReconciliationDecision, extractUserNotes, clearApprovedSections, formatFilteredStagedSections, calculateSpeakingRatio, inferUrgency, } from './meeting-processing.js';
// Meeting reconciliation
export { reconcileMeetingBatch, loadReconciliationContext, loadRecentMeetingBatch, parseMemoryItems, batchLLMReview } from './meeting-reconciliation.js';
// Pattern detection
export { detectCrossPersonPatterns } from './patterns.js';
// Momentum analysis
export { computeCommitmentMomentum, computeRelationshipMomentum } from './momentum.js';
// Person health
export { computeRelationshipHealth } from './person-health.js';
// Goal migration
export { GoalMigrationService, slugifyTitle, extractQuarter } from './goal-migration.js';
// Goal parsing
export { parseGoals, parseIndividualGoals, parseLegacyQuarterFile, } from './goal-parser.js';
// Topic detection (lexical pre-pass before extraction)
export { detectTopicsLexical, detectTopicsLexicalDetailed, STOP_TOKENS } from './topic-detection.js';
// Meeting context assembly
export { buildMeetingContext } from './meeting-context.js';
// Note: AgendaItem is exported from '../utils/agenda.js' — don't re-export here
// Meeting apply service
export { applyMeetingIntelligence, clearStagedSections } from './meeting-apply.js';
// Meeting manifest generator
export { generateMeetingManifest } from './meeting-manifest.js';
// Area parsing
export { AreaParserService } from './area-parser.js';
// Area memory (L3 computed summaries)
export { AreaMemoryService, isAreaMemoryStale, buildSynthesisPrompt } from './area-memory.js';
// Hygiene (workspace entropy scanning and cleanup)
export { HygieneService } from './hygiene.js';
// Task management
export { TaskService, TaskNotFoundError, AmbiguousIdError, parseMetadata, parseTaskLine, formatTask, computeTaskId } from './tasks.js';
// Task scoring
export { scoreTask, scoreTasks, getTopTasks, scoreDueDate, scoreCommitment, scoreMeetingRelevance, scoreWeekPriority, calculateModifiers, formatScoredTask, formatTaskRecommendations, } from './task-scoring.js';
//# sourceMappingURL=index.js.map