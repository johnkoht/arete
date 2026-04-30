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
import type { MeetingExtractionResult, ActionItem, PriorItem } from './meeting-extraction.js';
import type { Importance } from '../integrations/meetings.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Re-export canonical ItemSource from models/common.ts for backward compat.
// Canonical definition and documentation live in models/common.ts.
export type { ItemSource } from '../models/common.js';
import type { ItemSource } from '../models/common.js';
import type { ExtractedItemType } from '../models/entities.js';

/** Item status: 'approved' (auto or dedup), 'pending' (needs review), or 'skipped' (matched completed task) */
export type ItemStatus = 'approved' | 'pending' | 'skipped';

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
  /** Minimum confidence to include item (default: 0.65) */
  confidenceInclude?: number;
  /** Confidence above which items are auto-approved (default: 0.8) */
  confidenceApproved?: number;
  /** Jaccard similarity threshold for user notes dedup (default: 0.7). Items with similarity >= threshold are considered matches. */
  dedupJaccard?: number;
  /**
   * Prior items from earlier meetings in a batch, used for deterministic deduplication.
   * When provided, items matching prior items (Jaccard > threshold) are marked source: 'dedup'.
   * Truncated to last 50 entries to bound processing time.
   * Note: Catch-up scenarios (100+ meetings) may have diminished dedup efficacy due to this cap.
   */
  priorItems?: PriorItem[];
  /** Completed task texts to match against (from week.md/scratchpad.md) */
  completedItems?: string[];
  /**
   * Open task texts to match against (from week.md/tasks.md, with @tag(value) metadata stripped).
   * Items matching openTasks by Jaccard (>= reconcileJaccard AND both sides have >= MIN_MATCH_TOKENS
   * meaningful tokens) are marked source: 'existing-task', status: 'skipped'. This prevents
   * extraction from re-introducing action items the user is already tracking.
   *
   * Ordering: completedItems is checked first so a genuinely-done task wins over a still-open one.
   */
  openTasks?: string[];
  /**
   * Jaccard threshold for completed-item AND open-task reconciliation (default: 0.7).
   *
   * Unified at 0.7 (promoted from the prior 0.6) after observing stopword-dominated false
   * positives at 145-open-task scale. Combined with MIN_MATCH_TOKENS, this yields stricter
   * matching than the raw Jaccard score alone. Workspaces can opt down via this option.
   */
  reconcileJaccard?: number;
  /**
   * Meeting importance level for triage workflow.
   * - 'skip': Return empty result immediately (no extraction needed)
   * - 'light': Auto-approve all items (skip staging review)
   * - 'normal' | 'important': Standard processing (default behavior)
   */
  importance?: Importance;
}

/** Result of processing meeting extraction */
export interface ProcessedMeetingResult {
  /** Items that passed confidence filtering */
  filteredItems: FilteredItem[];
  /** Map of item ID → status ('approved' | 'pending' | 'skipped') */
  stagedItemStatus: Record<string, ItemStatus>;
  /** Map of item ID → confidence score */
  stagedItemConfidence: Record<string, number>;
  /** Map of item ID → source ('ai' | 'dedup' | 'reconciled') */
  stagedItemSource: Record<string, ItemSource>;
  /** Map of item ID → owner metadata (action items only) */
  stagedItemOwner: Record<string, ItemOwnerMeta>;
  /** Map of item ID → matched completed text (for reconciled items only) */
  stagedItemMatchedText?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Default Thresholds
// ---------------------------------------------------------------------------

const DEFAULT_CONFIDENCE_INCLUDE = 0.65;
const DEFAULT_CONFIDENCE_APPROVED = 0.8;
const DEFAULT_DEDUP_JACCARD = 0.7;
/**
 * Unified Jaccard threshold for both completed-task (source: 'reconciled') and
 * open-task (source: 'existing-task') matching. Promoted from the prior 0.6
 * after 145-open-task scale revealed stopword-dominated false positives.
 * Combined with MIN_MATCH_TOKENS it produces stricter matching than Jaccard alone.
 */
const DEFAULT_RECONCILE_JACCARD = 0.7;
/**
 * Minimum meaningful tokens on BOTH sides (after normalizeForJaccard) required
 * for a match to be considered valid. Guards against short-phrase false positives
 * where two 3-token strings coincidentally share stopwords.
 */
const MIN_MATCH_TOKENS = 4;

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
  return similarity >= threshold;
}

