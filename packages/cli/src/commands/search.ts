/**
 * Search command — unified semantic search across workspace.
 *
 * Replaces fragmented `context --for`, `memory search`, and `memory timeline` commands
 * with a single `arete search` command supporting scope filtering via QMD collections.
 *
 * Output schemas (see dev/work/plans/consolidate-search-command/design-notes.md):
 *
 * Default SearchOutput:
 * ```typescript
 * interface SearchOutput {
 *   success: boolean;
 *   query: string;
 *   scope: QmdScope;
 *   results: Array<{ path: string; title: string; snippet: string; score: number }>;
 *   total: number;
 * }
 * ```
 */

import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import type { Command } from 'commander';
import chalk from 'chalk';

import { createServices, loadConfig } from '@arete/core';
import type { QmdScope, AreteConfig, StorageAdapter } from '@arete/core';
import { header, info, error, listItem } from '../formatters.js';

const execFileAsync = promisify(execFile);

const QMD_QUERY_TIMEOUT_MS = 10_000;

/** Valid scope values for --scope flag */
const VALID_SCOPES: readonly QmdScope[] = [
  'all',
  'memory',
  'meetings',
  'context',
  'projects',
  'people',
] as const;

/** Search result item */
export interface SearchResultItem {
  /** Relative path to matching file */
  path: string;
  /** Extracted title or filename */
  title: string;
  /** Context snippet around match */
  snippet: string;
  /** Relevance score (0-1) */
  score: number;
}

/** Default search output schema */
export interface SearchOutput {
  success: boolean;
  query: string;
  scope: QmdScope;
  results: SearchResultItem[];
  /** Total matches (may exceed results.length due to --limit) */
  total: number;
}

/** Error output schema */
export interface SearchErrorOutput {
  success: false;
  error: string;
  code?:
    | 'QMD_NOT_AVAILABLE'
    | 'WORKSPACE_NOT_FOUND'
    | 'INVALID_SCOPE'
    | 'COLLECTION_NOT_FOUND';
}

/**
 * QMD CLI returns: { file, snippet, score, docid?, title? }
 * - `file`: path in format `qmd://collection-name/relative/path.md`
 * - `snippet`: text excerpt with context markers like `@@ -10,4 @@`
 * - `score`: relevance score (0-1 for reranked results, may need clamping)
 */
interface QmdResultRow {
  file?: string;
  snippet?: string;
  path?: string;
  content?: string;
  score?: number;
  title?: string;
}

/** Strip `qmd://collection-name/` prefix from QMD file paths. */
function stripQmdPrefix(qmdPath: string): string {
  const match = qmdPath.match(/^qmd:\/\/[^/]+\/(.+)$/);
  return match ? match[1] : qmdPath;
}

/**
 * Extract title from content or path.
 * Looks for first heading or falls back to filename.
 */
