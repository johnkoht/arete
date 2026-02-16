/**
 * Intelligence commands — context, memory, resolve, brief
 */

import { createServices, PRODUCT_PRIMITIVES } from '@arete/core';
import type { Command } from 'commander';
import chalk from 'chalk';
import type { ProductPrimitive } from '@arete/core';
import {
  header,
  info,
  success,
  error,
  listItem,
} from '../formatters.js';

function parsePrimitives(raw?: string): ProductPrimitive[] | undefined {
  if (!raw) return undefined;
  const names = raw.split(',').map((s) => s.trim());
  const valid = names.filter((n) =>
    (PRODUCT_PRIMITIVES as readonly string[]).includes(n),
  ) as ProductPrimitive[];
  return valid.length > 0 ? valid : undefined;
}

export function registerContextCommand(program: Command): void {
  program
    .command('context')
    .description('Assemble relevant workspace context for a task')
    .requiredOption('--for <query>', 'Task description')
    .option('--primitives <list>', 'Comma-separated primitives')
    .option('--json', 'Output as JSON')
    .action(async (opts: { for?: string; primitives?: string; json?: boolean }) => {
      const query = opts.for;
      if (!query?.trim()) {
        if (opts.json) {
          console.log(
            JSON.stringify({
              success: false,
              error: 'Missing --for. Usage: arete context --for "query"',
            }),
          );
        } else {
          error('Missing --for option');
          info('Usage: arete context --for "create a PRD for search"');
        }
        process.exit(1);
      }

      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      if (!root) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        } else {
          error('Not in an Areté workspace');
        }
        process.exit(1);
      }

      const paths = services.workspace.getPaths(root);
      const primitives = parsePrimitives(opts.primitives);
      const result = await services.context.getRelevantContext({
        query,
        paths,
        primitives,
      });

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              query,
              confidence: result.confidence,
              filesCount: result.files.length,
              gapsCount: result.gaps.length,
              primitives: result.primitives,
              files: result.files.map((f) => ({
                relativePath: f.relativePath,
                primitive: f.primitive,
                category: f.category,
                summary: f.summary,
              })),
              gaps: result.gaps,
            },
            null,
            2,
          ),
        );
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
    });
}

export function registerMemoryCommand(program: Command): void {
  const memoryCmd = program
    .command('memory')
    .description('Search workspace memory');

  memoryCmd
    .command('search <query>')
    .description('Search decisions, learnings, and observations')
    .option('--types <list>', 'Comma-separated types')
    .option('--limit <n>', 'Max results')
    .option('--json', 'Output as JSON')
    .action(
      async (
        query: string,
        opts: { types?: string; limit?: string; json?: boolean },
      ) => {
        if (!query?.trim()) {
          if (opts.json) {
            console.log(
              JSON.stringify({
                success: false,
                error: 'Missing query. Usage: arete memory search "onboarding"',
              }),
            );
          } else {
            error('Missing query');
            info('Usage: arete memory search "onboarding"');
          }
          process.exit(1);
        }

        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
          } else {
            error('Not in an Areté workspace');
          }
          process.exit(1);
        }

        const paths = services.workspace.getPaths(root);
        const types = opts.types
          ? (opts.types.split(',').map((s) => s.trim()) as ('decisions' | 'learnings' | 'observations')[])
          : undefined;
        const limit = opts.limit ? parseInt(opts.limit, 10) : undefined;
        const result = await services.memory.search({
          query,
          paths,
          types,
          limit,
        });

        if (opts.json) {
          console.log(
            JSON.stringify(
              { success: true, query, total: result.total, results: result.results },
              null,
              2,
            ),
          );
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
          const typeColor =
            item.type === 'decisions'
              ? chalk.cyan
              : item.type === 'learnings'
                ? chalk.green
                : chalk.yellow;
          const titleMatch = item.content.match(
            /^###\s+(?:\d{4}-\d{2}-\d{2}:\s*)?(.+)/m,
          );
          const title = titleMatch
            ? titleMatch[1].trim()
            : item.content.slice(0, 80);
          console.log(
            `  ${dateStr}${typeColor(`[${item.type}]`)} ${title}`,
          );
          console.log(chalk.dim(`    Source: ${item.source} | ${item.relevance}`));
          console.log('');
        }
      },
    );
}

