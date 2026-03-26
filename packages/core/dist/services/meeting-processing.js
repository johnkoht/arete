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
// ---------------------------------------------------------------------------
// Default Thresholds
// ---------------------------------------------------------------------------
const DEFAULT_CONFIDENCE_INCLUDE = 0.5;
const DEFAULT_CONFIDENCE_APPROVED = 0.8;
const DEFAULT_DEDUP_JACCARD = 0.7;
const DEFAULT_RECONCILE_JACCARD = 0.6;
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
export function extractUserNotes(body) {
    const lines = body.split('\n');
    const output = [];
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
function generateItemId(prefix, index) {
    return `${prefix}${String(index + 1).padStart(3, '0')}`;
}
/**
 * Check if an item's text matches user notes.
 * @param itemText - The item text to check
 * @param userNotesTokens - Tokenized user notes (from normalizeForJaccard)
 * @param threshold - Jaccard similarity threshold
 * @returns True if similarity exceeds threshold
 */
function itemMatchesUserNotes(itemText, userNotesTokens, threshold) {
    const itemTokens = normalizeForJaccard(itemText);
    const similarity = jaccardSimilarity(itemTokens, userNotesTokens);
    return similarity > threshold;
}
/**
 * Negation markers that indicate an item may contradict a prior item.
 * Items with these markers skip prior-item dedup to avoid suppressing contradictions.
 */
const NEGATION_MARKERS = ['not', "won't", 'no longer', 'instead of', 'changed from'];
/**
 * Check if text contains negation markers that indicate a possible contradiction.
 * Items with negation markers should skip prior-item dedup to avoid suppressing
 * decisions/learnings that contradict earlier ones.
 *
 * @param text - The item text to check
 * @returns True if text contains any negation marker
 */
export function hasNegationMarkers(text) {
    const lower = text.toLowerCase();
    return NEGATION_MARKERS.some((marker) => lower.includes(marker));
}
/**
 * Check if an item's text matches any prior item.
 * @param itemText - The item text to check
 * @param tokenizedPriorItems - Pre-tokenized prior items
 * @param threshold - Jaccard similarity threshold
 * @returns True if similarity with any prior item exceeds threshold
 */
function itemMatchesPriorItems(itemText, tokenizedPriorItems, threshold) {
    if (tokenizedPriorItems.length === 0)
        return false;
    const itemTokens = normalizeForJaccard(itemText);
    for (const prior of tokenizedPriorItems) {
        const similarity = jaccardSimilarity(itemTokens, prior.tokens);
        if (similarity > threshold) {
            return true;
        }
    }
    return false;
}
/**
 * Find matching completed item text for reconciliation.
 * @param itemText - The item text to check
 * @param tokenizedCompletedItems - Pre-tokenized completed items
 * @param threshold - Jaccard similarity threshold
 * @returns Matched completed text (truncated to 60 chars) or undefined if no match
 */
function findMatchingCompletedItem(itemText, tokenizedCompletedItems, threshold) {
    if (tokenizedCompletedItems.length === 0)
        return undefined;
    const itemTokens = normalizeForJaccard(itemText);
    for (const completed of tokenizedCompletedItems) {
        const similarity = jaccardSimilarity(itemTokens, completed.tokens);
        if (similarity >= threshold) {
            // Truncate to 60 chars with "..." suffix if needed
            return completed.text.length > 60
                ? completed.text.slice(0, 57) + '...'
                : completed.text;
        }
    }
    return undefined;
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
export function processMeetingExtraction(result, userNotes, options) {
    const { intelligence } = result;
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
    const tokenizedPriorItems = cappedPriorItems.map((item) => ({
        type: item.type,
        tokens: normalizeForJaccard(item.text),
    }));
    // Pre-tokenize completed items for reconciliation (no cap needed — week.md is small)
    const completedItems = options?.completedItems ?? [];
    const tokenizedCompletedItems = completedItems.map((text) => ({
        text,
        tokens: normalizeForJaccard(text),
    }));
    // Result collections
    const filteredItems = [];
    const stagedItemStatus = {};
    const stagedItemConfidence = {};
    const stagedItemSource = {};
    const stagedItemOwner = {};
    const stagedItemMatchedText = {};
    // Track indices per type for ID generation
    let aiIndex = 0;
    let deIndex = 0;
    let leIndex = 0;
    // Process action items
    for (const item of intelligence.actionItems) {
        const confidence = item.confidence ?? 0.9;
        if (confidence < confidenceInclude)
            continue;
        const id = generateItemId('ai_', aiIndex);
        aiIndex++;
        const text = item.description;
        // 1. Check reconciliation first (action items only): match against completed tasks
        // No negation marker bypass — these are completed items, not cross-meeting dedup
        const matchedCompletedText = findMatchingCompletedItem(text, tokenizedCompletedItems, reconcileJaccard);
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
        // 2. Check for dedup: userNotes OR priorItems match → source: 'dedup'
        // Skip priorItems check if item contains negation markers (to avoid suppressing contradictions)
        const matchesUserNotes = itemMatchesUserNotes(text, userNotesTokens, dedupJaccard);
        const matchesPriorItems = !hasNegationMarkers(text) && itemMatchesPriorItems(text, tokenizedPriorItems, dedupJaccard);
        const isDedup = matchesUserNotes || matchesPriorItems;
        const source = isDedup ? 'dedup' : 'ai';
        // Determine status
        let status;
        if (source === 'dedup') {
            status = 'approved';
        }
        else {
            status = confidence > confidenceApproved ? 'approved' : 'pending';
        }
        // Build owner metadata (only include defined values)
        const ownerMeta = {};
        if (item.ownerSlug)
            ownerMeta.ownerSlug = item.ownerSlug;
        if (item.direction)
            ownerMeta.direction = item.direction;
        if (item.counterpartySlug)
            ownerMeta.counterpartySlug = item.counterpartySlug;
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
        if (confidence < confidenceInclude)
            continue;
        const id = generateItemId('de_', deIndex);
        deIndex++;
        const text = decision;
        // Check for dedup: userNotes OR priorItems match → source: 'dedup'
        // Skip priorItems check if item contains negation markers (to avoid suppressing contradictions)
        const matchesUserNotes = itemMatchesUserNotes(text, userNotesTokens, dedupJaccard);
        const matchesPriorItems = !hasNegationMarkers(text) && itemMatchesPriorItems(text, tokenizedPriorItems, dedupJaccard);
        const isDedup = matchesUserNotes || matchesPriorItems;
        const source = isDedup ? 'dedup' : 'ai';
        let status;
        if (source === 'dedup') {
            status = 'approved';
        }
        else {
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
        if (confidence < confidenceInclude)
            continue;
        const id = generateItemId('le_', leIndex);
        leIndex++;
        const text = learning;
        // Check for dedup: userNotes OR priorItems match → source: 'dedup'
        // Skip priorItems check if item contains negation markers (to avoid suppressing contradictions)
        const matchesUserNotes = itemMatchesUserNotes(text, userNotesTokens, dedupJaccard);
        const matchesPriorItems = !hasNegationMarkers(text) && itemMatchesPriorItems(text, tokenizedPriorItems, dedupJaccard);
        const isDedup = matchesUserNotes || matchesPriorItems;
        const source = isDedup ? 'dedup' : 'ai';
        let status;
        if (source === 'dedup') {
            status = 'approved';
        }
        else {
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
 * Remove approved sections from meeting content.
 * Removes: `## Approved Action Items`, `## Approved Decisions`, `## Approved Learnings`
 * and all content until the next `## ` header.
 *
 * @param content - The meeting file content (markdown)
 * @returns Content with approved sections removed
 */
export function clearApprovedSections(content) {
    const lines = content.split('\n');
    const result = [];
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
 * @param filteredItems - Items from processMeetingExtraction()
 * @param summary - The meeting summary text
 * @returns Markdown string with Summary and Staged sections
 */
export function formatFilteredStagedSections(filteredItems, summary) {
    const lines = [];
    // Summary section
    lines.push('## Summary');
    lines.push(summary);
    lines.push('');
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
//# sourceMappingURL=meeting-processing.js.map