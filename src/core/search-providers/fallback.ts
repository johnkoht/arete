/**
 * Fallback search provider — token-based keyword matching.
 * Used when QMD is not available. Scans .md files, scores by token overlap.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { tokenize } from '../search.js';
import type { SearchOptions, SearchProvider, SearchResult } from '../search.js';

export const FALLBACK_PROVIDER_NAME = 'fallback';

const DEFAULT_LIMIT = 10;
const DEFAULT_MIN_SCORE = 0;

/** Recursively list .md files under dir (skips dot-dirs) */
function listMdFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_')) {
        results.push(...listMdFiles(full));
      } else if (e.isFile() && e.name.endsWith('.md')) {
        results.push(full);
      }
    }
  } catch {
    // skip unreadable
  }
  return results;
}

/** Extract title (first # line or filename) and body from file content */
function splitTitleAndBody(content: string, filePath: string): { title: string; body: string } {
  const lines = content.split('\n');
  let title = '';
  const bodyLines: string[] = [];
  for (const line of lines) {
    const m = line.match(/^#+\s*(.+)/);
    if (m && !title) {
      title = m[1].trim();
    } else {
      bodyLines.push(line);
    }
  }
  if (!title) {
    const base = filePath.split(/[/\\]/).pop() ?? '';
    title = base.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
  }
  return { title, body: bodyLines.join('\n') };
}

/** Raw score: title 3 per token, body 1 per token, bonus for multiple token overlap */
function scoreFile(title: string, body: string, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const titleLower = title.toLowerCase();
  const bodyLower = body.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (titleLower.includes(token)) {
      score += 3;
    } else if (bodyLower.includes(token)) {
      score += 1;
    }
  }
  const combined = titleLower + ' ' + bodyLower;
  const matchCount = queryTokens.filter(t => combined.includes(t)).length;
  if (matchCount > 1) {
    score += matchCount;
  }
  return score;
}

/**
 * Token-based search provider. isAvailable() always true.
 * search() scans .md files and scores by token overlap; semanticSearch() delegates to search().
 */
export function getSearchProvider(workspaceRoot: string): SearchProvider {
  return {
    name: FALLBACK_PROVIDER_NAME,
    async isAvailable(): Promise<boolean> {
      return true;
    },
    async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
      const limit = options?.limit ?? DEFAULT_LIMIT;
      const minScore = options?.minScore ?? DEFAULT_MIN_SCORE;
      const scopePaths = options?.paths?.length
        ? options.paths.map(p => join(workspaceRoot, p))
        : [workspaceRoot];

      const queryTokens = tokenize(query);
      if (queryTokens.length === 0) {
        return [];
      }

      const allPaths = new Set<string>();
      for (const scope of scopePaths) {
        if (!existsSync(scope)) continue;
        try {
          const stat = statSync(scope);
          if (stat.isFile() && scope.endsWith('.md')) {
            allPaths.add(scope);
          } else if (stat.isDirectory()) {
            listMdFiles(scope).forEach(p => allPaths.add(p));
          }
        } catch {
          // skip
        }
      }

      const scored: { path: string; content: string; rawScore: number }[] = [];
      for (const filePath of allPaths) {
        let content: string;
        try {
          content = readFileSync(filePath, 'utf8');
        } catch {
          continue;
        }
        const { title, body } = splitTitleAndBody(content, filePath);
        const rawScore = scoreFile(title, body, queryTokens);
        if (rawScore > 0) {
          scored.push({ path: filePath, content, rawScore });
        }
      }

      scored.sort((a, b) => b.rawScore - a.rawScore);
      const maxRaw = scored.length > 0 ? Math.max(...scored.map(s => s.rawScore)) : 1;
      const results: SearchResult[] = [];
      for (let i = 0; i < scored.length && results.length < limit; i++) {
        const s = scored[i];
        const score = maxRaw > 0 ? s.rawScore / maxRaw : 0;
        if (score < minScore) continue;
        results.push({
          path: s.path,
          content: s.content,
          score,
          matchType: 'keyword',
        });
      }
      return results;
    },
    async semanticSearch(query: string, options?: SearchOptions): Promise<SearchResult[]> {
      return this.search(query, options);
    },
  };
}
