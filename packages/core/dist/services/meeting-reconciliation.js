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
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { normalizeForJaccard, jaccardSimilarity } from './meeting-extraction.js';
import { AreaParserService } from './area-parser.js';
/** Similarity threshold for considering an item a workspace duplicate. */
const WORKSPACE_MATCH_THRESHOLD = 0.85;
/** Similarity threshold for matching items against completed tasks. */
const COMPLETED_MATCH_THRESHOLD = 0.6;
/** Similarity threshold for matching items against recent memory. */
const MEMORY_MATCH_THRESHOLD = 0.7;
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
export async function matchPriorWorkspace(items, searchProvider) {
    if (!searchProvider) {
        console.warn('[meeting-reconciliation] No search provider - skipping workspace matching');
        return [];
    }
    const matches = [];
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
export function matchCompletedTasks(items, completedTasks) {
    const matches = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        for (const task of completedTasks) {
            // Owner check: if both have owners, they must match
            if (item.owner && task.owner && item.owner !== task.owner) {
                continue;
            }
            const similarity = jaccardSimilarity(normalizeForJaccard(item.text), normalizeForJaccard(task.text));
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
function flattenExtractions(extractions) {
    const items = [];
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
export function findDuplicates(items, threshold = 0.7) {
    const groups = [];
    const assigned = new Set();
    for (let i = 0; i < items.length; i++) {
        if (assigned.has(i))
            continue;
        const canonical = items[i];
        const duplicates = [];
        for (let j = i + 1; j < items.length; j++) {
            if (assigned.has(j))
                continue;
            const candidate = items[j];
            // Different owners = not duplicates
            if (canonical.owner && candidate.owner && canonical.owner !== candidate.owner) {
                continue;
            }
            // Same type only (don't match action to decision)
            if (canonical.type !== candidate.type) {
                continue;
            }
            const similarity = jaccardSimilarity(normalizeForJaccard(canonical.text), normalizeForJaccard(candidate.text));
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
// Recent memory matching
// ---------------------------------------------------------------------------
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
export function matchRecentMemory(items, recentMemory) {
    const matches = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        for (const memory of recentMemory) {
            const similarity = jaccardSimilarity(normalizeForJaccard(item.text), normalizeForJaccard(memory.text));
            if (similarity > MEMORY_MATCH_THRESHOLD) {
                matches.push({
                    itemIndex: i,
                    source: memory.source,
                    text: memory.text,
                });
                break;
            }
        }
    }
    return matches;
}
export const RELEVANCE_WEIGHTS = {
    keyword: 0.3,
    person: 0.3,
    area: 0.4,
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
function scoreRelevance(item, context, options) {
    let bestScore = 0;
    let bestBreakdown = { keywordMatch: 0, personMatch: 0, areaMatch: 0 };
    let matchedArea;
    let matchedPerson;
    for (const [slug, memory] of context.areaMemories) {
        // Keyword match: any keyword found in item text
        const hasKeyword = memory.keywords.some((kw) => item.text.toLowerCase().includes(kw.toLowerCase()));
        const keywordScore = hasKeyword ? RELEVANCE_WEIGHTS.keyword : 0;
        // Person match: owner in activePeople
        const hasPerson = !!(item.owner && memory.activePeople.includes(item.owner));
        const personScore = hasPerson ? RELEVANCE_WEIGHTS.person : 0;
        // Area match: meeting path contains area slug (simple heuristic)
        const hasAreaPath = item.meetingPath.toLowerCase().includes(slug.toLowerCase());
        const areaScore = hasAreaPath ? RELEVANCE_WEIGHTS.area : 0;
        const totalScore = keywordScore + personScore + areaScore;
        if (totalScore > bestScore) {
            bestScore = totalScore;
            bestBreakdown = { keywordMatch: keywordScore, personMatch: personScore, areaMatch: areaScore };
            matchedArea = slug;
            if (hasPerson)
                matchedPerson = item.owner;
        }
    }
    const tier = bestScore >= 0.7 ? 'high' : bestScore >= 0.4 ? 'normal' : 'low';
    if (options?.debug || process.env.ARETE_DEBUG === '1') {
        console.log(`[reconciliation] Score for "${item.text.slice(0, 30)}...": ${bestScore.toFixed(2)} (${tier})`);
    }
    return {
        score: bestScore,
        tier,
        breakdown: bestBreakdown,
        matchedArea,
        matchedPerson,
    };
}
// ---------------------------------------------------------------------------
// Annotation
// ---------------------------------------------------------------------------
/**
 * Generate a human-readable "why" annotation.
 * Uses ONE primary reason (highest contributing factor from breakdown).
 */
function generateWhy(tier, breakdown, matchedArea, matchedPerson) {
    const tierLabel = tier.toUpperCase();
    // Find primary reason (highest score)
    const factors = [
        { name: 'area', score: breakdown.areaMatch },
        { name: 'keyword', score: breakdown.keywordMatch },
        { name: 'person', score: breakdown.personMatch },
    ].sort((a, b) => b.score - a.score);
    const primary = factors[0];
    if (primary.score === 0) {
        return `${tierLabel}: No area/person/keyword matches`;
    }
    switch (primary.name) {
        case 'area':
            return `${tierLabel}: Area match (${matchedArea ?? 'unknown'})`;
        case 'keyword':
            return `${tierLabel}: Keyword match (${matchedArea ?? 'unknown'})`;
        case 'person':
            return `${tierLabel}: Person match (${matchedPerson ?? 'unknown'})`;
        default:
            return `${tierLabel}: Matched`;
    }
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
export function reconcileMeetingBatch(extractions, context) {
    // Step 1: Flatten all items
    const allItems = flattenExtractions(extractions);
    // Step 2: Find duplicates within batch
    const duplicateGroups = findDuplicates(allItems);
    const duplicateSet = new Set(duplicateGroups.flatMap((g) => g.duplicates));
    // Step 3: Match completed tasks
    const completedMatches = matchCompletedTasks(allItems, context.completedTasks);
    const completedIndices = new Set(completedMatches.map((m) => m.itemIndex));
    // Step 4: Match recent memory
    const memoryMatches = matchRecentMemory(allItems, context.recentCommittedItems);
    const memoryMatchedIndices = new Set(memoryMatches.map((m) => m.itemIndex));
    // Steps 3-6: Process each item
    const reconciled = allItems.map((item, index) => {
        let status = 'keep';
        const annotations = { why: '' };
        // Step 2: Check if this is a duplicate (not canonical)
        if (duplicateSet.has(item)) {
            status = 'duplicate';
            const group = duplicateGroups.find((g) => g.duplicates.includes(item));
            if (group) {
                annotations.duplicateOf = `${group.canonical.meetingPath}:${group.canonical.type}`;
            }
        }
        // Step 3: Check recent memory (before completed — completed takes priority)
        if (memoryMatchedIndices.has(index)) {
            status = 'duplicate';
            const match = memoryMatches.find((m) => m.itemIndex === index);
            if (match) {
                annotations.duplicateOf = match.source;
                annotations.why = `Similar to: "${match.text.slice(0, 50)}..." from ${match.source}`;
            }
        }
        // Step 4: Check completed tasks (overrides memory match)
        if (completedIndices.has(index)) {
            status = 'completed';
            const match = completedMatches.find((m) => m.itemIndex === index);
            if (match) {
                annotations.completedOn = match.completedOn;
            }
        }
        // Step 5: Score relevance
        const relevance = scoreRelevance(item, context);
        const { score, tier, matchedArea, matchedPerson } = relevance;
        if (matchedArea) {
            annotations.areaSlug = matchedArea;
        }
        if (matchedPerson) {
            annotations.personSlug = matchedPerson;
        }
        // Step 6: Generate annotation (preserve memory match why)
        if (!annotations.why) {
            annotations.why = generateWhy(tier, relevance.breakdown, matchedArea, matchedPerson);
        }
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
// ---------------------------------------------------------------------------
// Memory item parsing
// ---------------------------------------------------------------------------
/**
 * Parse committed items from a memory file (decisions.md or learnings.md).
 *
 * Handles the section format written by `appendToMemoryFile()`:
 * ```
 * ## Title
 * - **Date**: YYYY-MM-DD
 * - **Source**: Meeting Title (Attendees)
 * - Item content
 * ```
 *
 * Filters to items within the last `maxAgeDays` and caps at `maxItems`.
 */
export function parseMemoryItems(content, sourcePath, options) {
    const maxAgeDays = options?.maxAgeDays ?? 30;
    const maxItems = options?.maxItems ?? 100;
    if (!content.trim())
        return [];
    const items = [];
    // Use local-time date strings for comparison to avoid UTC/local timezone mismatch.
    // Both cutoff and item dates are compared as YYYY-MM-DD strings.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    // Split into sections by ## headers
    const sections = content.split(/^## /m).slice(1); // skip preamble before first ##
    for (const section of sections) {
        const lines = section.split('\n');
        let date;
        let source;
        const textLines = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line)
                continue;
            const dateMatch = line.match(/^- \*\*Date\*\*:\s*(.+)$/);
            if (dateMatch) {
                date = dateMatch[1].trim();
                continue;
            }
            const sourceMatch = line.match(/^- \*\*Source\*\*:\s*(.+)$/);
            if (sourceMatch) {
                source = sourceMatch[1].trim();
                continue;
            }
            // Content lines (strip leading "- " prefix)
            const textContent = line.startsWith('- ') ? line.slice(2) : line;
            if (textContent)
                textLines.push(textContent);
        }
        const text = textLines.join(' ').trim();
        if (!text || !date)
            continue;
        // Filter by date — compare as YYYY-MM-DD strings to avoid timezone issues
        if (!/^\d{4}-\d{2}-\d{2}/.test(date))
            continue;
        if (date < cutoffStr)
            continue;
        items.push({ text, date, source: source ?? sourcePath });
    }
    return items.slice(0, maxItems);
}
// ---------------------------------------------------------------------------
// Batch LLM quality review
// ---------------------------------------------------------------------------
/**
 * One LLM call per processing run that semantically deduplicates against
 * committed memory and catches low-signal items that slipped through
 * rule-based filters.
 *
 * Returns a list of items to drop (with reasons). Graceful degradation:
 * returns empty on parse failure.
 */
export async function batchLLMReview(currentItems, committedItems, callLLM) {
    if (currentItems.length === 0)
        return [];
    // Sanitize text to mitigate prompt injection: truncate and strip control chars
    const sanitize = (text) => text.slice(0, 200).replace(/[{}[\]]/g, '');
    const committedSection = committedItems.length > 0
        ? committedItems.map(c => `- [${c.date}] ${sanitize(c.text)}`).join('\n')
        : '(none)';
    const currentSection = currentItems
        .map(c => `- [${c.id}] (${c.type}) ${sanitize(c.text)}`)
        .join('\n');
    const prompt = `You are reviewing extracted meeting items for quality and duplication.

## Recently Committed Items (already saved — flag duplicates)
${committedSection}

## Current Extraction Items (review each)
${currentSection}

## Task
Return a JSON object with items to DROP. Keep everything else — when in doubt, keep.

DROP criteria:
- Semantic duplicate of a committed item (same meaning, different wording)
- Status update misclassified as a decision (e.g. "We discussed X", "We reviewed Y")
- Personal trivia misclassified as a learning (e.g. "Alice lives in Seattle")
- Vague or unactionable items that add no signal

Return ONLY valid JSON in this format:
{"drops": [{"id": "item-id", "reason": "brief reason"}]}

If nothing should be dropped, return: {"drops": []}`;
    try {
        const response = await callLLM(prompt);
        // Try direct parse first, then strip code fences, then greedy regex extraction
        let parsed;
        try {
            parsed = JSON.parse(response.trim());
        }
        catch {
            const stripped = response.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
            try {
                parsed = JSON.parse(stripped);
            }
            catch {
                const jsonMatch = stripped.match(/\{[\s\S]*\}/);
                if (!jsonMatch)
                    return [];
                parsed = JSON.parse(jsonMatch[0]);
            }
        }
        const result = parsed;
        if (!result.drops || !Array.isArray(result.drops))
            return [];
        // Validate IDs exist in input
        const validIds = new Set(currentItems.map(i => i.id));
        return result.drops
            .filter((d) => d.id && d.reason && validIds.has(d.id))
            .map((d) => ({
            id: d.id,
            action: 'drop',
            reason: d.reason,
        }));
    }
    catch {
        // Graceful degradation — parse failure or LLM error
        return [];
    }
}
// ---------------------------------------------------------------------------
// Reconciliation context loader
// ---------------------------------------------------------------------------
/**
 * Load reconciliation context from workspace.
 *
 * Reads area memory files and committed decision/learning memory to build
 * the context needed for reconciliation scoring and matching.
 *
 * @param storage - StorageAdapter for file access
 * @param workspaceRoot - Workspace root path
 * @returns ReconciliationContext for use with reconcileMeetingBatch
 */
export async function loadReconciliationContext(storage, workspaceRoot) {
    const areaParser = new AreaParserService(storage, workspaceRoot);
    const areas = await areaParser.listAreas();
    const areaMemories = new Map();
    for (const area of areas) {
        if (area.memory) {
            areaMemories.set(area.slug, area.memory);
        }
    }
    // Load recently committed decisions and learnings from memory files
    const memoryDir = join(workspaceRoot, '.arete', 'memory', 'items');
    const decisionPath = join(memoryDir, 'decisions.md');
    const learningPath = join(memoryDir, 'learnings.md');
    const [decisionContent, learningContent] = await Promise.all([
        storage.read(decisionPath).catch(() => null),
        storage.read(learningPath).catch(() => null),
    ]);
    const recentCommittedItems = [
        ...parseMemoryItems(decisionContent ?? '', decisionPath),
        ...parseMemoryItems(learningContent ?? '', learningPath),
    ];
    return {
        areaMemories,
        recentCommittedItems,
        completedTasks: [],
    };
}
// ---------------------------------------------------------------------------
// Recent meetings loader
// ---------------------------------------------------------------------------
/**
 * Parse YAML frontmatter from markdown content.
 * Returns parsed data object (empty if no frontmatter found).
 */
function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match)
        return { frontmatter: {}, body: content };
    return {
        frontmatter: parseYaml(match[1]),
        body: match[2],
    };
}
/**
 * Extract MeetingIntelligence from meeting frontmatter staged items.
 */
function extractIntelligenceFromFrontmatter(frontmatter) {
    const stagedItems = frontmatter.staged_items;
    if (!stagedItems || !Array.isArray(stagedItems))
        return null;
    const actionItems = [];
    const decisions = [];
    const learnings = [];
    for (const item of stagedItems) {
        const type = item.type;
        const text = (item.description || item.text);
        if (!text)
            continue;
        if (type === 'action') {
            actionItems.push({
                owner: item.owner_name || '',
                ownerSlug: item.owner || '',
                description: text,
                direction: item.direction || 'i_owe_them',
                counterpartySlug: item.counterparty,
            });
        }
        else if (type === 'decision') {
            decisions.push(text);
        }
        else if (type === 'learning') {
            learnings.push(text);
        }
    }
    if (actionItems.length === 0 && decisions.length === 0 && learnings.length === 0) {
        return null;
    }
    return {
        summary: '',
        actionItems,
        nextSteps: [],
        decisions,
        learnings,
    };
}
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
export async function loadRecentMeetingBatch(storage, meetingsDir, days = 7) {
    const batches = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    // Zero out time for date-only comparison
    cutoffDate.setHours(0, 0, 0, 0);
    // List meeting files (storage.list returns full paths)
    const files = await storage.list(meetingsDir, { extensions: ['.md'] });
    for (const filePath of files) {
        // Extract filename from full path for date parsing
        const filename = filePath.split('/').pop() ?? '';
        // Parse date from filename (YYYY-MM-DD-title.md format)
        const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
        if (!dateMatch)
            continue;
        const fileDate = new Date(dateMatch[1] + 'T00:00:00');
        if (fileDate < cutoffDate)
            continue;
        // Read and parse frontmatter
        const content = await storage.read(filePath);
        if (!content)
            continue;
        const { frontmatter } = parseFrontmatter(content);
        // Only include processed/approved meetings
        if (!['processed', 'approved'].includes(frontmatter.status))
            continue;
        // Extract staged items from frontmatter
        const intelligence = extractIntelligenceFromFrontmatter(frontmatter);
        if (!intelligence)
            continue;
        batches.push({
            meetingPath: filePath,
            extraction: intelligence,
        });
    }
    return batches;
}
// Export internals for testing
export { flattenExtractions, scoreRelevance, generateWhy, extractIntelligenceFromFrontmatter, WORKSPACE_MATCH_THRESHOLD, COMPLETED_MATCH_THRESHOLD, MEMORY_MATCH_THRESHOLD };
//# sourceMappingURL=meeting-reconciliation.js.map