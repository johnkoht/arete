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
import type {
  QmdScope,
  AreteConfig,
  StorageAdapter,
  ResolvedEntity,
  WorkspacePaths,
} from '@arete/core';
import { header, info, error, listItem, warn } from '../formatters.js';

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
    | 'COLLECTION_NOT_FOUND'
    | 'PERSON_NOT_FOUND'
    | 'PERSON_AMBIGUOUS';
  /** Resolution options for PERSON_AMBIGUOUS */
  options?: Array<{ name: string; slug: string; category: string }>;
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

/** Person resolution result for dependency injection */
export interface PersonResolution {
  type: 'single' | 'multiple' | 'none';
  match?: ResolvedEntity;
  matches?: ResolvedEntity[];
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
  /** Resolve person by name/email. Injected for testing. */
  resolvePerson?: (
    name: string,
    services: Awaited<ReturnType<typeof createServices>>,
    paths: WorkspacePaths,
  ) => Promise<PersonResolution>;
}

/** Default person resolution using EntityService */
async function defaultResolvePerson(
  name: string,
  services: Awaited<ReturnType<typeof createServices>>,
  paths: WorkspacePaths,
): Promise<PersonResolution> {
  const candidates = await services.entity.resolveAll(name, 'person', paths, 10);

  if (candidates.length === 0) {
    return { type: 'none' };
  }

  // Check if there's a clear winner (score > 50 points above runner-up)
  // or if the top score is very high (exact match)
  const topScore = candidates[0].score;
  const runnerUpScore = candidates.length > 1 ? candidates[1].score : 0;

  // Exact match (score >= 90) or clear winner (50+ point lead)
  if (topScore >= 90 || (candidates.length === 1) || (topScore - runnerUpScore >= 50)) {
    return { type: 'single', match: candidates[0] };
  }

  // Multiple close matches — ambiguous
  return { type: 'multiple', matches: candidates };
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
    resolvePerson: defaultResolvePerson,
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
    person?: string;
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

  // Resolve person filter if provided
  let personFilter: { name: string; slug: string } | undefined;
  if (opts.person) {
    const paths = services.workspace.getPaths(root);
    const resolvePerson = deps.resolvePerson ?? defaultResolvePerson;
    const resolution = await resolvePerson(opts.person, services, paths);

    if (resolution.type === 'none') {
      if (opts.json) {
        console.log(
          JSON.stringify({
            success: false,
            error: `Person not found: ${opts.person}`,
            code: 'PERSON_NOT_FOUND',
          } satisfies SearchErrorOutput),
        );
      } else {
        error(`Person not found: ${opts.person}`);
        info('Use `arete people list` to see available people.');
      }
      process.exit(1);
    }

    if (resolution.type === 'multiple' && resolution.matches) {
      const options = resolution.matches.map((m) => ({
        name: m.name,
        slug: m.slug ?? m.name.toLowerCase().replace(/\s+/g, '-'),
        category: (m.metadata?.category as string) || 'unknown',
      }));

      if (opts.json) {
        console.log(
          JSON.stringify({
            success: false,
            error: `Ambiguous person reference: "${opts.person}" matches multiple people`,
            code: 'PERSON_AMBIGUOUS',
            options,
          } satisfies SearchErrorOutput),
        );
      } else {
        error(`Ambiguous person reference: "${opts.person}"`);
        info('Multiple matches found:');
        for (const opt of options) {
          listItem(`${opt.name} (${opt.slug}) — ${opt.category}`);
        }
        info('Use a more specific name or the slug directly.');
      }
      process.exit(1);
    }

    // Single match
    if (resolution.match) {
      personFilter = {
        name: resolution.match.name,
        slug: resolution.match.slug ?? resolution.match.name.toLowerCase().replace(/\s+/g, '-'),
      };
    }
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

  // Filter results by person if specified
  if (personFilter) {
    const nameLower = personFilter.name.toLowerCase();
    const slugLower = personFilter.slug.toLowerCase();

    results = results.filter((item) => {
      // Check if path or snippet contains person name/slug
      const pathLower = item.path.toLowerCase();
      const snippetLower = item.snippet.toLowerCase();

      return (
        pathLower.includes(nameLower) ||
        pathLower.includes(slugLower) ||
        snippetLower.includes(nameLower) ||
        snippetLower.includes(slugLower)
      );
    });
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
    .option('--person <name>', 'Filter by person (name or slug)')
    .option('--json', 'Output JSON')
    .action(
      async (
        query: string,
        opts: { scope?: string; limit?: string; person?: string; json?: boolean },
      ) => {
        await runSearch(query, opts);
      },
    );
}
