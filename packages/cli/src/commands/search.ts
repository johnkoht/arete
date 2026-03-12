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
 *
 * TimelineOutput (--timeline flag):
 * ```typescript
 * interface TimelineOutput {
 *   success: boolean;
 *   query: string;
 *   scope: QmdScope;
 *   items: Array<{ date: string; title: string; source: string; type: string }>;
 *   themes: string[];
 *   dateRange: { start: string; end: string };
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
  DateRange,
  MemoryTimeline,
} from '@arete/core';
import { header, info, error, listItem, warn } from '../formatters.js';

const execFileAsync = promisify(execFile);

/** Timeout for QMD queries (10s) - queries are typically fast */
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
    | 'PERSON_AMBIGUOUS'
    | 'INVALID_FLAGS'
    | 'TIMELINE_ERROR';
  /** Resolution options for PERSON_AMBIGUOUS */
  options?: Array<{ name: string; slug: string; category: string }>;
}

/** Timeline item in output */
export interface TimelineOutputItem {
  date: string;
  title: string;
  source: string;
  type: string;
}

/**
 * Timeline output schema (--timeline flag)
 *
 * dateRange reflects actual data bounds:
 * - start/end are empty strings when no items match
 * - when items exist, start is the earliest date and end is the latest
 */
export interface TimelineOutput {
  success: boolean;
  query: string;
  scope: QmdScope;
  items: TimelineOutputItem[];
  themes: string[];
  dateRange: {
    start: string;
    end: string;
  };
}

/** Answer output schema (--answer flag) */
export interface AnswerOutput {
  success: boolean;
  query: string;
  scope: QmdScope;
  results: SearchResultItem[];
  /** AI-synthesized answer, null if AI not configured or synthesis failed */
  answer: string | null;
  /** Derived intent passed to QMD (if any) */
  intent?: string;
  /** Error message if synthesis failed */
  error?: string;
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

/**
 * Strip QMD URL prefix to get workspace-relative path.
 * Assumes QMD returns URLs in format: qmd://<collection>/<path>
 * If format changes, this regex will need updating.
 */
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

/**
 * Derive intent from query patterns.
 * Used to pass --intent to QMD for better semantic matching.
 */
export function deriveIntent(query: string): string | undefined {
  if (/what did we decide/i.test(query)) return 'past decisions and rationale';
  if (/who should I talk to/i.test(query)) return 'finding people or contacts';
  if (/why did we/i.test(query)) return 'historical context and reasoning';
  if (/when did we/i.test(query)) return 'timeline and dates of events';
  if (/what (is|are)/i.test(query)) return 'definitions and explanations';
  if (/how do we/i.test(query)) return 'processes and procedures';
  return undefined;
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

/** Mockable AI service interface for testing */
export interface MockableAIService {
  isConfigured(): boolean;
  call(
    task: 'summary' | 'extraction' | 'decision_extraction' | 'learning_extraction' | 'significance_analysis' | 'reconciliation',
    prompt: string,
  ): Promise<{ text: string }>;
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
  /** Get timeline from memory service. Injected for testing. */
  getTimeline?: (
    query: string,
    paths: WorkspacePaths,
    range?: DateRange,
    services?: Awaited<ReturnType<typeof createServices>>,
  ) => Promise<MemoryTimeline>;
  /** Override AI service for testing. */
  ai?: MockableAIService;
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
 * Compute start date for --days filter.
 * Returns YYYY-MM-DD string for N days ago.
 */
function computeDateRangeStart(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
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
    timeline?: boolean;
    days?: string;
    answer?: boolean;
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
    const scopeMsg =
      scope === 'all'
        ? `No QMD collection configured. Run \`arete update\` to create collections.`
        : `Collection not found for scope '${scope}'. Run \`arete update\` to create scoped collections, or use --scope all.`;
    if (opts.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: scopeMsg,
          code: 'COLLECTION_NOT_FOUND',
        } satisfies SearchErrorOutput),
      );
    } else {
      error(scopeMsg);
    }
    process.exit(1);
  }

  // Check for mutually exclusive flags
  if (opts.timeline && opts.answer) {
    if (opts.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: '--timeline and --answer are mutually exclusive',
          code: 'INVALID_FLAGS',
        } satisfies SearchErrorOutput),
      );
    } else {
      error('--timeline and --answer are mutually exclusive');
    }
    process.exit(1);
  }

  // Validate --days flag
  if (opts.days) {
    const parsedDays = parseInt(opts.days, 10);
    if (isNaN(parsedDays) || parsedDays < 0) {
      if (opts.json) {
        console.log(
          JSON.stringify({
            success: false,
            error: `Invalid --days value: ${opts.days}. Must be a non-negative integer.`,
            code: 'INVALID_FLAGS',
          } satisfies SearchErrorOutput),
        );
      } else {
        error(`Invalid --days value: ${opts.days}. Must be a non-negative integer.`);
      }
      process.exit(1);
    }
  }

  // Warn if --days is used without --timeline (it has no effect)
  if (opts.days && !opts.timeline) {
    warn('--days has no effect without --timeline');
  }

  // Timeline mode — uses MemoryService.getTimeline() instead of QMD
  if (opts.timeline) {
    const paths = services.workspace.getPaths(root);
    
    // Build date range for --days filter
    let range: DateRange | undefined;
    if (opts.days) {
      const days = parseInt(opts.days, 10);
      if (!isNaN(days) && days >= 0) {
        range = {
          start: computeDateRangeStart(days),
          end: new Date().toISOString().slice(0, 10),
        };
      }
    }

    // Get timeline from MemoryService
    let timeline: MemoryTimeline;
    try {
      const getTimeline = deps.getTimeline ?? (async (q, p, r) => services.memory.getTimeline(q, p, r));
      timeline = await getTimeline(query, paths, range, services);
    } catch (err) {
      const message = `Timeline failed: ${err instanceof Error ? err.message : String(err)}`;
      if (opts.json) {
        console.log(
          JSON.stringify({
            success: false,
            error: message,
            code: 'TIMELINE_ERROR',
          } satisfies SearchErrorOutput),
        );
      } else {
        error(message);
      }
      process.exit(1);
    }

    // Apply person filter if specified
    let filteredItems = timeline.items;
    if (personFilter) {
      const nameLower = personFilter.name.toLowerCase();
      const slugLower = personFilter.slug.toLowerCase();
      filteredItems = timeline.items.filter((item) => {
        const titleLower = item.title.toLowerCase();
        const contentLower = item.content.toLowerCase();
        const sourceLower = item.source.toLowerCase();
        return (
          titleLower.includes(nameLower) ||
          titleLower.includes(slugLower) ||
          contentLower.includes(nameLower) ||
          contentLower.includes(slugLower) ||
          sourceLower.includes(nameLower) ||
          sourceLower.includes(slugLower)
        );
      });
    }

    // Apply scope filter for timeline items (memory/meetings only have real data)
    if (scope === 'memory') {
      filteredItems = filteredItems.filter((item) => item.type !== 'meeting');
    } else if (scope === 'meetings') {
      filteredItems = filteredItems.filter((item) => item.type === 'meeting');
    }

    // Map to output schema
    const outputItems: TimelineOutputItem[] = filteredItems.map((item) => ({
      date: item.date,
      title: item.title,
      source: item.source,
      type: item.type,
    }));

    // Calculate effective date range from filtered items
    // Returns empty strings when no items match (reflects actual data bounds, not query range)
    const dates = filteredItems.map((i) => i.date).filter((d) => d.length > 0);
    const effectiveDateRange = {
      start: dates.length > 0 ? dates[dates.length - 1] : '',
      end: dates.length > 0 ? dates[0] : '',
    };

    // JSON output
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            success: true,
            query,
            scope,
            items: outputItems,
            themes: timeline.themes,
            dateRange: effectiveDateRange,
          } satisfies TimelineOutput,
          null,
          2,
        ),
      );
      return;
    }

    // Human-readable output
    header('Timeline Results');
    console.log(chalk.dim(`  Query: "${query}"`));
    console.log(chalk.dim(`  Scope: ${scope}`));
    if (range?.start) {
      console.log(chalk.dim(`  Date range: ${effectiveDateRange.start} to ${effectiveDateRange.end}`));
    }
    console.log(chalk.dim(`  Found: ${outputItems.length} item(s)`));
    console.log('');

    // Show recurring themes
    if (timeline.themes.length > 0) {
      console.log(chalk.bold('  Recurring Themes:'));
      for (const theme of timeline.themes) {
        console.log(chalk.cyan(`    • ${theme}`));
      }
      console.log('');
    }

    if (outputItems.length === 0) {
      info('No timeline items found');
      return;
    }

    // Group items by date for display
    const itemsByDate = new Map<string, TimelineOutputItem[]>();
    for (const item of outputItems) {
      const dateKey = item.date || 'Unknown date';
      const existing = itemsByDate.get(dateKey) ?? [];
      existing.push(item);
      itemsByDate.set(dateKey, existing);
    }

    // Display items grouped by date (newest first)
    const sortedDates = Array.from(itemsByDate.keys()).sort((a, b) => b.localeCompare(a));
    for (const dateKey of sortedDates) {
      console.log(chalk.bold(`  ${dateKey}`));
      const items = itemsByDate.get(dateKey) ?? [];
      for (const item of items) {
        const typeTag = chalk.dim(`[${item.type}]`);
        console.log(`    ${typeTag} ${item.title}`);
        console.log(chalk.dim(`      ${item.source}`));
      }
      console.log('');
    }

    return;
  }

  // Check QMD availability (only needed for non-timeline mode)
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

  // Validate and parse --limit
  const parsedLimit = opts.limit ? parseInt(opts.limit, 10) : 15;
  if (isNaN(parsedLimit) || parsedLimit <= 0) {
    if (opts.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: `Invalid --limit value: ${opts.limit}. Must be a positive integer.`,
          code: 'INVALID_FLAGS',
        } satisfies SearchErrorOutput),
      );
    } else {
      error(`Invalid --limit value: ${opts.limit}. Must be a positive integer.`);
    }
    process.exit(1);
  }
  const limit = parsedLimit;

  // Build QMD command
  const args = ['query', query, '--json', '-n', String(limit)];
  if (scope !== 'all') {
    args.push('-c', collectionName);
  }

  // Derive intent from query patterns for --answer mode
  const intent = opts.answer ? deriveIntent(query) : undefined;
  if (intent) {
    args.push('--intent', intent);
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

  // Handle --answer mode: AI synthesis
  if (opts.answer) {
    const aiService = deps.ai ?? services.ai;
    
    // Check if AI is configured
    if (!aiService.isConfigured()) {
      // Warn but still return results
      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              query,
              scope,
              results,
              answer: null,
              intent,
              error: 'AI not configured. Run `arete credentials configure` to enable --answer.',
            } satisfies AnswerOutput,
            null,
            2,
          ),
        );
      } else {
        warn('AI not configured. Run `arete credentials configure` to enable --answer.');
        header('Search Results');
        console.log(chalk.dim(`  Query: "${query}"`));
        console.log(chalk.dim(`  Scope: ${scope}`));
        console.log(chalk.dim(`  Found: ${results.length} result(s)`));
        console.log('');
        for (const item of results) {
          const scoreStr = chalk.dim(`(${(item.score * 100).toFixed(0)}%)`);
          console.log(`  ${chalk.bold(item.title)} ${scoreStr}`);
          console.log(chalk.dim(`    ${item.path}`));
          const snippetPreview = item.snippet.slice(0, 120).replace(/\n/g, ' ');
          if (snippetPreview) {
            console.log(chalk.dim(`    ${snippetPreview}...`));
          }
          console.log('');
        }
      }
      return;
    }

    // Synthesize answer from results
    let synthesizedAnswer: string | null = null;
    let synthesisError: string | undefined;

    if (results.length > 0) {
      try {
        // Build context from search results
        const resultsContext = results
          .slice(0, 10) // Limit to top 10 for prompt
          .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}`)
          .join('\n\n');

        const prompt = `Based on these search results for "${query}", provide a concise, helpful answer. Cite sources by number when relevant.

${resultsContext}

Provide a synthesized answer:`;

        const response = await aiService.call('summary', prompt);
        synthesizedAnswer = response.text;
      } catch (err) {
        synthesisError = err instanceof Error ? err.message : 'AI synthesis failed';
        if (!opts.json) {
          warn(`AI synthesis failed: ${synthesisError}`);
        }
      }
    }

    // Output with answer
    if (opts.json) {
      const output: AnswerOutput = {
        success: true,
        query,
        scope,
        results,
        answer: synthesizedAnswer,
      };
      if (intent) {
        output.intent = intent;
      }
      if (synthesisError) {
        output.error = synthesisError;
      }
      console.log(JSON.stringify(output, null, 2));
    } else {
      header('Search Results');
      console.log(chalk.dim(`  Query: "${query}"`));
      console.log(chalk.dim(`  Scope: ${scope}`));
      console.log(chalk.dim(`  Found: ${results.length} result(s)`));
      console.log('');

      // Show answer first if available
      if (synthesizedAnswer) {
        console.log(chalk.bold('  Answer:'));
        console.log(`  ${synthesizedAnswer.replace(/\n/g, '\n  ')}`);
        console.log('');
        console.log(chalk.dim('  ---'));
        console.log('');
      }

      // Show results
      if (results.length === 0) {
        info('No matching results found');
      } else {
        for (const item of results) {
          const scoreStr = chalk.dim(`(${(item.score * 100).toFixed(0)}%)`);
          console.log(`  ${chalk.bold(item.title)} ${scoreStr}`);
          console.log(chalk.dim(`    ${item.path}`));
          const snippetPreview = item.snippet.slice(0, 120).replace(/\n/g, ' ');
          if (snippetPreview) {
            console.log(chalk.dim(`    ${snippetPreview}...`));
          }
          console.log('');
        }
      }
    }
    return;
  }

  // Standard output (no --answer)
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
    .option('--person <name>', 'Filter by person (name or slug) (Note: filtering happens after limit, so fewer results may be returned)')
    .option('--timeline', 'Show results chronologically with themes')
    .option('--days <n>', 'Limit to last N days (with --timeline)')
    .option('--answer', 'Synthesize AI-powered answer from results')
    .option('--json', 'Output JSON')
    .action(
      async (
        query: string,
        opts: {
          scope?: string;
          limit?: string;
          person?: string;
          timeline?: boolean;
          days?: string;
          answer?: boolean;
          json?: boolean;
        },
      ) => {
        await runSearch(query, opts);
      },
    );
}
