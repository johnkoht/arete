/**
 * `arete project` command group (Phase 12).
 *
 *   - `arete project backfill-area` — AC2: propose (preview default) /
 *     `--apply` / `--reset` an `area:` on active projects missing one.
 *     Mirrors `arete commitments backfill-area` (preview-by-default,
 *     0.7 confidence floor, `area_set_by: backfill` provenance).
 *   - `arete project open <name>` — AC3: READ-ONLY open flow. Resolve
 *     name → slug (top-N disambiguation on tie, never auto-load), print
 *     the project brief + "what's new since last touched". Zero writes.
 *
 * Conventions per packages/cli/src/commands/LEARNINGS.md: findRoot guard,
 * `--json` complete in all exit paths, formatters.ts helpers,
 * refreshQmdIndex after workspace writes (+ `--skip-qmd`).
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  createServices,
  loadConfig,
  refreshQmdIndex,
  listProjectsForBackfill,
  applyAreaToProjectReadme,
  resetBackfilledProjectAreas,
  formatProjectBriefMarkdown,
  computeProjectTopicsRefresh,
  applyProjectTopics,
  PROJECT_TOPICS_SCORE_FLOOR,
  PROJECT_DOC_BUDGET_DEFAULT,
  readActiveProjectMarker,
  writeActiveProjectMarker,
  setActiveProjectMarkerDirty,
  clearActiveProjectMarker,
  readResumeSidecar,
  type ActiveProjectMarker,
} from '@arete/core';
import { join } from 'node:path';
import { error, info, success, listItem } from '../formatters.js';
import { displayQmdResult } from '../lib/qmd-output.js';

/** Confidence floor for area inference (pre-mortem R3 — non-negotiable). */
const BACKFILL_CONFIDENCE_FLOOR = 0.7;

/**
 * Tie window for open-flow disambiguation (pre-mortem R5): when a
 * runner-up scores within this fraction of the top candidate, show
 * top-N candidates instead of auto-loading. Never auto-load a tie.
 */
const DISAMBIGUATION_SCORE_RATIO = 0.8;

