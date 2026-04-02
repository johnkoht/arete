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

import type {
  ReconciliationContext,
  ReconciliationResult,
  ReconciledItem,
  ExtractedItemType,
  AreaMemory,
} from '../models/entities.js';
import type { MeetingIntelligence, ActionItem } from './meeting-extraction.js';

/**
 * Input structure for a batch of meeting extractions.
 */
export type MeetingExtractionBatch = {
  meetingPath: string;
  extraction: MeetingIntelligence;
};

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type FlattenedItem = {
  original: ActionItem | string;
  type: ExtractedItemType;
  meetingPath: string;
  text: string; // Normalized text for matching
  owner?: string;
};

// ---------------------------------------------------------------------------
// Flatten
// ---------------------------------------------------------------------------

/**
 * Flatten all items from all meeting extractions into a single list.
 */
function flattenExtractions(extractions: MeetingExtractionBatch[]): FlattenedItem[] {
  const items: FlattenedItem[] = [];

  for (const { meetingPath, extraction } of extractions) {
    for (const ai of extraction.actionItems) {
      items.push({
        original: ai,
        type: 'action',
        meetingPath,
        text: ai.description,
        owner: ai.ownerSlug,
      });
    }

    for (const decision of extraction.decisions) {
      items.push({
        original: decision,
        type: 'decision',
        meetingPath,
        text: decision,
      });
    }

    for (const learning of extraction.learnings) {
      items.push({
        original: learning,
        type: 'learning',
        meetingPath,
        text: learning,
      });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Score relevance of an item against area memories.
 *
 * Placeholder scoring — will be enhanced in P2-7.
 * Currently uses keyword and person matching.
 */
function scoreRelevance(
  item: FlattenedItem,
  context: ReconciliationContext,
): { score: number; tier: 'high' | 'normal' | 'low'; matchedArea?: string; matchedPerson?: string } {
  let score = 0;
  let matchedArea: string | undefined;
  let matchedPerson: string | undefined;

  for (const [slug, memory] of context.areaMemories) {
    const keywordScore = memory.keywords.some((kw) =>
      item.text.toLowerCase().includes(kw.toLowerCase()),
    )
      ? 0.3
      : 0;

    const personScore =
      item.owner && memory.activePeople.includes(item.owner) ? 0.3 : 0;

    const areaScore = keywordScore + personScore;
    if (areaScore > score) {
      score = areaScore;
      matchedArea = slug;
      matchedPerson = personScore > 0 ? item.owner : undefined;
    }
  }

  const tier = score >= 0.7 ? 'high' : score >= 0.4 ? 'normal' : 'low';

  return { score, tier, matchedArea, matchedPerson };
}

// ---------------------------------------------------------------------------
// Annotation
// ---------------------------------------------------------------------------

/**
 * Generate human-readable "why" annotation for a reconciled item.
 */
function generateWhy(
  tier: 'high' | 'normal' | 'low',
  annotations: Partial<ReconciledItem['annotations']>,
): string {
  if (annotations.areaSlug) {
    return `${tier.toUpperCase()}: Area match (${annotations.areaSlug})`;
  }
  if (annotations.personSlug) {
    return `${tier.toUpperCase()}: Person match (${annotations.personSlug})`;
  }
  return `${tier.toUpperCase()}: No area/person/keyword matches`;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

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
export function reconcileMeetingBatch(
  extractions: MeetingExtractionBatch[],
  context: ReconciliationContext,
): ReconciliationResult {
  // Step 1: Flatten all items
  const allItems = flattenExtractions(extractions);

  // Steps 2-6: Process each item
  const reconciled: ReconciledItem[] = allItems.map((item) => {
    const status: ReconciledItem['status'] = 'keep';
    const annotations: ReconciledItem['annotations'] = { why: '' };

    // TODO: Dedup (P2-3), completion matching (P2-5), memory matching (P2-6)

    // Step 5: Score relevance
    const { score, tier, matchedArea, matchedPerson } = scoreRelevance(item, context);

    if (matchedArea) {
      annotations.areaSlug = matchedArea;
    }
    if (matchedPerson) {
      annotations.personSlug = matchedPerson;
    }

    // Step 6: Generate annotation
    annotations.why = generateWhy(tier, annotations);

    return {
      original: item.original,
      type: item.type,
      meetingPath: item.meetingPath,
      status,
      relevanceScore: score,
      relevanceTier: tier,
      annotations,
    };
  });

  // Compute stats
  const stats = {
    duplicatesRemoved: reconciled.filter((i) => i.status === 'duplicate').length,
    completedMatched: reconciled.filter((i) => i.status === 'completed').length,
    lowRelevanceCount: reconciled.filter((i) => i.relevanceTier === 'low').length,
  };

  return { items: reconciled, stats };
}

// Export internals for testing
export { flattenExtractions, scoreRelevance, generateWhy };