/**
 * Negation patterns that indicate an item may contradict a prior item.
 * Items with these markers skip prior-item dedup to avoid suppressing contradictions.
 * Uses word-boundary matching to avoid false positives on words like
 * "notification", "another", "note".
 */
const NEGATION_PATTERNS = [
  /\bnot\b/i,
  /\bwon't\b/i,
  /\bno longer\b/i,
  /\binstead of\b/i,
  /\bchanged from\b/i,
];

/**
 * Check if text contains negation markers that indicate a possible contradiction.
 * Items with negation markers should skip prior-item dedup to avoid suppressing
 * decisions/learnings that contradict earlier ones.
 *
 * @param text - The item text to check
 * @returns True if text contains any negation marker
 */
export function hasNegationMarkers(text: string): boolean {
  return NEGATION_PATTERNS.some((pattern) => pattern.test(text));
}

/** Pre-tokenized prior item for efficient Jaccard comparison */
interface TokenizedPriorItem {
  type: 'action' | 'decision' | 'learning';
  tokens: string[];
}

/**
 * Check if an item's text matches any prior item.
 * @param itemText - The item text to check
 * @param tokenizedPriorItems - Pre-tokenized prior items
 * @param threshold - Jaccard similarity threshold
 * @returns True if similarity with any prior item exceeds threshold
 */
function itemMatchesPriorItems(
  itemText: string,
  tokenizedPriorItems: TokenizedPriorItem[],
  threshold: number,
): boolean {
  if (tokenizedPriorItems.length === 0) return false;

  const itemTokens = normalizeForJaccard(itemText);
  for (const prior of tokenizedPriorItems) {
    const similarity = jaccardSimilarity(itemTokens, prior.tokens);
    if (similarity >= threshold) {
      return true;
    }
  }
  return false;
}

/** Pre-tokenized text candidate for efficient Jaccard comparison */
interface TokenizedCandidate {
  text: string;
  tokens: string[];
}

// Back-compat alias — existing call sites expect TokenizedCompletedItem.
type TokenizedCompletedItem = TokenizedCandidate;

/**
 * Find matching candidate text via Jaccard similarity with a min-token guard.
 *
 * Used for both completed-item (→ 'reconciled') and open-task (→ 'existing-task')
 * matching. A match requires BOTH:
 *   - Jaccard similarity >= threshold
 *   - Min MIN_MATCH_TOKENS meaningful tokens on BOTH sides (guards against
 *     3-token coincidences dominated by stopwords).
 *
 * @param itemText - The item text to check
 * @param candidates - Pre-tokenized candidates to match against
 * @param threshold - Jaccard similarity threshold
 * @returns Matched text (truncated to 60 chars) or undefined if no match
 */
function findMatchingCandidate(
  itemText: string,
  candidates: TokenizedCandidate[],
  threshold: number,
): string | undefined {
  if (candidates.length === 0) return undefined;

  const itemTokens = normalizeForJaccard(itemText);
  // Short-circuit on item side: if the extracted item has too few meaningful
  // tokens, it's too short to safely match anything via Jaccard.
  if (itemTokens.length < MIN_MATCH_TOKENS) return undefined;

  for (const candidate of candidates) {
    // Same guard on candidate side.
    if (candidate.tokens.length < MIN_MATCH_TOKENS) continue;
    const similarity = jaccardSimilarity(itemTokens, candidate.tokens);
    if (similarity >= threshold) {
      return candidate.text.length > 60
        ? candidate.text.slice(0, 57) + '...'
        : candidate.text;
    }
  }
  return undefined;
}