export function registerProjectCommand(program: Command): void {
  const projectCmd = program
    .command('project')
    .description('Project flows — read-only open with holistic context, area backfill');

  // ---------------------------------------------------------------------
  // arete project backfill-area  (Phase 12 AC2)
  // ---------------------------------------------------------------------

  projectCmd
    .command('backfill-area')
    .description(
      'Backfill `area:` on active projects missing it by inferring from README title + Background/Key Questions. Default is preview (dry-run); pass --apply to write.',
    )
    .option('--apply', 'Write changes (default: preview-only dry-run)')
    .option(
      '--reset',
      'Clear `area`/`area_set_by` ONLY on projects where area_set_by="backfill"; creation/manual areas stay intact',
    )
    .option('--skip-qmd', 'Skip automatic qmd index update after --apply')
    .option('--json', 'Output as JSON')
    .action(
      async (opts: { apply?: boolean; reset?: boolean; skipQmd?: boolean; json?: boolean }) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
          } else {
            error('Not in an Areté workspace');
            info('Run "arete install" to create a workspace');
          }
          process.exit(1);
        }
        const paths = services.workspace.getPaths(root);

        // --reset path: clear backfill-stamped areas only.
        if (opts.reset) {
          const result = await resetBackfilledProjectAreas(services.storage, paths);
          if (opts.json) {
            console.log(JSON.stringify({ success: true, reset: result.reset }));
          } else {
            success(`Cleared area on ${result.reset.length} backfilled project(s).`);
            for (const slug of result.reset) listItem('Reset', slug);
            if (result.reset.length === 0) {
              info('No project carried the backfill provenance marker. Nothing to reset.');
            }
          }
          return;
        }

        // Preview / --apply path.
        const all = await listProjectsForBackfill(services.storage, paths);
        const candidates = all.filter((p) => !p.area);

        const proposals: Array<{ slug: string; area: string; confidence: number }> = [];
        const unmatched: string[] = [];
        for (const candidate of candidates) {
          try {
            const match = await services.areaParser.suggestAreaForMeeting({
              title: candidate.title,
              summary: candidate.inferenceSummary || undefined,
            });
            if (match && match.confidence >= BACKFILL_CONFIDENCE_FLOOR) {
              proposals.push({
                slug: candidate.slug,
                area: match.areaSlug,
                confidence: Number(match.confidence.toFixed(2)),
              });
              continue;
            }
          } catch {
            // Inference failure is non-fatal — the project stays unmatched.
          }
          unmatched.push(candidate.slug);
        }

        let applied = false;
        if (opts.apply && proposals.length > 0) {
          const bySlug = new Map(candidates.map((c) => [c.slug, c]));
          for (const proposal of proposals) {
            const candidate = bySlug.get(proposal.slug)!;
            await applyAreaToProjectReadme(
              services.storage,
              candidate.readmePath,
              proposal.area,
              'backfill',
            );
          }
          applied = true;
        }

        // qmd refresh after workspace writes (cli LEARNINGS) — before the
        // JSON return so JSON mode still indexes.
        let qmdResult;
        if (applied && !opts.skipQmd) {
          const config = await loadConfig(services.storage, root);
          qmdResult = await refreshQmdIndex(root, config.qmd_collection);
        }

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                applied,
                candidates: candidates.length,
                matched: proposals.length,
                proposals,
                unmatched,
                qmd: qmdResult ?? { indexed: false, skipped: true },
              },
              null,
              2,
            ),
          );
          return;
        }

        const mode = applied ? 'APPLIED' : 'PREVIEW (dry-run)';
        info(`Backfill: ${mode}`);
        listItem('Candidates (no area resolved)', String(candidates.length));
        listItem(`Matched at ≥${BACKFILL_CONFIDENCE_FLOOR} confidence`, String(proposals.length));
        if (proposals.length > 0) {
          console.log('');
          console.log(chalk.bold('Proposed areas:'));
          for (const p of proposals) {
            console.log(
              `  ${chalk.dim(p.slug.padEnd(36))} ${chalk.cyan(p.area)} ${chalk.dim(`(confidence ${p.confidence})`)}`,
            );
          }
        }
        if (unmatched.length > 0) {
          console.log('');
          console.log(chalk.bold('No confident match (left area-less — honest per AC6):'));
          for (const slug of unmatched) console.log(`  ${chalk.dim(slug)}`);
        }
        console.log('');
        if (proposals.length > 0 && !applied) {
          info('Re-run with --apply to write changes.');
          info('Use `arete project backfill-area --reset` to undo backfill-set areas later.');
        } else if (applied) {
          success(
            `Applied area to ${proposals.length} project(s); stamped area_set_by: backfill provenance.`,
          );
          displayQmdResult(qmdResult);
        } else if (candidates.length === 0) {
          info('Every active project already resolves an area. Nothing to backfill.');
        }
      },
    );
  // ---------------------------------------------------------------------
  // arete project refresh-topics <slug>  (Phase 14 AC2)
  // ---------------------------------------------------------------------

  projectCmd
    .command('refresh-topics <slug>')
    .description(
      'Recompute the system-owned `topics:` cache for a project (top-5 wiki topics above the score floor). Default is preview (pure read); --apply writes ONLY when the slug set changed (R2: zero writes on a no-op).',
    )
    .option('--apply', 'Write the cache when changed (default: preview-only pure read)')
    .option('--skip-qmd', 'Skip automatic qmd index update after an actual write')
    .option('--json', 'Output as JSON')
    .action(async (slug: string, opts: { apply?: boolean; skipQmd?: boolean; json?: boolean }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      if (!root) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        } else {
          error('Not in an Areté workspace');
          info('Run "arete install" to create a workspace');
        }
        process.exit(1);
      }
      const paths = services.workspace.getPaths(root);

      const refresh = await computeProjectTopicsRefresh(
        services.storage,
        services.topicMemory,
        paths,
        slug,
      );
      if (!refresh) {
        if (opts.json) {
          console.log(
            JSON.stringify({ success: false, error: `No active project '${slug}' (no README)` }),
          );
        } else {
          error(`No active project '${slug}' (projects/active/${slug}/README.md not found)`);
        }
        process.exit(1);
      }

      // --apply: change-gated write. Same slug set → applyProjectTopics
      // performs ZERO write calls (R2 — tested in core + subprocess suites).
      let written = false;
      if (opts.apply && refresh.changed) {
        const result = await applyProjectTopics(services.storage, refresh);
        written = result.written;
      }

      // qmd refresh ONLY after an actual write (cli LEARNINGS: before the
      // JSON return so JSON mode still indexes).
      let qmdResult;
      if (written && !opts.skipQmd) {
        const config = await loadConfig(services.storage, root);
        qmdResult = await refreshQmdIndex(root, config.qmd_collection);
      }

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              slug: refresh.slug,
              area: refresh.area,
              floor: PROJECT_TOPICS_SCORE_FLOOR,
              computed: refresh.computed,
              belowFloor: refresh.belowFloor,
              current: refresh.current,
              currentRefreshed: refresh.currentRefreshed,
              changed: refresh.changed,
              retrievalFailed: refresh.retrievalFailed ?? false,
              applied: written,
              qmd: qmdResult ?? { indexed: false, skipped: true },
            },
            null,
            2,
          ),
        );
        return;
      }

      const mode = opts.apply ? (written ? 'APPLIED' : 'APPLY (no-op)') : 'PREVIEW (pure read)';
      info(`Topics cache: ${mode}`);
      listItem('Project', refresh.slug + (refresh.area ? `  (area: ${refresh.area})` : ''));
      listItem('Cached set', refresh.current.length > 0 ? refresh.current.join(', ') : '(none)');
      if (refresh.currentRefreshed) listItem('Cache last changed', refresh.currentRefreshed);
      listItem(
        `Computed top-${refresh.computed.length} (floor ${PROJECT_TOPICS_SCORE_FLOOR})`,
        refresh.computed.length > 0
          ? refresh.computed.map((c) => `${c.slug} (${c.score})`).join(', ')
          : '(none above floor)',
      );
      if (refresh.belowFloor.length > 0) {
        listItem(
          'Below floor (excluded)',
          refresh.belowFloor.map((c) => `${c.slug} (${c.score})`).join(', '),
        );
      }
      if (refresh.retrievalFailed) {
        error('Wiki retrieval failed — treating as no-change (a transient error never empties the cache).');
      }
      console.log('');
      if (written) {
        success('Wrote topics: + topics_refreshed: (slug set changed).');
        displayQmdResult(qmdResult);
      } else if (refresh.changed) {
        info('Slug set differs from the cache. Re-run with --apply to write.');
      } else {
        info('Slug set unchanged — nothing to write (R2: zero write calls).');
      }
    });

  // ---------------------------------------------------------------------
  // arete project mark-open <slug>  (project-exit Increment A)
  // ---------------------------------------------------------------------

  projectCmd
    .command('mark-open <slug>')
    .description(
      'Write the active-project marker (.claude/active-project.json) for <slug>. Harness state only — does not reindex.',
    )
    .option('--json', 'Output as JSON')
    .action(async (slug: string, opts: { json?: boolean }) => {
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

      const readmePath = join(paths.projects, 'active', slug, 'README.md');
      const content = await services.storage.read(readmePath);
      if (!content) {
        if (opts.json) {
          console.log(
            JSON.stringify({
              success: false,
              error: `No active project '${slug}' (projects/active/${slug}/README.md not found)`,
            }),
          );
        } else {
          error(`No active project '${slug}' (projects/active/${slug}/README.md not found)`);
        }
        process.exit(1);
      }

      const h1 = content.match(/^#\s+(.+?)\s*$/m);
      const name = h1 ? h1[1].trim() : slug;
      const marker: ActiveProjectMarker = {
        slug,
        name,
        openedAt: new Date().toISOString(),
        dirty: false,
      };
      await writeActiveProjectMarker(services.storage, root, marker);

      if (opts.json) {
        console.log(JSON.stringify({ success: true, marker }, null, 2));
        return;
      }
      success(`Marked '${slug}' open (${name}).`);
    });

  // ---------------------------------------------------------------------
  // arete project mark-dirty  (project-exit Increment A)
  // ---------------------------------------------------------------------

  projectCmd
    .command('mark-dirty')
    .description(
      'Set the active-project marker dirty bit. No-op when no project is open. Harness state only.',
    )
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
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

      const existing = await readActiveProjectMarker(services.storage, root);
      await setActiveProjectMarkerDirty(services.storage, root);

      if (opts.json) {
        console.log(
          JSON.stringify({ success: true, hadMarker: existing !== undefined, dirty: true }),
        );
        return;
      }
      if (existing) {
        success(`Marked '${existing.slug}' dirty.`);
      } else {
        info('No active project marker — nothing to mark dirty.');
      }
    });

  // ---------------------------------------------------------------------
  // arete project mark-clear  (project-exit Increment A)
  // ---------------------------------------------------------------------

  projectCmd
    .command('mark-clear')
    .description(
      'Delete the active-project marker. No-op when absent. Harness state only.',
    )
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
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

      const existing = await readActiveProjectMarker(services.storage, root);
      await clearActiveProjectMarker(services.storage, root);

      if (opts.json) {
        console.log(
          JSON.stringify({ success: true, cleared: existing !== undefined }),
        );
        return;
      }
      if (existing) {
        success(`Cleared active-project marker (was '${existing.slug}').`);
      } else {
        info('No active project marker — nothing to clear.');
      }
    });

  // ---------------------------------------------------------------------
  // arete project list  (project-exit Increment A — READ-ONLY)
  // ---------------------------------------------------------------------

  projectCmd
    .command('list')
    .description(
      'List active projects (slug, name, area, status, lastTouched) sorted by README mtime descending. Read-only.',
    )
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
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

      // listProjectsForBackfill gives slug/name(title)/area; add README mtime
      // (lastTouched) + status from the same README the helper already validated.
      const candidates = await listProjectsForBackfill(services.storage, paths);
      const projects: Array<{
        slug: string;
        name: string;
        area: string | null;
        status: string | null;
        lastTouched: string | null;
      }> = [];
      for (const c of candidates) {
        const modified = await services.storage.getModified(c.readmePath);
        const content = await services.storage.read(c.readmePath);
        const statusMatch = content?.match(/^status:\s*(.+?)\s*$/m);
        projects.push({
          slug: c.slug,
          name: c.title,
          area: c.area ?? null,
          status: statusMatch ? statusMatch[1].trim() : null,
          lastTouched: modified ? modified.toISOString() : null,
        });
      }
      // Sort by lastTouched desc (nulls last).
      projects.sort((a, b) => {
        if (a.lastTouched === b.lastTouched) return 0;
        if (a.lastTouched === null) return 1;
        if (b.lastTouched === null) return -1;
        return a.lastTouched < b.lastTouched ? 1 : -1;
      });

      if (opts.json) {
        console.log(JSON.stringify({ success: true, projects }, null, 2));
        return;
      }
      if (projects.length === 0) {
        info('No active projects.');
        return;
      }
      console.log(chalk.bold('Active projects (most recently touched first):'));
      for (const p of projects) {
        const meta = [p.area ? `area: ${p.area}` : null, p.status ? `status: ${p.status}` : null]
          .filter(Boolean)
          .join(', ');
        const touched = p.lastTouched ? p.lastTouched : 'mtime unavailable';
        console.log(
          `  ${chalk.cyan(p.slug.padEnd(36))} ${chalk.dim(touched)}${meta ? chalk.dim(`  (${meta})`) : ''}`,
        );
      }
    });

  // ---------------------------------------------------------------------
  // arete project open <name>  (Phase 12 AC3 — READ-ONLY)
  // ---------------------------------------------------------------------

  projectCmd
    .command('open <name>')
    .description(
      'READ-ONLY: resolve a project by name, print its brief + what changed since the README was last touched. Never writes.',
    )
    .option('--json', 'Output as JSON')
    .action(async (name: string, opts: { json?: boolean }) => {
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

      const candidates = await services.entity.resolveAll(name, 'project', paths, 5);
      if (candidates.length === 0) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: `No project matched '${name}'` }));
        } else {
          error(`No project matched '${name}'`);
        }
        process.exit(1);
      }

      // R5: never auto-load a tie. An exact slug match short-circuits;
      // otherwise a runner-up within the score window triggers top-N.
      const exact = candidates.find((c) => c.slug === name);
      const top = exact ?? candidates[0];
      const runnerUp = candidates.find((c) => c.slug !== top.slug);
      const isTie =
        !exact &&
        runnerUp !== undefined &&
        runnerUp.score >= top.score * DISAMBIGUATION_SCORE_RATIO;

      if (isTie) {
        const list = candidates.map((c) => ({
          slug: c.slug ?? '',

          name: c.name,
          score: c.score,
          status: (c.metadata?.status as string) ?? 'active',
        }));
        if (opts.json) {
          console.log(
            JSON.stringify({ success: true, disambiguation: true, candidates: list }, null, 2),
          );
        } else {
          info(`'${name}' is ambiguous — which project did you mean?`);
          for (const c of list) {
            console.log(
              `  ${chalk.cyan(c.slug.padEnd(36))} ${chalk.dim(`score ${c.score}`)}${c.status === 'archived' ? chalk.yellow('  [archived]') : ''}`,
            );
          }
          info('Re-run with the exact slug: arete project open <slug>');
        }
        return;
      }

      // Archived projects live outside projects/active/ — emit a read-only
      // note instead of an empty brief (review concern #4).
      if ((top.metadata?.status as string) === 'archived') {
        if (opts.json) {
          console.log(
            JSON.stringify({ success: true, slug: top.slug, archived: true, path: top.path }),
          );
        } else {
          info(`Project \`${top.slug}\` is archived — context is read-only at ${top.path}.`);
        }
        return;
      }

      const topSlug = top.slug ?? name;
      // WS-1: /project inherits traverse+select via the shared body-reader so
      // the relevant project doc surfaces, not just metadata (Defect B).
      const brief = await services.intelligence.assembleBriefForProject(topSlug, paths, {
        projectDocBudgetChars: PROJECT_DOC_BUDGET_DEFAULT,
      });
      const whatsNew = await services.intelligence.assembleProjectWhatsNew(topSlug, paths);
      // project-exit: surface the resume sidecar if the prior session left one.
      // READ-ONLY addition — open writes nothing.
      const resume = (await readResumeSidecar(services.storage, root, topSlug)) ?? null;

      if (opts.json) {
        const { metadata, sections, sources, subject, subjectSlug, mode, truncated } = brief;
        console.log(
          JSON.stringify(
            {
              success: true,
              mode,
              subject,
              subjectSlug,
              metadata,
              sections,
              sources,
              truncated,
              resume,
              whatsNew,
            },
            null,
            2,
          ),
        );
        return;
      }

      if (resume) {
        console.log('## Resume — where you left off');
        console.log('');
        console.log(resume);
        console.log('');
      }
      console.log(formatProjectBriefMarkdown(brief));
      console.log("## What's new since last touched");
      console.log('');
      if (!whatsNew || whatsNew.sinceUnknown) {
        info('README modification time unavailable — skipping delta.');
        return;
      }
      console.log(chalk.dim(`README last touched: ${whatsNew.since}`));
      console.log('');
      if (
        whatsNew.meetings.length === 0 &&
        whatsNew.topics.length === 0 &&
        whatsNew.commitments.length === 0
      ) {
        info('Nothing new since the README was last touched.');
        return;
      }
      if (whatsNew.meetings.length > 0) {
        console.log(chalk.bold(`Meetings (${whatsNew.meetings.length}):`));
        for (const m of whatsNew.meetings) console.log(`  - ${m.title} (${m.date})`);
      }
      if (whatsNew.topics.length > 0) {
        console.log(chalk.bold(`Wiki topics refreshed (${whatsNew.topics.length}):`));
        for (const t of whatsNew.topics) console.log(`  - ${t.slug} (${t.lastRefreshed})`);
      }
      if (whatsNew.commitments.length > 0) {
        console.log(chalk.bold(`Newly-opened commitments (${whatsNew.commitments.length}):`));
        for (const c of whatsNew.commitments) console.log(`  - ${c.text} (${c.date})`);
      }
    });
}
