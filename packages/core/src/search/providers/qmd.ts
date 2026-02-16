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

/** QMD CLI may return array of { path?, content?, score? } */
interface QmdResultRow {
  path?: string;
  content?: string;
  score?: number;
  [key: string]: unknown;
}

/** Parse QMD CLI JSON output into SearchResult[]. Exported for tests. */
export function parseQmdJson(stdout: string): SearchResult[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  try {
    const data = JSON.parse(trimmed);
    const rows = Array.isArray(data) ? data : (data.results != null ? data.results : []);
    return rows
      .filter((r: QmdResultRow) => r && (r.path != null || r.content != null))
      .map((r: QmdResultRow) => {
        let score = typeof r.score === 'number' ? r.score : 1;
        if (score > 1 || score < 0) {
          score = Math.max(0, Math.min(1, score));
        }
        return {
          path: typeof r.path === 'string' ? r.path : '',
          content: typeof r.content === 'string' ? r.content : '',
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
