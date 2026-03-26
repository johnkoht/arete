/**
 * Meeting processing utilities for post-extraction filtering and metadata.
 *
 * Extracts the backend's post-processing logic into reusable core functions
 * so both CLI and backend can use identical processing.
 *
 * Includes:
 *   - Confidence filtering (exclude items below threshold)
 *   - User notes deduplication (Jaccard similarity matching)
 *   - Auto-approval logic (high confidence → approved, dedup → approved)
 *   - Metadata maps for staged items (status, confidence, source, owner)
 */
import type { MeetingExtractionResult, PriorItem } from './meeting-extraction.js';
/** Item source type: 'ai' (LLM extracted) or 'dedup' (matched user notes) */
export type ItemSource = 'ai' | 'dedup';
/** Item status: 'approved' (auto or dedup) or 'pending' (needs review) */
export type ItemStatus = 'approved' | 'pending';
/** Owner metadata for action items */
export interface ItemOwnerMeta {
    ownerSlug?: string;
    direction?: string;
    counterpartySlug?: string;
}
/** A filtered item with its generated ID */
export interface FilteredItem {
    id: string;
    text: string;
    type: 'action' | 'decision' | 'learning';
    confidence: number;
    /** Owner metadata (action items only) */
    ownerMeta?: ItemOwnerMeta;
}
/** Processing options (thresholds can be overridden for testing) */
export interface ProcessingOptions {
    /** Minimum confidence to include item (default: 0.5) */
    confidenceInclude?: number;
    /** Confidence above which items are auto-approved (default: 0.8) */
    confidenceApproved?: number;
    /** Jaccard similarity threshold for user notes dedup (default: 0.7) */
    dedupJaccard?: number;
    /**
     * Prior items from earlier meetings in a batch, used for deterministic deduplication.
     * When provided, items matching prior items (Jaccard > threshold) are marked source: 'dedup'.
     * Truncated to last 50 entries to bound processing time.
     * Note: Catch-up scenarios (100+ meetings) may have diminished dedup efficacy due to this cap.
     */
    priorItems?: PriorItem[];
}
/** Result of processing meeting extraction */
export interface ProcessedMeetingResult {
    /** Items that passed confidence filtering */
    filteredItems: FilteredItem[];
    /** Map of item ID → status ('approved' | 'pending') */
    stagedItemStatus: Record<string, ItemStatus>;
    /** Map of item ID → confidence score */
    stagedItemConfidence: Record<string, number>;
    /** Map of item ID → source ('ai' | 'dedup') */
    stagedItemSource: Record<string, ItemSource>;
    /** Map of item ID → owner metadata (action items only) */
    stagedItemOwner: Record<string, ItemOwnerMeta>;
}
/**
 * Extract user-written notes from meeting body.
 * Excludes: ## Transcript, ## Staged Action Items, ## Staged Decisions, ## Staged Learnings
 *
 * @param body - The meeting file body content (markdown)
 * @returns User notes with excluded sections removed
 */
export declare function extractUserNotes(body: string): string;
/**
 * Check if text contains negation markers that indicate a possible contradiction.
 * Items with negation markers should skip prior-item dedup to avoid suppressing
 * decisions/learnings that contradict earlier ones.
 *
 * @param text - The item text to check
 * @returns True if text contains any negation marker
 */
export declare function hasNegationMarkers(text: string): boolean;
/**
 * Process meeting extraction results with filtering, dedup, and metadata.
 *
 * This function:
 * 1. Filters items by confidence threshold (< 0.5 excluded by default)
 * 2. Checks for user notes matches (Jaccard > 0.7 → source: 'dedup')
 * 3. Determines status: dedup → approved, confidence > 0.8 → approved, else pending
 * 4. Builds metadata maps for staged items
 *
 * @param result - Output from extractMeetingIntelligence()
 * @param userNotes - User-written notes string (or pass empty string)
 * @param options - Optional threshold overrides
 * @returns Processed result with filtered items and metadata maps
 */
export declare function processMeetingExtraction(result: MeetingExtractionResult, userNotes: string, options?: ProcessingOptions): ProcessedMeetingResult;
/**
 * Remove approved sections from meeting content.
 * Removes: `## Approved Action Items`, `## Approved Decisions`, `## Approved Learnings`
 * and all content until the next `## ` header.
 *
 * @param content - The meeting file content (markdown)
 * @returns Content with approved sections removed
 */
export declare function clearApprovedSections(content: string): string;
/**
 * Format filtered items as markdown sections.
 * Uses pre-generated IDs from FilteredItem (e.g., ai_001, de_001, le_001).
 * Takes FilteredItem[] from processMeetingExtraction() and original summary.
 *
 * @param filteredItems - Items from processMeetingExtraction()
 * @param summary - The meeting summary text
 * @returns Markdown string with Summary and Staged sections
 */
export declare function formatFilteredStagedSections(filteredItems: FilteredItem[], summary: string): string;
//# sourceMappingURL=meeting-processing.d.ts.map