/** @deprecated use findMatchingCandidate — retained for back-compat only. */
function findMatchingCompletedItem(
  itemText: string,
  tokenizedCompletedItems: TokenizedCompletedItem[],
  threshold: number,
): string | undefined {
  return findMatchingCandidate(itemText, tokenizedCompletedItems, threshold);
}

// ---------------------------------------------------------------------------
// Main Processing Function
// ---------------------------------------------------------------------------

/**
 * Process meeting extraction results with filtering, dedup, and metadata.
 *
 * This function:
 * 1. Filters items by confidence threshold (< 0.65 excluded by default)
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
  const importance = options?.importance;

  // Handle importance === 'skip': return empty result immediately (no extraction needed)
  if (importance === 'skip') {
    return {
      filteredItems: [],
      stagedItemStatus: {},
      stagedItemConfidence: {},
      stagedItemSource: {},
      stagedItemOwner: {},
    };
  }

  // For importance === 'light': auto-approve all items (set flag for later use)
  const autoApproveAll = importance === 'light';

  // Resolve thresholds
  const confidenceInclude = options?.confidenceInclude ?? DEFAULT_CONFIDENCE_INCLUDE;
  const confidenceApproved = options?.confidenceApproved ?? DEFAULT_CONFIDENCE_APPROVED;
  const dedupJaccard = options?.dedupJaccard ?? DEFAULT_DEDUP_JACCARD;
  const reconcileJaccard = options?.reconcileJaccard ?? DEFAULT_RECONCILE_JACCARD;

  // Tokenize user notes once for all comparisons
  const userNotesTokens = normalizeForJaccard(userNotes);

  // Truncate and pre-tokenize prior items (cap at 50 most recent to bound processing time)
  // Note: Catch-up scenarios (100+ meetings) may have diminished dedup efficacy due to this cap.
  const cappedPriorItems = options?.priorItems?.slice(-50) ?? [];
  const tokenizedPriorItems: TokenizedPriorItem[] = cappedPriorItems.map((item) => ({
    type: item.type,
    tokens: normalizeForJaccard(item.text),
  }));

  // Pre-tokenize completed items for reconciliation (no cap needed — week.md is small)
  const completedItems = options?.completedItems ?? [];
  const tokenizedCompletedItems: TokenizedCandidate[] = completedItems.map((text) => ({
    text,
    tokens: normalizeForJaccard(text),
  }));

  // Pre-tokenize OPEN tasks for existing-task dedup (no cap — local match is cheap;
  // at 145 open tasks × ~20 extracted items the loop is trivial).
  const openTasks = options?.openTasks ?? [];
  const tokenizedOpenTasks: TokenizedCandidate[] = openTasks.map((text) => ({
    text,
    tokens: normalizeForJaccard(text),
  }));

  // Result collections
  const filteredItems: FilteredItem[] = [];
  const stagedItemStatus: Record<string, ItemStatus> = {};
  const stagedItemConfidence: Record<string, number> = {};
  const stagedItemSource: Record<string, ItemSource> = {};
  const stagedItemOwner: Record<string, ItemOwnerMeta> = {};
  const stagedItemMatchedText: Record<string, string> = {};

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

    // 1. Check reconciliation first (action items only): match against completed tasks
    // No negation marker bypass — these are completed items, not cross-meeting dedup
    const matchedCompletedText = findMatchingCandidate(
      text,
      tokenizedCompletedItems,
      reconcileJaccard,
    );
    if (matchedCompletedText !== undefined) {
      // Item matches a completed task → skip it
      filteredItems.push({
        id,
        text,
        type: 'action',
        confidence,
        ownerMeta: undefined, // Skip owner metadata for reconciled items
      });
      stagedItemStatus[id] = 'skipped';
      stagedItemConfidence[id] = confidence;
      stagedItemSource[id] = 'reconciled';
      stagedItemMatchedText[id] = matchedCompletedText;
      continue;
    }

    // 1b. Open-task dedup: match against unchecked tasks already in week.md/tasks.md.
    // Ordering matters — completed (above) wins over open so a genuinely-done match
    // is attributed correctly even if the same task is still listed as open somewhere.
    const matchedOpenTaskText = findMatchingCandidate(
      text,
      tokenizedOpenTasks,
      reconcileJaccard,
    );
    if (matchedOpenTaskText !== undefined) {
      filteredItems.push({
        id,
        text,
        type: 'action',
        confidence,
        ownerMeta: undefined,
      });
      stagedItemStatus[id] = 'skipped';
      stagedItemConfidence[id] = confidence;
      stagedItemSource[id] = 'existing-task';
      stagedItemMatchedText[id] = matchedOpenTaskText;
      continue;
    }

    // 2. Check for dedup: userNotes OR priorItems match → source: 'dedup'
    // Skip priorItems check if item contains negation markers (to avoid suppressing contradictions)
    const matchesUserNotes = itemMatchesUserNotes(text, userNotesTokens, dedupJaccard);
    const matchesPriorItems =
      !hasNegationMarkers(text) && itemMatchesPriorItems(text, tokenizedPriorItems, dedupJaccard);
    const isDedup = matchesUserNotes || matchesPriorItems;
    const source: ItemSource = isDedup ? 'dedup' : 'ai';

    // Determine status (auto-approve all for light meetings)
    let status: ItemStatus;
    if (autoApproveAll || source === 'dedup') {
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
  for (let i = 0; i < intelligence.decisions.length; i++) {
    const decision = intelligence.decisions[i];
    // Use real confidence from extraction if available, fallback to 0.9
    const confidence = intelligence.decisionConfidences?.[i] ?? 0.9;
    if (confidence < confidenceInclude) continue;

    const id = generateItemId('de_', deIndex);
    deIndex++;

    const text = decision;
    // Check for dedup: userNotes OR priorItems match → source: 'dedup'
    // Skip priorItems check if item contains negation markers (to avoid suppressing contradictions)
    const matchesUserNotes = itemMatchesUserNotes(text, userNotesTokens, dedupJaccard);
    const matchesPriorItems =
      !hasNegationMarkers(text) && itemMatchesPriorItems(text, tokenizedPriorItems, dedupJaccard);
    const isDedup = matchesUserNotes || matchesPriorItems;
    const source: ItemSource = isDedup ? 'dedup' : 'ai';

    // Determine status (auto-approve all for light meetings)
    let status: ItemStatus;
    if (autoApproveAll || source === 'dedup') {
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
  for (let i = 0; i < intelligence.learnings.length; i++) {
    const learning = intelligence.learnings[i];
    // Use real confidence from extraction if available, fallback to 0.9
    const confidence = intelligence.learningConfidences?.[i] ?? 0.9;
    if (confidence < confidenceInclude) continue;

    const id = generateItemId('le_', leIndex);
    leIndex++;

    const text = learning;
    // Check for dedup: userNotes OR priorItems match → source: 'dedup'
    // Skip priorItems check if item contains negation markers (to avoid suppressing contradictions)
    const matchesUserNotes = itemMatchesUserNotes(text, userNotesTokens, dedupJaccard);
    const matchesPriorItems =
      !hasNegationMarkers(text) && itemMatchesPriorItems(text, tokenizedPriorItems, dedupJaccard);
    const isDedup = matchesUserNotes || matchesPriorItems;
    const source: ItemSource = isDedup ? 'dedup' : 'ai';

    // Determine status (auto-approve all for light meetings)
    let status: ItemStatus;
    if (autoApproveAll || source === 'dedup') {
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
    // Only include stagedItemMatchedText if there are reconciled items
    ...(Object.keys(stagedItemMatchedText).length > 0 && { stagedItemMatchedText }),
  };
}

// ---------------------------------------------------------------------------
// Content Manipulation Helpers
// ---------------------------------------------------------------------------

/**
 * Apply a "this item is a duplicate / already done" decision from
 * cross-meeting reconciliation onto a `ProcessedMeetingResult` in place.
 *
 * Type-dependent disposition:
 * - **action** → flip to `status: 'skipped'`, `source: 'reconciled'` and
 *   keep the item visible in staging. "Already done" is coherent vocabulary
 *   for a commitment, and the user may want to know it was discussed but
 *   already tracked elsewhere.
 * - **decision / learning** → silent merge. Drop the item from
 *   `filteredItems` and every per-item metadata map. The matching content
 *   is already in committed memory; surfacing it as "skipped" forces the
 *   user to dismiss something with no value. `silentlyMerged.{decisions,learnings}`
 *   is incremented so callers can surface a count.
 *
 * Pure mutation of the inputs; returns void. Both `processed` and
 * `silentlyMerged` must already exist (never null/undefined). The
 * `matchingItem` is the entry from `processed.filteredItems` whose text
 * matched the reconciliation result.
 *
 * Extracted from CLI extract + backend `runProcessingSession` to keep
 * the two call sites in lockstep — silent drift here is the same failure
 * mode that bit `ONBOARD_DEFAULT_AI_CONFIG`.
 */
