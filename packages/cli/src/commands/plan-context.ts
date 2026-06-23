/**
 * `arete plan-context` — plan-context aggregator (WS-2/WS-3,
 * plan-context-injection).
 *
 *   - `--week` — all active projects (recency-ranked) + active topics + goals
 *     crosswalk + last week's `now/week.md`.
 *   - `--day`  — same schema, scoped to today's areas (areas-of-today), with a
 *     recently-active fallback so the bundle is never silently empty (R13).
 *
 * THIN SHELL (pre-mortem R6): this command performs ZERO body parsing — no
 * `parseFrontmatter` on project READMEs, no `## ` heading regex, no
 * `readFileSync` of project docs. All composition (selectProjectDocs +
 * assembleProjectWhatsNew + getActiveTopics + last-week read + openQuestions
 * extraction) lives in `IntelligenceService.assemblePlanContext` (core). The
 * `--json` shape is the skill-consumer contract (snapshot-tested).
 *
 * Conventions per packages/cli/src/commands/LEARNINGS.md: findRoot guard,
 * `--json` complete in all exit paths, formatters.ts helpers. Pure read — no
 * writes, no qmd refresh.
 */

import { Command } from 'commander';
import { createServices } from '@arete/core';
import type { PlanContextMode } from '@arete/core';
import { error, info, header, listItem } from '../formatters.js';

interface PlanContextOpts {
  week?: boolean;
  day?: boolean;
  project?: string;
  json?: boolean;
}

export function registerPlanContextCommand(program: Command): void {
  program
    .command('plan-context')
    .description(
      'Aggregate active-project + topic + goal context for planning. ' +
        '--week (all active projects) or --day (today\'s areas). Pure read; ' +
        'composes the project-read engine (no body parsing in the command).',
    )
    .option('--week', "Week scope — all active projects, recency-ranked")
    .option('--day', "Day scope — projects in today's areas (areas-of-today)")
    .option(
      '--project <slug>',
      'Single-project scope — current state for one project (current-state source per AGENTS.md)',
    )
    .option('--json', 'Output as JSON (skill-consumer contract)')
    .action(async (opts: PlanContextOpts) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      if (!root) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        } else {
          error('Not in an Areté workspace');
          info('Run "arete install" to create a workspace');
        }
        process.exitCode = 1;
        return;
      }

      // Exactly-one-mode validation (mirrors the `brief` typed-mode pattern).
      const modeCount = [opts.week, opts.day, opts.project].filter(Boolean).length;
      if (modeCount > 1) {
        const msg = 'Pass exactly one of --week, --day, or --project <slug>';
        if (opts.json) console.log(JSON.stringify({ success: false, error: msg }));
        else error(msg);
        process.exitCode = 1;
        return;
      }
      const mode: PlanContextMode = opts.project ? 'project' : opts.day ? 'day' : 'week';

      const paths = services.workspace.getPaths(root);
      const bundle = await services.intelligence.assemblePlanContext(
        mode,
        paths,
        opts.project ? { projectSlug: opts.project } : {},
      );

      if (opts.json) {
        console.log(JSON.stringify({ success: true, ...bundle }, null, 2));
        return;
      }

      // Human-readable summary (the JSON shape is the machine contract).
      header(`Plan context — ${mode}`);
      if (bundle.reason) info(`note: ${bundle.reason}`);
      listItem('Projects', String(bundle.projects.length));
      for (const p of bundle.projects) {
        const docs = p.selectedDocs.filter((d) => !d.listed).length;
        const conf = p.lowConfidence ? ' [low-confidence]' : '';
        listItem(
          `  ${p.slug}`,
          `${p.status ?? 'unknown'} — ${docs} doc(s), ${p.openQuestions.length} open Q${conf}`,
        );
      }
      listItem('Topics', String(bundle.topics.length));
      listItem('Goals', String(bundle.goals.length));
      listItem('Week memory', String(bundle.weekMemory.length));
      listItem('Last week', bundle.lastWeek ? 'present' : 'none');
      listItem('Generated', bundle.generatedAt);
    });
}