export function registerResolveCommand(program: Command): void {
  program
    .command('resolve <reference>')
    .description('Resolve ambiguous reference to workspace entity')
    .option('--type <type>', 'Entity type: person, meeting, project, any', 'any')
    .option('--all', 'Return all matches')
    .option('--json', 'Output as JSON')
    .action(
      async (
        reference: string,
        opts: { type?: string; all?: boolean; json?: boolean },
      ) => {
        if (!reference?.trim()) {
          if (opts.json) {
            console.log(
              JSON.stringify({
                success: false,
                error: 'Missing reference. Usage: arete resolve "Jane"',
              }),
            );
          } else {
            error('Missing reference');
            info('Usage: arete resolve "Jane"');
          }
          process.exit(1);
        }

        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
          } else {
            error('Not in an Areté workspace');
          }
          process.exit(1);
        }

        const paths = services.workspace.getPaths(root);
        const entityType = (opts.type || 'any') as 'person' | 'meeting' | 'project' | 'any';

        if (opts.all) {
          const results = await services.entity.resolveAll(
            reference,
            entityType,
            paths,
            10,
          );

          if (opts.json) {
            console.log(
              JSON.stringify(
                {
                  success: true,
                  reference,
                  entityType,
                  results: results.map((r) => ({
                    type: r.type,
                    name: r.name,
                    slug: r.slug,
                    path: r.path,
                    score: r.score,
                    metadata: r.metadata,
                  })),
                },
                null,
                2,
              ),
            );
            return;
          }

          header('Entity Resolution');
          console.log(chalk.dim(`  Reference: "${reference}"`));
          console.log(chalk.dim(`  Type: ${entityType}`));
          console.log(chalk.dim(`  Found: ${results.length} match(es)`));
          console.log('');

          for (const r of results) {
            const typeColor =
              r.type === 'person'
                ? chalk.cyan
                : r.type === 'meeting'
                  ? chalk.green
                  : chalk.yellow;
            console.log(
              `  ${typeColor(`[${r.type}]`)} ${chalk.bold(r.name)} ${chalk.dim(`(score: ${r.score})`)}`,
            );
            if (r.slug) console.log(chalk.dim(`    Slug: ${r.slug}`));
            console.log(chalk.dim(`    Path: ${r.path}`));
            const metaEntries = Object.entries(r.metadata).filter(
              ([, v]) => v != null,
            );
            if (metaEntries.length > 0) {
              console.log(
                chalk.dim(
                  `    ${metaEntries.map(([k, v]) => `${k}: ${v}`).join(', ')}`,
                ),
              );
            }
            console.log('');
          }
          return;
        }

        const result = await services.entity.resolve(
          reference,
          entityType,
          paths,
        );

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
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
              },
              null,
              2,
            ),
          );
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

        const typeColor =
          result.type === 'person'
            ? chalk.cyan
            : result.type === 'meeting'
              ? chalk.green
              : chalk.yellow;
        success(`Resolved: ${typeColor(`[${result.type}]`)} ${result.name}`);
        if (result.slug) listItem('Slug', result.slug);
        listItem('Path', result.path);
        listItem('Score', String(result.score));
        const metaEntries = Object.entries(result.metadata).filter(
          ([, v]) => v != null,
        );
        for (const [k, v] of metaEntries) {
          listItem(k.charAt(0).toUpperCase() + k.slice(1), String(v));
        }
        console.log('');
      },
    );
}

export function registerBriefCommand(program: Command): void {
  program
    .command('brief')
    .description('Assemble primitive briefing before running a skill')
    .requiredOption('--for <query>', 'Task description')
    .option('--skill <name>', 'Skill name for the briefing')
    .option('--primitives <list>', 'Comma-separated primitives')
    .option('--json', 'Output as JSON')
    .action(async (opts: { for?: string; skill?: string; primitives?: string; json?: boolean }) => {
      const task = opts.for;
      if (!task?.trim()) {
        if (opts.json) {
          console.log(
            JSON.stringify({
              success: false,
              error: 'Missing --for. Usage: arete brief --for "create PRD"',
            }),
          );
        } else {
          error('Missing --for option');
          info('Usage: arete brief --for "create PRD" --skill create-prd');
        }
        process.exit(1);
      }

      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      if (!root) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        } else {
          error('Not in an Areté workspace');
        }
        process.exit(1);
      }

      const paths = services.workspace.getPaths(root);
      const primitives = parsePrimitives(opts.primitives);
      const briefing = await services.intelligence.assembleBriefing({
        task,
        paths,
        skillName: opts.skill,
        primitives,
      });

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
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
            },
            null,
            2,
          ),
        );
        return;
      }

      console.log('');
      console.log(briefing.markdown);
    });
}