export function applyReconciliationDecision(
  processed: ProcessedMeetingResult,
  matchingItem: { id: string; type: ExtractedItemType },
  silentlyMerged: { decisions: number; learnings: number },
): void {
  if (matchingItem.type === 'action') {
    processed.stagedItemStatus[matchingItem.id] = 'skipped';
    processed.stagedItemSource[matchingItem.id] = 'reconciled';
    return;
  }

  // decision / learning → silent merge
  processed.filteredItems = processed.filteredItems.filter(
    (fi) => fi.id !== matchingItem.id,
  );
  delete processed.stagedItemStatus[matchingItem.id];
  delete processed.stagedItemSource[matchingItem.id];
  delete processed.stagedItemConfidence[matchingItem.id];
  if (processed.stagedItemMatchedText) {
    delete processed.stagedItemMatchedText[matchingItem.id];
  }
  if (processed.stagedItemOwner) {
    delete processed.stagedItemOwner[matchingItem.id];
  }
  if (matchingItem.type === 'decision') silentlyMerged.decisions += 1;
  else if (matchingItem.type === 'learning') silentlyMerged.learnings += 1;
}

/**
 * Remove approved sections from meeting content.
 * Removes: `## Approved Action Items`, `## Approved Decisions`, `## Approved Learnings`
 * and all content until the next `## ` header.
 *
 * @param content - The meeting file content (markdown)
 * @returns Content with approved sections removed
 */
