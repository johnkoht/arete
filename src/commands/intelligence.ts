/**
 * Intelligence service CLI commands — context, memory, resolve, brief
 *
 * These commands expose the intelligence services (Phase 3) for
 * testing, scripting, and agent use.
 */

import chalk from 'chalk';
import { findWorkspaceRoot, getWorkspacePaths } from '../core/workspace.js';
import { getRelevantContext } from '../core/context-injection.js';
import { searchMemory } from '../core/memory-retrieval.js';
import { resolveEntity, resolveEntities } from '../core/entity-resolution.js';
import { assembleBriefing } from '../core/briefing.js';
import { success, error, info, header, listItem } from '../core/utils.js';
import type {
  CommandOptions,
  ProductPrimitive,
  EntityType,
} from '../types.js';
import { PRODUCT_PRIMITIVES } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireWorkspace(json?: boolean): { root: string; paths: ReturnType<typeof getWorkspacePaths> } {
  const root = findWorkspaceRoot();
  if (!root) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
    }
    process.exit(1);
  }
  return { root, paths: getWorkspacePaths(root) };
}

function parsePrimitives(raw?: string): ProductPrimitive[] | undefined {
  if (!raw) return undefined;
  const names = raw.split(',').map(s => s.trim());
  const valid = names.filter(n =>
    (PRODUCT_PRIMITIVES as readonly string[]).includes(n)
  ) as ProductPrimitive[];
  return valid.length > 0 ? valid : undefined;
}

// ---------------------------------------------------------------------------
// arete context --for "query"
// ---------------------------------------------------------------------------

export interface ContextCommandOptions extends CommandOptions {
  for?: string;
  primitives?: string;
}

export async function contextCommand(options: ContextCommandOptions): Promise<void> {
  const { json } = options;
  const query = options.for;

  if (!query?.trim()) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Missing --for. Usage: arete context --for "create a PRD for search"' }));
    } else {
      error('Missing --for option');
      info('Usage: arete context --for "create a PRD for search"');
    }
    process.exit(1);
  }

  const { paths } = requireWorkspace(json);
  const primitives = parsePrimitives(options.primitives);
  const result = getRelevantContext(query, paths, { primitives });

  if (json) {
    console.log(JSON.stringify({
      success: true,
      query,
      confidence: result.confidence,
      filesCount: result.files.length,
      gapsCount: result.gaps.length,
      primitives: result.primitives,
      files: result.files.map(f => ({
        relativePath: f.relativePath,
        primitive: f.primitive,
        category: f.category,
        summary: f.summary,
      })),
      gaps: result.gaps,
    }, null, 2));
    return;
  }

  header('Context Injection');
  console.log(chalk.dim(`  Query: ${query}`));
  console.log(chalk.dim(`  Confidence: ${result.confidence}`));
  console.log(chalk.dim(`  Primitives: ${result.primitives.join(', ')}`));
  console.log('');

  if (result.files.length > 0) {
    console.log(chalk.bold('  Files:'));
    for (const f of result.files) {
      const prim = f.primitive ? chalk.cyan(` [${f.primitive}]`) : '';
      console.log(`    ${chalk.dim('•')} ${f.relativePath}${prim}`);
      if (f.summary) {
        console.log(`      ${chalk.dim(f.summary.slice(0, 100))}`);
      }
    }
    console.log('');
  }

  if (result.gaps.length > 0) {
    console.log(chalk.bold('  Gaps:'));
    for (const g of result.gaps) {
      const prim = g.primitive ? chalk.yellow(` [${g.primitive}]`) : '';
      console.log(`    ${chalk.dim('•')} ${g.description}${prim}`);
      if (g.suggestion) {
        console.log(`      ${chalk.dim(`→ ${g.suggestion}`)}`);
      }
    }
    console.log('');
  }
}

// ---------------------------------------------------------------------------
// arete memory search "query"
// ---------------------------------------------------------------------------

export interface MemorySearchCommandOptions extends CommandOptions {
  types?: string;
  limit?: string;
}

export async function memorySearchCommand(
  query: string,
  options: MemorySearchCommandOptions
): Promise<void> {
  const { json } = options;

  if (!query?.trim()) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Missing query. Usage: arete memory search "onboarding"' }));
    } else {
      error('Missing query');
      info('Usage: arete memory search "onboarding"');
    }
    process.exit(1);
  }

  const { paths } = requireWorkspace(json);
  const types = options.types
    ? options.types.split(',').map(s => s.trim()) as ('decisions' | 'learnings' | 'observations')[]
    : undefined;
  const limit = options.limit ? parseInt(options.limit, 10) : undefined;
  const result = searchMemory(query, paths, { types, limit });

  if (json) {
    console.log(JSON.stringify({
      success: true,
      query,
      total: result.total,
      results: result.results,
    }, null, 2));
    return;
  }

  header('Memory Search');
  console.log(chalk.dim(`  Query: ${query}`));
  console.log(chalk.dim(`  Found: ${result.total} result(s)`));
  console.log('');

  if (result.results.length === 0) {
    info('No matching memory items found');
    return;
  }

  for (const item of result.results) {
    const dateStr = item.date ? chalk.dim(`[${item.date}] `) : '';
    const typeColor = item.type === 'decisions' ? chalk.cyan : item.type === 'learnings' ? chalk.green : chalk.yellow;
    const titleMatch = item.content.match(/^###\s+(?:\d{4}-\d{2}-\d{2}:\s*)?(.+)/m);
    const title = titleMatch ? titleMatch[1].trim() : item.content.slice(0, 80);
    console.log(`  ${dateStr}${typeColor(`[${item.type}]`)} ${title}`);
    console.log(chalk.dim(`    Source: ${item.source} | ${item.relevance}`));
    console.log('');
  }
}

