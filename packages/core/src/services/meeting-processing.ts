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

import { normalizeForJaccard, jaccardSimilarity } from './meeting-extraction.js';
import type { MeetingExtractionResult, ActionItem } from './meeting-extraction.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Default Thresholds
// ---------------------------------------------------------------------------

const DEFAULT_CONFIDENCE_INCLUDE = 0.5;
const DEFAULT_CONFIDENCE_APPROVED = 0.8;
const DEFAULT_DEDUP_JACCARD = 0.7;

// ---------------------------------------------------------------------------
// User Notes Extraction
// ---------------------------------------------------------------------------

/**
 * Extract user-written notes from meeting body.
 * Excludes: ## Transcript, ## Staged Action Items, ## Staged Decisions, ## Staged Learnings
 *
 * @param body - The meeting file body content (markdown)
 * @returns User notes with excluded sections removed
 */
export function extractUserNotes(body: string): string {
  const lines = body.split('\n');
  const output: string[] = [];
  let inExcludedSection = false;

  const excludedHeaders = new Set([
    'transcript',
    'staged action items',
    'staged decisions',
    'staged learnings',
  ]);

  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch) {
      const normalized = headerMatch[1].trim().toLowerCase();
      inExcludedSection = excludedHeaders.has(normalized);
      if (!inExcludedSection) {
        output.push(line);
      }
      continue;
    }

    if (!inExcludedSection) {
      output.push(line);
    }
  }

  return output.join('\n');
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a padded item ID.
 * @param prefix - 'ai_', 'de_', or 'le_'
 * @param index - 0-based index
 * @returns ID like 'ai_001', 'de_002', etc.
 */
function generateItemId(prefix: string, index: number): string {
  return `${prefix}${String(index + 1).padStart(3, '0')}`;
}

/**
 * Check if an item's text matches user notes.
 * @param itemText - The item text to check
 * @param userNotesTokens - Tokenized user notes (from normalizeForJaccard)
 * @param threshold - Jaccard similarity threshold
 * @returns True if similarity exceeds threshold
 */
function itemMatchesUserNotes(
  itemText: string,
  userNotesTokens: string[],
  threshold: number,
): boolean {
  const itemTokens = normalizeForJaccard(itemText);
  const similarity = jaccardSimilarity(itemTokens, userNotesTokens);
  return similarity > threshold;
}

// ---------------------------------------------------------------------------
// Main Processing Function
// ---------------------------------------------------------------------------

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
export function processMeetingExtraction(
  result: MeetingExtractionResult,
  userNotes: string,
  options?: ProcessingOptions,
): ProcessedMeetingResult {
  const { intelligence } = result;

  // Resolve thresholds
  const confidenceInclude = options?.confidenceInclude ?? DEFAULT_CONFIDENCE_INCLUDE;
  const confidenceApproved = options?.confidenceApproved ?? DEFAULT_CONFIDENCE_APPROVED;
  const dedupJaccard = options?.dedupJaccard ?? DEFAULT_DEDUP_JACCARD;

  // Tokenize user notes once for all comparisons
  const userNotesTokens = normalizeForJaccard(userNotes);

  // Result collections
  const filteredItems: FilteredItem[] = [];
  const stagedItemStatus: Record<string, ItemStatus> = {};
  const stagedItemConfidence: Record<string, number> = {};
  const stagedItemSource: Record<string, ItemSource> = {};
  const stagedItemOwner: Record<string, ItemOwnerMeta> = {};

  // Track indices per type for ID generation
  let aiIndex = 0;
  let deIndex = 0;
  let leIndex = 0;

  // Process action items
  for (const item of intelligence.actionItems) {
    const confidence = item.confidence ?? 0.9;
    if (confidence < confidenceInclude) continue;

    const id = generateItemId('ai_', aiIndex);
    aiIndex++;

    const text = item.description;
    const isDedup = itemMatchesUserNotes(text, userNotesTokens, dedupJaccard);
    const source: ItemSource = isDedup ? 'dedup' : 'ai';

    // Determine status
    let status: ItemStatus;
    if (source === 'dedup') {
      status = 'approved';
    } else {
      status = confidence > confidenceApproved ? 'approved' : 'pending';
    }

    // Build owner metadata (only include defined values)
    const ownerMeta: ItemOwnerMeta = {};
    if (item.ownerSlug) ownerMeta.ownerSlug = item.ownerSlug;
    if (item.direction) ownerMeta.direction = item.direction;
    if (item.counterpartySlug) ownerMeta.counterpartySlug = item.counterpartySlug;

    filteredItems.push({
      id,
      text,
      type: 'action',
      confidence,
      ownerMeta: Object.keys(ownerMeta).length > 0 ? ownerMeta : undefined,
    });

    stagedItemStatus[id] = status;
    stagedItemConfidence[id] = confidence;
    stagedItemSource[id] = source;
    if (Object.keys(ownerMeta).length > 0) {
      stagedItemOwner[id] = ownerMeta;
    }
  }

  // Process decisions
  for (const decision of intelligence.decisions) {
    // Decisions don't have confidence from core extraction, default to 0.9
    const confidence = 0.9;
    if (confidence < confidenceInclude) continue;

    const id = generateItemId('de_', deIndex);
    deIndex++;

    const text = decision;
    const isDedup = itemMatchesUserNotes(text, userNotesTokens, dedupJaccard);
    const source: ItemSource = isDedup ? 'dedup' : 'ai';

    let status: ItemStatus;
    if (source === 'dedup') {
      status = 'approved';
    } else {
      status = confidence > confidenceApproved ? 'approved' : 'pending';
    }

    filteredItems.push({
      id,
      text,
      type: 'decision',
      confidence,
    });

    stagedItemStatus[id] = status;
    stagedItemConfidence[id] = confidence;
    stagedItemSource[id] = source;
  }

  // Process learnings
  for (const learning of intelligence.learnings) {
    // Learnings don't have confidence from core extraction, default to 0.9
    const confidence = 0.9;
    if (confidence < confidenceInclude) continue;

    const id = generateItemId('le_', leIndex);
    leIndex++;

    const text = learning;
    const isDedup = itemMatchesUserNotes(text, userNotesTokens, dedupJaccard);
    const source: ItemSource = isDedup ? 'dedup' : 'ai';

    let status: ItemStatus;
    if (source === 'dedup') {
      status = 'approved';
    } else {
      status = confidence > confidenceApproved ? 'approved' : 'pending';
    }

    filteredItems.push({
      id,
      text,
      type: 'learning',
      confidence,
    });

    stagedItemStatus[id] = status;
    stagedItemConfidence[id] = confidence;
    stagedItemSource[id] = source;
  }

  return {
    filteredItems,
    stagedItemStatus,
    stagedItemConfidence,
    stagedItemSource,
    stagedItemOwner,
  };
}