export function clearApprovedSections(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let skipping = false;

  for (const line of lines) {
    // Check for approved section headers
    if (line.match(/^## Approved (Action Items|Decisions|Learnings)\s*$/)) {
      skipping = true;
      continue;
    }
    // Stop skipping at next header
    if (skipping && line.startsWith('## ')) {
      skipping = false;
    }
    if (!skipping) {
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Format filtered items as markdown sections.
 * Uses pre-generated IDs from FilteredItem (e.g., ai_001, de_001, le_001).
 * Takes FilteredItem[] from processMeetingExtraction() and original summary.
 *
 * Lead-prose section: emits `## Core` when `core` is provided non-empty,
 * otherwise falls back to `## Summary` for backward compat. Optional
 * `couldInclude` renders as a `## Could include` bullet list when non-empty.
 * (Task 8 / Decision #7 — historical files keep ## Summary; new wiki-aware
 * meetings get ## Core.)
 *
 * @param filteredItems - Items from processMeetingExtraction()
 * @param summary - The meeting summary text (used as fallback when `core` absent)
 * @param core - Optional lead-prose from wiki-aware extraction
 * @param couldInclude - Optional headlines for side-thread items
 * @returns Markdown string with lead + Could-include + Staged sections
 */
export function formatFilteredStagedSections(
  filteredItems: FilteredItem[],
  summary: string,
  core?: string,
  couldInclude?: string[],
): string {
  const lines: string[] = [];

  // Lead-prose section: Core takes precedence over Summary when present.
  const trimmedCore = core?.trim();
  if (trimmedCore) {
    lines.push('## Core');
    lines.push(trimmedCore);
    lines.push('');
  } else {
    lines.push('## Summary');
    lines.push(summary);
    lines.push('');
  }

  // Could include (only if non-empty list provided)
  if (couldInclude && couldInclude.length > 0) {
    lines.push('## Could include');
    for (const headline of couldInclude) {
      lines.push(`- ${headline}`);
    }
    lines.push('');
  }

  // Staged Action Items
  const actionItems = filteredItems.filter((i) => i.type === 'action');
  if (actionItems.length > 0) {
    lines.push('## Staged Action Items');
    for (const item of actionItems) {
      lines.push(`- ${item.id}: ${item.text}`);
    }
    lines.push('');
  }

  // Staged Decisions
  const decisions = filteredItems.filter((i) => i.type === 'decision');
  if (decisions.length > 0) {
    lines.push('## Staged Decisions');
    for (const item of decisions) {
      lines.push(`- ${item.id}: ${item.text}`);
    }
    lines.push('');
  }

  // Staged Learnings
  const learnings = filteredItems.filter((i) => i.type === 'learning');
  if (learnings.length > 0) {
    lines.push('## Staged Learnings');
    for (const item of learnings) {
      lines.push(`- ${item.id}: ${item.text}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Speaking Ratio Analysis
// ---------------------------------------------------------------------------

/**
 * Pattern to match speaker labels in Fathom/Krisp transcripts.
 * Matches: **John Koht | 01:18** or **John Koht | 1:23:45**
 * Captures: speaker name (group 1)
 */
const SPEAKER_LABEL_PATTERN = /\*\*([^|]+?)\s*\|\s*\d+:\d+(?::\d+)?\*\*/g;

/**
 * Pattern to detect anonymous speakers like "Speaker 1", "Speaker 4", etc.
 * These contribute to total word count but should never match an owner.
 */
const ANONYMOUS_SPEAKER_PATTERN = /^Speaker\s+\d+$/i;

/**
 * Count words in a text string.
 * Splits on whitespace and counts non-empty segments.
 *
 * @param text - Text to count words in
 * @returns Number of words
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

/**
 * Check if owner name matches a speaker name.
 * - Case-insensitive
 * - Partial match: "John" matches "John Koht", "John Smith", etc.
 * - Never matches anonymous speakers like "Speaker 4"
 *
 * @param speakerName - Name from transcript speaker label
 * @param ownerName - Name to match against (typically first name)
 * @returns True if owner matches this speaker
 */
function speakerMatchesOwner(speakerName: string, ownerName: string): boolean {
  // Never match anonymous speakers
  if (ANONYMOUS_SPEAKER_PATTERN.test(speakerName.trim())) {
    return false;
  }

  const normalizedSpeaker = speakerName.trim().toLowerCase();
  const normalizedOwner = ownerName.trim().toLowerCase();

  // Exact match or partial match (owner name appears in speaker name)
  return (
    normalizedSpeaker === normalizedOwner ||
    normalizedSpeaker.includes(normalizedOwner) ||
    normalizedOwner.includes(normalizedSpeaker)
  );
}

/**
 * Calculate the speaking ratio for a meeting owner based on transcript speaker labels.
 *
 * Parses Fathom/Krisp-style speaker labels (`**Name | MM:SS**` or `**Name | HH:MM:SS**`)
 * and counts words spoken by each speaker. Returns the ratio of the owner's words
 * to total words.
 *
 * @param transcript - Meeting transcript text containing speaker labels
 * @param ownerName - Name of the meeting owner (case-insensitive, partial matches allowed)
 * @returns Ratio of owner's words to total words (0-1), or undefined if no speaker labels found
 *
 * @example
 * ```ts
 * const transcript = `
 * **John Koht | 01:18**
 * Hello, how are you?
 *
 * **Dave | 02:30**
 * I'm good, thanks for asking.
 * `;
 *
 * calculateSpeakingRatio(transcript, 'John'); // → ~0.4 (4 words out of 10)
 * calculateSpeakingRatio(transcript, 'Sarah'); // → 0 (not found)
 * calculateSpeakingRatio('No labels here', 'John'); // → undefined
 * ```
 */
export function calculateSpeakingRatio(
  transcript: string,
  ownerName: string,
): number | undefined {
  // Handle empty/null inputs gracefully (Pre-Mortem R4)
  if (!transcript || !ownerName) {
    return undefined;
  }

  // Find all speaker labels and their positions
  const speakerMatches: Array<{ name: string; index: number; length: number }> = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  SPEAKER_LABEL_PATTERN.lastIndex = 0;

  while ((match = SPEAKER_LABEL_PATTERN.exec(transcript)) !== null) {
    speakerMatches.push({
      name: match[1].trim(),
      index: match.index,
      length: match[0].length,
    });
  }

  // No speaker labels found → graceful degradation
  if (speakerMatches.length === 0) {
    return undefined;
  }

  // Calculate words per speaker segment
  const wordCounts = new Map<string, number>();
  let totalWords = 0;
  let ownerWords = 0;

  for (let i = 0; i < speakerMatches.length; i++) {
    const current = speakerMatches[i];
    const contentStart = current.index + current.length;
    const contentEnd =
      i + 1 < speakerMatches.length
        ? speakerMatches[i + 1].index
        : transcript.length;

    // Extract text between this speaker label and the next
    const spokenText = transcript.slice(contentStart, contentEnd);
    const words = countWords(spokenText);

    totalWords += words;

    // Track words for this speaker
    const currentCount = wordCounts.get(current.name) ?? 0;
    wordCounts.set(current.name, currentCount + words);

    // Check if this speaker matches the owner
    if (speakerMatchesOwner(current.name, ownerName)) {
      ownerWords += words;
    }
  }

  // Avoid division by zero
  if (totalWords === 0) {
    return 0;
  }

  return ownerWords / totalWords;
}

// ---------------------------------------------------------------------------
// Urgency Inference for Task Bucket Placement
// ---------------------------------------------------------------------------

/**
 * Task bucket based on urgency inference.
 * Maps to TaskDestination values: 'must', 'should', 'anytime'
 */
export type UrgencyBucket = 'must' | 'should' | 'anytime';

/**
 * Infer task urgency bucket from action item text.
 *
 * Scans text for urgency keywords and maps to GTD buckets:
 * - "urgent", "asap", "immediately", "today", "this week" → must
 * - "important", "priority", "soon" → should
 * - "when you can", "sometime", "eventually", "anytime" → anytime
 * - Default (no keywords) → should (don't block per Harvester requirement)
 *
 * @param text - Action item description
 * @returns Task bucket: 'must', 'should', or 'anytime'
 *
 * @example
 * ```ts
 * inferUrgency('Send the slides ASAP'); // → 'must'
 * inferUrgency('Review when you can'); // → 'anytime'
 * inferUrgency('Send API documentation'); // → 'should' (default)
 * ```
 */
export function inferUrgency(text: string): UrgencyBucket {
  const lower = text.toLowerCase();

  // Must: urgent, asap, immediately, today, this week
  if (/\b(urgent|asap|immediately|today|this week)\b/.test(lower)) {
    return 'must';
  }

  // Should: important, priority, soon
  if (/\b(important|priority|soon)\b/.test(lower)) {
    return 'should';
  }

  // Anytime: when you can, sometime, eventually, anytime
  if (/\b(when you can|sometime|eventually|anytime)\b/.test(lower)) {
    return 'anytime';
  }

  // Default: should (per Harvester requirement - don't block on unclear urgency)
  return 'should';
}
