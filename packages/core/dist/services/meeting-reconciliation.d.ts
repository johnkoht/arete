/**
 * Meeting reconciliation module.
 *
 * Pure functions for post-extraction reconciliation:
 * - Cross-meeting deduplication
 * - Completion matching against area tasks
 * - Recent memory matching
 * - Relevance scoring
 *
 * No storage/search access — all data passed in via ReconciliationContext.
 */
import type { ReconciliationContext, ReconciliationResult, ExtractedItemType } from '../models/entities.js';
import type { MeetingIntelligence, ActionItem } from './meeting-extraction.js';
import type { SearchProvider } from '../search/types.js';
import type { StorageAdapter } from '../storage/adapter.js';
/**
 * Input structure for a batch of meeting extractions.
 */
export type MeetingExtractionBatch = {
    meetingPath: string;
    extraction: MeetingIntelligence;
};
type FlattenedItem = {
    original: ActionItem | string;
    type: ExtractedItemType;
    meetingPath: string;
    text: string;
    owner?: string;
};
/**
 * A match between an extracted item and a recent memory item.
 */
export type MemoryMatch = {
    itemIndex: number;
    source: string;
    text: string;
};
/**
 * Duplicate group: canonical item + its duplicates.
 */
export type DuplicateGroup = {
    canonical: FlattenedItem;
    duplicates: FlattenedItem[];
};
/**
 * A match between an extracted item and prior workspace content.
 */
export type WorkspaceMatch = {
    itemIndex: number;
    matchedPath: string;
    similarity: number;
};
/** Similarity threshold for considering an item a workspace duplicate. */
declare const WORKSPACE_MATCH_THRESHOLD = 0.85;
/** Similarity threshold for matching items against completed tasks. */
declare const COMPLETED_MATCH_THRESHOLD = 0.6;
/** Similarity threshold for matching items against recent memory. */
declare const MEMORY_MATCH_THRESHOLD = 0.7;
/**
 * Match items against prior workspace content using semantic search.
 *
 * Uses the search provider's semanticSearch to find high-similarity matches
 * in prior meetings. When the search provider is unavailable (null), items
 * retain their current status (graceful skip per pre-mortem R4).
 *
 * @param items - Items to match
 * @param searchProvider - QMD search provider (null = graceful skip)
 * @returns Matches found in workspace
 */
export declare function matchPriorWorkspace(items: FlattenedItem[], searchProvider: SearchProvider | null): Promise<WorkspaceMatch[]>;
/**
 * A match between an extracted item and a completed task.
 */
export type CompletedMatch = {
    itemIndex: number;
    completedOn: string;
    matchedTask: string;
};
/**
 * Match items against completed tasks using Jaccard similarity.
 *
 * Items are matched if:
 * - Jaccard similarity > COMPLETED_MATCH_THRESHOLD (0.6)
 * - Owner check: if both item and task have owners, they must match
 *
 * Each item matches at most one completed task (first match wins).
 *
 * @param items - Flattened items from extractions
 * @param completedTasks - Completed tasks from reconciliation context
 * @returns Matches found
 */
export declare function matchCompletedTasks(items: FlattenedItem[], completedTasks: ReconciliationContext['completedTasks']): CompletedMatch[];
/**
 * Flatten all items from all meeting extractions into a single list.
 */
declare function flattenExtractions(extractions: MeetingExtractionBatch[]): FlattenedItem[];
/**
 * Find duplicates within a batch using Jaccard similarity.
 *
 * Items are compared pairwise. Only items of the same type are compared.
 * Different owners are never considered duplicates (even if text matches).
 * First occurrence is kept as canonical; later occurrences are duplicates.
 *
 * @param items - Flattened items from extractions
 * @param threshold - Jaccard threshold (default 0.7)
 * @returns Groups of duplicates (first occurrence is canonical)
 */
export declare function findDuplicates(items: FlattenedItem[], threshold?: number): DuplicateGroup[];
/**
 * Match items against recently committed memory items using Jaccard similarity.
 *
 * Items that are similar to recent memory are considered duplicates — they
 * have already been captured. Each item matches at most one memory item
 * (first match wins).
 *
 * @param items - Flattened items from extractions
 * @param recentMemory - Recently committed memory items from context
 * @returns Matches found
 */
