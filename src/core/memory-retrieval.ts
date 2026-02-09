/**
 * Memory Retrieval Service — Intelligence Layer (Phase 3)
 *
 * Search across .arete/memory/ to surface relevant decisions, learnings, and
 * observations for a given task. Uses SearchProvider (QMD when available,
 * token-based fallback otherwise) with recency weighting.
 *
 * Memory files are structured as markdown with ### headings per item:
 *   ### YYYY-MM-DD: Title
 *   **Context**: ...
 *   **Decision**: ...
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getSearchProvider, tokenize } from './search.js';
import type { SearchResult } from './search.js';
import type {
  WorkspacePaths,
  MemoryItemType,
  MemoryResult,
  MemorySearchResult,
  MemorySearchOptions,
} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 10;

const MEMORY_FILES: Record<MemoryItemType, string> = {
  decisions: 'decisions.md',
  learnings: 'learnings.md',
  observations: 'agent-observations.md',
};

// Recency boost thresholds (in days)
const RECENCY_30_DAYS = 30;
const RECENCY_90_DAYS = 90;
const RECENCY_30_BOOST = 0.2; // +20%
const RECENCY_90_BOOST = 0.1; // +10%

// ---------------------------------------------------------------------------
// Recency Weighting
// ---------------------------------------------------------------------------

/**
 * Calculate recency boost for a memory item based on its date.
 * Items within 30 days get +20% boost, within 90 days get +10% boost.
 */