// ---------------------------------------------------------------------------
// arete resolve "reference"
// ---------------------------------------------------------------------------

export interface ResolveCommandOptions extends CommandOptions {
  type?: string;
  all?: boolean;
}

export async function resolveCommand(
  reference: string,
  options: ResolveCommandOptions
): Promise<void> {
  const { json } = options;

  if (!reference?.trim()) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Missing reference. Usage: arete resolve "Jane"' }));
    } else {
      error('Missing reference');
      info('Usage: arete resolve "Jane"');
    }
    process.exit(1);
  }

  const { paths } = requireWorkspace(json);
  const entityType = (options.type || 'any') as EntityType;

  if (options.all) {
    const results = resolveEntities(reference, entityType, paths, 10);

    if (json) {
      console.log(JSON.stringify({
        success: true,
        reference,
        entityType,
        results: results.map(r => ({
          type: r.type,
          name: r.name,
          slug: r.slug,
          path: r.path,
          score: r.score,
          metadata: r.metadata,
        })),
      }, null, 2));
      return;
    }

    header('Entity Resolution');
    console.log(chalk.dim(`  Reference: "${reference}"`));
    console.log(chalk.dim(`  Type: ${entityType}`));
    console.log(chalk.dim(`  Found: ${results.length} match(es)`));
    console.log('');

    for (const r of results) {
      const typeColor = r.type === 'person' ? chalk.cyan : r.type === 'meeting' ? chalk.green : chalk.yellow;
      console.log(`  ${typeColor(`[${r.type}]`)} ${chalk.bold(r.name)} ${chalk.dim(`(score: ${r.score})`)}`);
      if (r.slug) console.log(chalk.dim(`    Slug: ${r.slug}`));
      console.log(chalk.dim(`    Path: ${r.path}`));
      const metaEntries = Object.entries(r.metadata).filter(([, v]) => v != null);
      if (metaEntries.length > 0) {
        console.log(chalk.dim(`    ${metaEntries.map(([k, v]) => `${k}: ${v}`).join(', ')}`));
      }
      console.log('');
    }
    return;
  }

  const result = resolveEntity(reference, entityType, paths);

  if (json) {
    console.log(JSON.stringify({
      success: true,
      reference,
      entityType,
      result: result
        ? {
            type: result.type,
            name: result.name,
            slug: result.slug,
            path: result.path,
            score: result.score,
            metadata: result.metadata,
          }
        : null,
    }, null, 2));
    return;
  }

  header('Entity Resolution');
  console.log(chalk.dim(`  Reference: "${reference}"`));
  console.log(chalk.dim(`  Type: ${entityType}`));
  console.log('');

  if (!result) {
    info('No matching entity found');
    return;
  }

  const typeColor = result.type === 'person' ? chalk.cyan : result.type === 'meeting' ? chalk.green : chalk.yellow;
  success(`Resolved: ${typeColor(`[${result.type}]`)} ${result.name}`);
  if (result.slug) listItem('Slug', result.slug);
  listItem('Path', result.path);
  listItem('Score', String(result.score));
  const metaEntries = Object.entries(result.metadata).filter(([, v]) => v != null);
  if (metaEntries.length > 0) {
    for (const [k, v] of metaEntries) {
      listItem(k.charAt(0).toUpperCase() + k.slice(1), String(v));
    }
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// arete brief --for "query" --skill "skill-name"
// ---------------------------------------------------------------------------

export interface BriefCommandOptions extends CommandOptions {
  for?: string;
  skill?: string;
  primitives?: string;
}

export async function briefCommand(options: BriefCommandOptions): Promise<void> {
  const { json } = options;
  const task = options.for;

  if (!task?.trim()) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Missing --for. Usage: arete brief --for "create PRD for search"' }));
    } else {
      error('Missing --for option');
      info('Usage: arete brief --for "create PRD for search" --skill create-prd');
    }
    process.exit(1);
  }

  const { paths } = requireWorkspace(json);
  const primitives = parsePrimitives(options.primitives);

  const briefing = assembleBriefing(task, paths, {
    primitives,
    skill: options.skill,
  });

  if (json) {
    console.log(JSON.stringify({
      success: true,
      task,
      skill: briefing.skill,
      confidence: briefing.confidence,
      assembledAt: briefing.assembledAt,
      contextFiles: briefing.context.files.length,
      memoryResults: briefing.memory.total,
      entities: briefing.entities.length,
      gaps: briefing.context.gaps.length,
      markdown: briefing.markdown,
    }, null, 2));
    return;
  }

  // Print the formatted markdown briefing
  console.log('');
  console.log(briefing.markdown);
}