export declare function matchRecentMemory(items: FlattenedItem[], recentMemory: ReconciliationContext['recentCommittedItems']): MemoryMatch[];
/**
 * Relevance score with weighted breakdown.
 */
export type RelevanceScore = {
    score: number;
    tier: 'high' | 'normal' | 'low';
    breakdown: {
        keywordMatch: number;
        personMatch: number;
        areaMatch: number;
    };
    matchedArea?: string;
    matchedPerson?: string;
};
export declare const RELEVANCE_WEIGHTS: {
    readonly keyword: 0.3;
    readonly person: 0.3;
    readonly area: 0.4;
};
/**
 * Score relevance of an item against area memories.
 *
 * Uses a weighted formula:
 * - keywordMatch (0.3): any area keyword found in item text
 * - personMatch (0.3): item owner is in area's activePeople
 * - areaMatch (0.4): meeting path contains area slug
 *
 * Returns the best score across all areas.
 *
 * Tiers: score >= 0.7 → 'high', >= 0.4 → 'normal', else 'low'
 */
declare function scoreRelevance(item: FlattenedItem, context: ReconciliationContext, options?: {
    debug?: boolean;
}): RelevanceScore;
/**
 * Generate a human-readable "why" annotation.
 * Uses ONE primary reason (highest contributing factor from breakdown).
 */
declare function generateWhy(tier: 'high' | 'normal' | 'low', breakdown: RelevanceScore['breakdown'], matchedArea?: string, matchedPerson?: string): string;
/**
 * Reconcile a batch of meeting extractions.
 *
 * Processing order:
 * 1. Flatten all items from all meetings
 * 2. Find duplicates within batch (Jaccard) — TODO P2-3
 * 3. Match against completed tasks — TODO P2-5
 * 4. Match against recent memory — TODO P2-6
 * 5. Score relevance
 * 6. Annotate each item
 *
 * @param extractions - Batch of meeting extractions
 * @param context - Reconciliation context with area memories, completed tasks, etc.
 * @returns Reconciled items with scores and annotations
 */
export declare function reconcileMeetingBatch(extractions: MeetingExtractionBatch[], context: ReconciliationContext): ReconciliationResult;
/**
 * Load reconciliation context from workspace.
 *
 * Reads area memory files to build the context needed for reconciliation
 * scoring and matching. For now, completedTasks and recentCommittedItems
 * return empty arrays — these will be populated when area task list and
 * .arete/memory/ integrations are implemented.
 *
 * @param storage - StorageAdapter for file access
 * @param workspaceRoot - Workspace root path
 * @returns ReconciliationContext for use with reconcileMeetingBatch
 */
export declare function loadReconciliationContext(storage: StorageAdapter, workspaceRoot: string): Promise<ReconciliationContext>;
/**
 * Extract MeetingIntelligence from meeting frontmatter staged items.
 */
declare function extractIntelligenceFromFrontmatter(frontmatter: Record<string, unknown>): MeetingIntelligence | null;
/**
 * Load recent processed meetings as extraction batches for reconciliation.
 *
 * Scans a meetings directory for `.md` files with a `YYYY-MM-DD` date prefix,
 * filters by recency and status (`processed` or `approved`), and extracts
 * staged intelligence items from frontmatter.
 *
 * @param storage - Storage adapter for file access
 * @param meetingsDir - Path to meetings directory (e.g., resources/meetings)
 * @param days - Lookback window in days (default: 7)
 * @returns Array of extraction batches from recent meetings
 */
export declare function loadRecentMeetingBatch(storage: StorageAdapter, meetingsDir: string, days?: number): Promise<MeetingExtractionBatch[]>;
export { flattenExtractions, scoreRelevance, generateWhy, extractIntelligenceFromFrontmatter, WORKSPACE_MATCH_THRESHOLD, COMPLETED_MATCH_THRESHOLD, MEMORY_MATCH_THRESHOLD };
//# sourceMappingURL=meeting-reconciliation.d.ts.map