function calculateRecencyBoost(dateStr?: string): number {
  if (!dateStr) return 0;
  
  try {
    const itemDate = new Date(dateStr);
    const today = new Date();
    const diffMs = today.getTime() - itemDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 0; // Future date, no boost
    if (diffDays <= RECENCY_30_DAYS) return RECENCY_30_BOOST;
    if (diffDays <= RECENCY_90_DAYS) return RECENCY_90_BOOST;
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Apply recency boost to a score (multiplicative).
 * Note: Boosted scores may exceed 1.0, which is fine for ranking purposes.
 */
function applyRecencyBoost(score: number, dateStr?: string): number {
  const boost = calculateRecencyBoost(dateStr);
  return score * (1 + boost);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** A parsed memory section (one ### block) */
interface MemorySection {
  title: string;
  date?: string;
  body: string;
  raw: string;
}

/**
 * Parse a memory file into sections delimited by ### headings.
 * Expects format: ### YYYY-MM-DD: Title
 */
function parseMemorySections(content: string): MemorySection[] {
  const sections: MemorySection[] = [];
  const lines = content.split('\n');
  let current: { title: string; date?: string; bodyLines: string[]; rawLines: string[] } | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^###\s+(?:(\d{4}-\d{2}-\d{2}):\s*)?(.+)/);
    if (headingMatch) {
      // Flush previous section
      if (current) {
        sections.push({
          title: current.title,
          date: current.date,
          body: current.bodyLines.join('\n').trim(),
          raw: current.rawLines.join('\n').trim(),
        });
      }
      current = {
        title: headingMatch[2].trim(),
        date: headingMatch[1] || undefined,
        bodyLines: [],
        rawLines: [line],
      };
    } else if (current) {
      current.bodyLines.push(line);
      current.rawLines.push(line);
    }
  }

  // Flush last section
  if (current) {
    sections.push({
      title: current.title,
      date: current.date,
      body: current.bodyLines.join('\n').trim(),
      raw: current.rawLines.join('\n').trim(),
    });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Score a memory section against query tokens.
 * Returns 0 if no match, higher for more matching tokens.
 */
function scoreSection(section: MemorySection, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;

  const titleLower = section.title.toLowerCase();
  const bodyLower = section.body.toLowerCase();
  const combined = titleLower + ' ' + bodyLower;

  let score = 0;
  for (const token of queryTokens) {
    // Title matches are worth more
    if (titleLower.includes(token)) {
      score += 3;
    } else if (bodyLower.includes(token)) {
      score += 1;
    }
  }

  // Bonus for multiple token overlap (more specific match)
  const matchCount = queryTokens.filter(t => combined.includes(t)).length;
  if (matchCount > 1) {
    score += matchCount;
  }

  return score;
}

/**
 * Build a relevance explanation string.
 */
function buildRelevance(section: MemorySection, queryTokens: string[]): string {
  const titleLower = section.title.toLowerCase();
  const bodyLower = section.body.toLowerCase();

  const titleMatches = queryTokens.filter(t => titleLower.includes(t));
  const bodyMatches = queryTokens.filter(t => bodyLower.includes(t));

  const parts: string[] = [];
  if (titleMatches.length > 0) {
    parts.push(`Title matches: ${titleMatches.join(', ')}`);
  }
  if (bodyMatches.length > 0) {
    const unique = bodyMatches.filter(t => !titleMatches.includes(t));
    if (unique.length > 0) {
      parts.push(`Body matches: ${unique.join(', ')}`);
    }
  }
  return parts.join('; ') || 'Token match';
}

// ---------------------------------------------------------------------------
// SearchProvider Result Mapping
// ---------------------------------------------------------------------------

/**
 * Determine memory type from file path.
 */
function getMemoryTypeFromPath(filePath: string): MemoryItemType | null {
  const fileName = filePath.split(/[/\\]/).pop() || '';
  if (fileName === 'decisions.md') return 'decisions';
  if (fileName === 'learnings.md') return 'learnings';
  if (fileName === 'agent-observations.md') return 'observations';
  return null;
}

/**
 * Map SearchProvider results to MemoryResult[].
 * Parses sections from each file and creates individual MemoryResult items.
 */
function mapSearchResultsToMemory(searchResults: SearchResult[]): MemoryResult[] {
  const memoryResults: MemoryResult[] = [];
  
  for (const sr of searchResults) {
    const memType = getMemoryTypeFromPath(sr.path);
    if (!memType) continue;
    
    const sections = parseMemorySections(sr.content);
    const fileName = sr.path.split(/[/\\]/).pop() || '';
    
    // Each section becomes a MemoryResult
    for (const section of sections) {
      const baseScore = sr.score;
      const boostedScore = applyRecencyBoost(baseScore, section.date);
      
      memoryResults.push({
        content: section.raw,
        source: fileName,
        type: memType,
        date: section.date,
        relevance: `Semantic match (score: ${sr.score.toFixed(2)})`,
        score: boostedScore,
      });
    }
  }
  
  return memoryResults;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Search workspace memory for items matching a query.
 * 
 * Uses SearchProvider (QMD when available, token-based fallback otherwise)
 * for semantic search across memory items. Applies recency weighting.
 * Falls back to section-level token scanning if provider returns no results.
 *
 * @param query - Search query (free-form text)
 * @param paths - Workspace paths
 * @param options - Optionally filter by memory type and limit results
 * @returns MemorySearchResult with matched items
 */
export async function searchMemory(
  query: string,
  paths: WorkspacePaths,
  options: MemorySearchOptions = {}
): Promise<MemorySearchResult> {
  const { types, limit = DEFAULT_LIMIT } = options;
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) {
    return { query, results: [], total: 0 };
  }

  const memoryItemsDir = join(paths.memory, 'items');
  const typesToSearch: MemoryItemType[] = types && types.length > 0
    ? types
    : ['decisions', 'learnings', 'observations'];

  // Build list of memory file paths to search (relative to workspace root)
  const memoryFileRelPaths: string[] = [];
  for (const memType of typesToSearch) {
    const fileName = MEMORY_FILES[memType];
    if (!fileName) continue;
    const filePath = join(memoryItemsDir, fileName);
    if (existsSync(filePath)) {
      // Convert to relative path from workspace root for SearchProvider
      const relPath = join('.arete', 'memory', 'items', fileName);
      memoryFileRelPaths.push(relPath);
    }
  }

  if (memoryFileRelPaths.length === 0) {
    return { query, results: [], total: 0 };
  }

  // Primary search path: use SearchProvider
  let allResults: MemoryResult[] = [];
  
  try {
    const provider = getSearchProvider(paths.root);
    const searchResults = await provider.semanticSearch(query, {
      paths: memoryFileRelPaths,
      limit: limit * 3, // Get more results to have enough after section parsing
    });

    if (searchResults.length > 0) {
      allResults = mapSearchResultsToMemory(searchResults);
    }
  } catch {
    // Provider error, fall through to fallback
  }

  // Fallback: use token-based section scanning
  if (allResults.length === 0) {
    const fallbackResults: (MemoryResult & { _rawScore: number })[] = [];

    for (const memType of typesToSearch) {
      const fileName = MEMORY_FILES[memType];
      if (!fileName) continue;

      const filePath = join(memoryItemsDir, fileName);
      if (!existsSync(filePath)) continue;

      let content: string;
      try {
        content = readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }

      const sections = parseMemorySections(content);

      for (const section of sections) {
        const rawScore = scoreSection(section, queryTokens);
        if (rawScore > 0) {
          fallbackResults.push({
            content: section.raw,
            source: fileName,
            type: memType,
            date: section.date,
            relevance: buildRelevance(section, queryTokens),
            _rawScore: rawScore,
          });
        }
      }
    }

    // Normalize fallback scores to 0-1 range and apply recency boost
    const maxRaw = fallbackResults.length > 0 ? Math.max(...fallbackResults.map(r => r._rawScore)) : 1;
    allResults = fallbackResults.map(({ _rawScore, ...rest }) => {
      const normalizedScore = maxRaw > 0 ? _rawScore / maxRaw : 0;
      const boostedScore = applyRecencyBoost(normalizedScore, rest.date);
      return {
        ...rest,
        score: boostedScore,
      };
    });
  }

  // Sort by score descending, then by date descending
  allResults.sort((a, b) => {
    const scoreA = a.score ?? 0;
    const scoreB = b.score ?? 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    const dateA = a.date || '';
    const dateB = b.date || '';
    return dateB.localeCompare(dateA);
  });

  const total = allResults.length;
  const results = allResults.slice(0, limit);

  return { query, results, total };
}
