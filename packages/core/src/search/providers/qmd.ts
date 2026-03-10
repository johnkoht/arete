/**
 * QMD search provider — semantic/hybrid search via QMD CLI.
 * Used when QMD is installed; falls back to token-based provider otherwise.
 */

import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import type { SearchOptions, SearchProvider, SearchResult } from '../types.js';

const execFileAsync = promisify(execFile);

export const QMD_PROVIDER_NAME = 'qmd';

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * QMD CLI returns: { file, snippet, score, docid?, title? }
 * - `file`: path in format `qmd://collection-name/relative/path.md`
 * - `snippet`: text excerpt with context markers like `@@ -10,4 @@`
 * - `score`: relevance score (0-1 for reranked results, may need clamping)
 *
 * Legacy format (for backward compat): { path, content, score }
 */
interface QmdResultRow {
  // Current QMD format
  file?: string;
  snippet?: string;
  // Legacy format (backward compat)
  path?: string;
  content?: string;
  // Common
  score?: number;
  docid?: string;
  title?: string;
  [key: string]: unknown;
}

/**
 * Strip `qmd://collection-name/` prefix from QMD file paths.
 * Returns the relative path portion (e.g., "resources/meetings/foo.md").
 */
function stripQmdPrefix(qmdPath: string): string {
  // Format: qmd://collection-name/relative/path.md
  const match = qmdPath.match(/^qmd:\/\/[^/]+\/(.+)$/);
  return match ? match[1] : qmdPath;
}

/** Parse QMD CLI JSON output into SearchResult[]. Exported for tests. */
export function parseQmdJson(stdout: string): SearchResult[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  try {
    const data = JSON.parse(trimmed);
    const rows = Array.isArray(data) ? data : (data.results != null ? data.results : []);
    return rows
      .filter((r: QmdResultRow) => r && (r.file != null || r.path != null || r.snippet != null || r.content != null))
      .map((r: QmdResultRow) => {
        let score = typeof r.score === 'number' ? r.score : 1;
        if (score > 1 || score < 0) {
          score = Math.max(0, Math.min(1, score));
        }
        // Prefer new field names, fall back to legacy
        const rawPath = typeof r.file === 'string' ? r.file : (typeof r.path === 'string' ? r.path : '');
        const path = stripQmdPrefix(rawPath);
        const content = typeof r.snippet === 'string' ? r.snippet : (typeof r.content === 'string' ? r.content : '');
        return {
          path,
          content,
          score,
          matchType: 'semantic' as const,
        };
      })
      .filter((s: SearchResult) => s.path !== '' || s.content !== '');
  } catch {
    return [];
  }
}

/** Optional test doubles (used only in tests) */
export interface QmdTestDeps {
  whichSync: () => { status: number; stdout?: string };
  execFileAsync: (
    file: string,
    args: string[],
    opts: { timeout: number; cwd: string; maxBuffer: number }
  ) => Promise<{ stdout?: string; stderr?: string }>;
}

/**
 * QMD-backed search provider. isAvailable() checks for qmd binary.
 * search() runs `qmd search`; semanticSearch() runs `qmd query`.
 * Optional testDeps for unit tests (inject mocks).
 */
export function getSearchProvider(
  workspaceRoot: string,
  testDeps?: QmdTestDeps
): SearchProvider {
  const whichSyncImpl = testDeps?.whichSync ?? (() => spawnSync('which', ['qmd'], { encoding: 'utf8' }));
  const execFileAsyncImpl =
    testDeps?.execFileAsync ??
    (async (file: string, args: string[], opts: { timeout: number; cwd: string; maxBuffer: number }) =>
      execFileAsync(file, args, opts) as Promise<{ stdout?: string; stderr?: string }>);

  return {
    name: QMD_PROVIDER_NAME,
    async isAvailable(): Promise<boolean> {
      try {
        const r = whichSyncImpl();
        return r.status === 0 && (r.stdout?.trim()?.length ?? 0) > 0;
      } catch {
        return false;
      }
    },
    async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
      const limit = options?.limit ?? 10;
      try {
        const { stdout } = await execFileAsyncImpl(
          'qmd',
          ['search', query, '--json', '-n', String(limit)],
          { timeout: DEFAULT_TIMEOUT_MS, cwd: workspaceRoot, maxBuffer: 10 * 1024 * 1024 }
        );
        const results = parseQmdJson(stdout ?? '');
        const minScore = options?.minScore ?? 0;
        return results.filter(r => r.score >= minScore).slice(0, limit);
      } catch {
        return [];
      }
    },
    async semanticSearch(query: string, options?: SearchOptions): Promise<SearchResult[]> {
      const limit = options?.limit ?? 10;
      try {
        const { stdout } = await execFileAsyncImpl(
          'qmd',
          ['query', query, '--json', '-n', String(limit)],
          { timeout: DEFAULT_TIMEOUT_MS, cwd: workspaceRoot, maxBuffer: 10 * 1024 * 1024 }
        );
        const results = parseQmdJson(stdout ?? '');
        const minScore = options?.minScore ?? 0;
        return results.filter(r => r.score >= minScore).slice(0, limit);
      } catch {
        return [];
      }
    },
  };
}
