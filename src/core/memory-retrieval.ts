/**
 * Memory Retrieval Service — Intelligence Layer (Phase 3)
 *
 * Search across .arete/memory/ to surface relevant decisions, learnings, and
 * observations for a given task. Uses token-based keyword matching for v1;
 * delegates to QMD if available in the future.
 *
 * Memory files are structured as markdown with ### headings per item:
 *   ### YYYY-MM-DD: Title
 *   **Context**: ...
 *   **Decision**: ...
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
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

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'for', 'with', 'my', 'me', 'i', 'to', 'and', 'or', 'is', 'it',
  'in', 'on', 'at', 'of', 'this', 'that', 'what', 'how', 'can', 'you', 'please',
  'want', 'need', 'create', 'build', 'start', 'run', 'do', 'help',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
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
// Main function
// ---------------------------------------------------------------------------

/**
 * Search workspace memory for items matching a query.
 *
 * @param query - Search query (free-form text)
 * @param paths - Workspace paths
 * @param options - Optionally filter by memory type and limit results
 * @returns MemorySearchResult with matched items
 */
export function searchMemory(
  query: string,
  paths: WorkspacePaths,
  options: MemorySearchOptions = {}
): MemorySearchResult {
  const { types, limit = DEFAULT_LIMIT } = options;
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) {
    return { query, results: [], total: 0 };
  }

  const memoryItemsDir = join(paths.memory, 'items');
  const typesToSearch: MemoryItemType[] = types && types.length > 0
    ? types
    : ['decisions', 'learnings', 'observations'];

  const allResults: (MemoryResult & { _score: number })[] = [];

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
      const score = scoreSection(section, queryTokens);
      if (score > 0) {
        allResults.push({
          content: section.raw,
          source: fileName,
          type: memType,
          date: section.date,
          relevance: buildRelevance(section, queryTokens),
          _score: score,
        });
      }
    }
  }

  // Sort by score descending, then by date descending
  allResults.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    const dateA = a.date || '';
    const dateB = b.date || '';
    return dateB.localeCompare(dateA);
  });

  const total = allResults.length;
  const limited = allResults.slice(0, limit);

  // Strip internal _score from results
  const results: MemoryResult[] = limited.map(({ _score, ...rest }) => rest);

  return { query, results, total };
}
