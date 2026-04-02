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
import { normalizeForJaccard, jaccardSimilarity } from './meeting-extraction.js';
import type { SearchProvider, SearchResult } from '../search/types.js';

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

/**
 * Duplicate group: canonical item + its duplicates.
 */
export type DuplicateGroup = {
  canonical: FlattenedItem;
  duplicates: FlattenedItem[];
};

// ---------------------------------------------------------------------------
// Workspace matching (QMD semantic search)
// ---------------------------------------------------------------------------

/**
 * A match between an extracted item and prior workspace content.
 */
export type WorkspaceMatch = {
  itemIndex: number;
  matchedPath: string;
  similarity: number;
};

/** Similarity threshold for considering an item a workspace duplicate. */
const WORKSPACE_MATCH_THRESHOLD = 0.85;

/** Similarity threshold for matching items against completed tasks. */
const COMPLETED_MATCH_THRESHOLD = 0.6;

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
export async function matchPriorWorkspace(
  items: FlattenedItem[],
  searchProvider: SearchProvider | null,
): Promise<WorkspaceMatch[]> {
  if (!searchProvider) {
    console.warn('[meeting-reconciliation] No search provider - skipping workspace matching');
    return [];
  }

  const matches: WorkspaceMatch[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const results = await searchProvider.semanticSearch(item.text, { limit: 3 });

    // Check for high-similarity matches in prior meetings
    for (const result of results) {
      if (result.score > WORKSPACE_MATCH_THRESHOLD && result.path.includes('/meetings/')) {
        matches.push({
          itemIndex: i,
          matchedPath: result.path,
          similarity: result.score,
        });
        break; // One match per item
      }
    }
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Completed task matching
// ---------------------------------------------------------------------------

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
export function matchCompletedTasks(
  items: FlattenedItem[],
  completedTasks: ReconciliationContext['completedTasks'],
): CompletedMatch[] {
  const matches: CompletedMatch[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    for (const task of completedTasks) {
      // Owner check: if both have owners, they must match
      if (item.owner && task.owner && item.owner !== task.owner) {
        continue;
      }

      const similarity = jaccardSimilarity(
        normalizeForJaccard(item.text),
        normalizeForJaccard(task.text),
      );

      if (similarity > COMPLETED_MATCH_THRESHOLD) {
        matches.push({
          itemIndex: i,
          completedOn: task.completedOn,
          matchedTask: task.text,
        });
        break; // One match per item
      }
    }
  }

  return matches;
}

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
// Deduplication
// ---------------------------------------------------------------------------

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
export function findDuplicates(
  items: FlattenedItem[],
  threshold: number = 0.7,
): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    if (assigned.has(i)) continue;

    const canonical = items[i];
    const duplicates: FlattenedItem[] = [];

    for (let j = i + 1; j < items.length; j++) {
      if (assigned.has(j)) continue;

      const candidate = items[j];

      // Different owners = not duplicates
      if (canonical.owner && candidate.owner && canonical.owner !== candidate.owner) {
        continue;
      }

      // Same type only (don't match action to decision)
      if (canonical.type !== candidate.type) {
        continue;
      }

      const similarity = jaccardSimilarity(
        normalizeForJaccard(canonical.text),
        normalizeForJaccard(candidate.text),
      );

      if (similarity > threshold) {
        duplicates.push(candidate);
        assigned.add(j);
      }
    }

    if (duplicates.length > 0) {
      assigned.add(i);
      groups.push({ canonical, duplicates });
    }
  }

  return groups;
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

  // Step 2: Find duplicates within batch
  const duplicateGroups = findDuplicates(allItems);
  const duplicateSet = new Set<FlattenedItem>(
    duplicateGroups.flatMap((g) => g.duplicates),
  );

  // Step 3: Match completed tasks
  const completedMatches = matchCompletedTasks(allItems, context.completedTasks);
  const completedIndices = new Set(completedMatches.map((m) => m.itemIndex));

  // Steps 3-6: Process each item
  const reconciled: ReconciledItem[] = allItems.map((item, index) => {
    let status: ReconciledItem['status'] = 'keep';
    const annotations: ReconciledItem['annotations'] = { why: '' };

    // Step 2: Check if this is a duplicate (not canonical)
    if (duplicateSet.has(item)) {
      status = 'duplicate';
      const group = duplicateGroups.find((g) => g.duplicates.includes(item));
      if (group) {
        annotations.duplicateOf = `${group.canonical.meetingPath}:${group.canonical.type}`;
      }
    }

    // Step 3: Check completed tasks
    if (completedIndices.has(index)) {
      status = 'completed';
      const match = completedMatches.find((m) => m.itemIndex === index);
      if (match) {
        annotations.completedOn = match.completedOn;
      }
    }

    // TODO: memory matching (P2-6)

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
export { flattenExtractions, scoreRelevance, generateWhy, WORKSPACE_MATCH_THRESHOLD, COMPLETED_MATCH_THRESHOLD };