function extractTitle(snippet: string, path: string): string {
  // Try to find a heading in the snippet
  const headingMatch = snippet.match(/^#{1,3}\s+(.+)$/m);
  if (headingMatch) {
    return headingMatch[1].trim();
  }
  // Fall back to filename without extension
  const filename = path.split('/').pop() || path;
  return filename.replace(/\.md$/, '').replace(/-/g, ' ');
}

/** Parse QMD CLI JSON output into SearchResultItem[]. */
export function parseQmdResults(stdout: string): SearchResultItem[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  try {
    const data = JSON.parse(trimmed);
    const rows: QmdResultRow[] = Array.isArray(data)
      ? data
      : data.results != null
        ? data.results
        : [];
    return rows
      .filter(
        (r) =>
          r &&
          (r.file != null ||
            r.path != null ||
            r.snippet != null ||
            r.content != null),
      )
      .map((r) => {
        let score = typeof r.score === 'number' ? r.score : 1;
        if (score > 1 || score < 0) {
          score = Math.max(0, Math.min(1, score));
        }
        const rawPath =
          typeof r.file === 'string'
            ? r.file
            : typeof r.path === 'string'
              ? r.path
              : '';
        const path = stripQmdPrefix(rawPath);
        const snippet =
          typeof r.snippet === 'string'
            ? r.snippet
            : typeof r.content === 'string'
              ? r.content
              : '';
        const title = r.title || extractTitle(snippet, path);
        return { path, title, snippet, score };
      })
      .filter((s) => s.path !== '' || s.snippet !== '');
  } catch {
    return [];
  }
}

/** Injectable test dependencies */
export interface SearchDeps {
  createServices: typeof createServices;
  loadConfig: (
    storage: StorageAdapter,
    workspacePath: string | null,
  ) => Promise<AreteConfig>;
  execFileAsync: (
    file: string,
    args: string[],
    opts: { timeout: number; cwd: string; maxBuffer?: number },
  ) => Promise<{ stdout: string; stderr: string }>;
  isQmdAvailable: () => boolean;
}

/** Default dependencies */
function getDefaultDeps(): SearchDeps {
  return {
    createServices,
    loadConfig,
    execFileAsync: async (file, args, opts) => {
      const result = await execFileAsync(file, args, opts);
      return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
    },
    isQmdAvailable: () => {
      try {
        const r = spawnSync('which', ['qmd'], { encoding: 'utf8' });
        return r.status === 0 && (r.stdout?.trim()?.length ?? 0) > 0;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Run search command logic. Exported for testing.
 */
export async function runSearch(
  query: string,
  opts: {
    scope?: string;
    limit?: string;
    json?: boolean;
  },
  deps: SearchDeps = getDefaultDeps(),
): Promise<void> {
  const services = await deps.createServices(process.cwd());
  const root = await services.workspace.findRoot();

  // Check workspace
  if (!root) {
    if (opts.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: 'Not in an Areté workspace',
          code: 'WORKSPACE_NOT_FOUND',
        } satisfies SearchErrorOutput),
      );
    } else {
      error('Not in an Areté workspace');
    }
    process.exit(1);
  }

  // Validate scope
  const scope = (opts.scope ?? 'all') as QmdScope;
  if (!VALID_SCOPES.includes(scope)) {
    if (opts.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: `Invalid scope: ${scope}. Valid scopes: ${VALID_SCOPES.join(', ')}`,
          code: 'INVALID_SCOPE',
        } satisfies SearchErrorOutput),
      );
    } else {
      error(`Invalid scope: ${scope}`);
      info(`Valid scopes: ${VALID_SCOPES.join(', ')}`);
    }
    process.exit(1);
  }

  // Check QMD availability
  if (!deps.isQmdAvailable()) {
    if (opts.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: 'qmd not installed. Install with: cargo install qmd',
          code: 'QMD_NOT_AVAILABLE',
        } satisfies SearchErrorOutput),
      );
    } else {
      error('qmd not installed');
      info('Install with: cargo install qmd');
    }
    process.exit(1);
  }

  // Load config to get collection name
  const config = await deps.loadConfig(services.storage, root);
  const collections = config.qmd_collections;

  // Get collection name for scope
  let collectionName: string | undefined;
  if (collections) {
    collectionName = collections[scope];
  }
  // Fall back to old single-collection config for 'all' scope
  if (!collectionName && scope === 'all' && config.qmd_collection) {
    collectionName = config.qmd_collection;
  }

  if (!collectionName) {
    if (opts.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: `No QMD collection configured for scope: ${scope}. Run 'arete update' to create collections.`,
          code: 'COLLECTION_NOT_FOUND',
        } satisfies SearchErrorOutput),
      );
    } else {
      error(`No QMD collection configured for scope: ${scope}`);
      info("Run 'arete update' to create collections.");
    }
    process.exit(1);
  }

  // Build QMD command
  const limit = opts.limit ? parseInt(opts.limit, 10) : 15;
  const args = ['query', query, '--json', '-n', String(limit)];
  if (scope !== 'all') {
    args.push('-c', collectionName);
  }

  // Execute QMD query
  let results: SearchResultItem[] = [];
  try {
    const { stdout } = await deps.execFileAsync('qmd', args, {
      timeout: QMD_QUERY_TIMEOUT_MS,
      cwd: root,
      maxBuffer: 10 * 1024 * 1024,
    });
    results = parseQmdResults(stdout);
  } catch (err) {
    // QMD query failed — return empty results rather than failing
    // (consistent with qmd.ts provider behavior)
    results = [];
  }

  // Output
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          success: true,
          query,
          scope,
          results,
          total: results.length,
        } satisfies SearchOutput,
        null,
        2,
      ),
    );
    return;
  }

  // Human-readable output
  header('Search Results');
  console.log(chalk.dim(`  Query: "${query}"`));
  console.log(chalk.dim(`  Scope: ${scope}`));
  console.log(chalk.dim(`  Found: ${results.length} result(s)`));
  console.log('');

  if (results.length === 0) {
    info('No matching results found');
    return;
  }

  for (const item of results) {
    const scoreStr = chalk.dim(`(${(item.score * 100).toFixed(0)}%)`);
    console.log(`  ${chalk.bold(item.title)} ${scoreStr}`);
    console.log(chalk.dim(`    ${item.path}`));
    // Show truncated snippet
    const snippetPreview = item.snippet.slice(0, 120).replace(/\n/g, ' ');
    if (snippetPreview) {
      console.log(chalk.dim(`    ${snippetPreview}...`));
    }
    console.log('');
  }
}

export function registerSearchCommand(program: Command): void {
  program
    .command('search <query>')
    .description('Search across workspace with semantic matching')
    .option(
      '--scope <scope>',
      'Limit to scope (all|memory|meetings|context|projects|people)',
      'all',
    )
    .option('--limit <n>', 'Maximum results', '15')
    .option('--json', 'Output JSON')
    .action(
      async (
        query: string,
        opts: { scope?: string; limit?: string; json?: boolean },
      ) => {
        await runSearch(query, opts);
      },
    );
}
