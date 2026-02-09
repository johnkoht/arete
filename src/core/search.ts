/**
 * Search Provider — abstract interface for workspace search.
 * Supports keyword and semantic search with swappable backends (QMD, token-based fallback).
 */

import { spawnSync } from 'child_process';
import { getSearchProvider as getFallbackProvider } from './search-providers/fallback.js';
import { getSearchProvider as getQmdProvider } from './search-providers/qmd.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchMatchType = 'keyword' | 'semantic' | 'hybrid';

export interface SearchResult {
  path: string;
  content: string;
  score: number;
  matchType: SearchMatchType;
}

export interface SearchOptions {
  limit?: number;
  paths?: string[];
  minScore?: number;
}

export interface SearchProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  semanticSearch(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

// ---------------------------------------------------------------------------
// Shared tokenizer (extracted from memory-retrieval / context-injection)
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'for', 'with', 'my', 'me', 'i', 'to', 'and', 'or', 'is', 'it',
  'in', 'on', 'at', 'of', 'this', 'that', 'what', 'how', 'can', 'you', 'please',
  'want', 'need', 'create', 'build', 'start', 'run', 'do', 'help',
]);

/**
 * Tokenize text for search: lowercase, strip punctuation, split on whitespace,
 * filter stop words and single-character tokens.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Return the best available search provider.
 * Checks QMD first (when available), falls back to token-based provider.
 *
 * @param workspaceRoot - Workspace root path (used by providers that need it)
 */
export function getSearchProvider(workspaceRoot: string): SearchProvider {
  try {
    const r = spawnSync('which', ['qmd'], { encoding: 'utf8' });
    if (r.status === 0 && (r.stdout?.trim()?.length ?? 0) > 0) {
      return getQmdProvider(workspaceRoot);
    }
  } catch {
    // ignore
  }
  return getFallbackProvider(workspaceRoot);
}
