/**
 * Commitments commands — list and resolve open commitments
 */

import { isAbsolute, resolve as resolvePath, join } from 'node:path';
import {
  createServices,
  loadConfig,
  refreshQmdIndex,
  type QmdRefreshResult,
} from '@arete/core';
import type { Command } from 'commander';
import chalk from 'chalk';
import { listItem, error, info, success } from '../formatters.js';
import { displayQmdResult } from '../lib/qmd-output.js';

export function registerCommitmentsCommand(program: Command): void {
  const commitmentsCmd = program
    .command('commitments')
    .description('Track and resolve open commitments');

  // ---------------------------------------------------------------------------
  // arete commitments list
  // ---------------------------------------------------------------------------

  commitmentsCmd
    .command('list')
    .description('List open commitments')
    .option('--direction <direction>', 'Filter by direction: i_owe_them or they_owe_me')
    .option('--person <slugs...>', 'Filter by person slug(s)')
    .option('--area <slug>', 'Filter by area slug')
    .option('--json', 'Output as JSON')
    .action(
      async (opts: { direction?: string; person?: string[]; area?: string; json?: boolean }) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
          if (opts.json) {
            console.log(
              JSON.stringify({ success: false, error: 'Not in an Areté workspace' }),
            );
          } else {
            error('Not in an Areté workspace');
            info('Run "arete install" to create a workspace');
          }
          process.exit(1);
        }

        // Validate direction if provided
        if (
          opts.direction &&
          opts.direction !== 'i_owe_them' &&
          opts.direction !== 'they_owe_me'
        ) {
          if (opts.json) {
            console.log(
              JSON.stringify({
                success: false,
                error: `Invalid direction: "${opts.direction}". Must be i_owe_them or they_owe_me`,
              }),
            );
          } else {
            error(
              `Invalid direction: "${opts.direction}". Must be i_owe_them or they_owe_me`,
            );
          }
          process.exit(1);
        }

        const direction = opts.direction as 'i_owe_them' | 'they_owe_me' | undefined;

        let commitments;
        try {
          commitments = await services.commitments.listOpen({
            direction,
            personSlugs: opts.person,
            area: opts.area,
          });
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'Failed to list commitments';
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: msg }));
          } else {
            error(msg);
          }
          process.exit(1);
        }

        if (opts.json) {
          const out = commitments.map((c) => ({
            id: c.id,
            idShort: c.id.slice(0, 8),
            direction: c.direction,
            personSlug: c.personSlug,
            personName: c.personName,
            text: c.text,
            date: c.date,
            resolvedAt: c.resolvedAt,
            ...(c.goalSlug ? { goalSlug: c.goalSlug } : {}),
            ...(c.area ? { area: c.area } : {}),
          }));
          console.log(
            JSON.stringify({ success: true, commitments: out, count: out.length }, null, 2),
          );
          return;
        }

        if (commitments.length === 0) {
          info('No open commitments.');
          return;
        }

        // Group by direction
        const iOweThem = commitments.filter((c) => c.direction === 'i_owe_them');
        const theyOweMe = commitments.filter((c) => c.direction === 'they_owe_me');

        // Check if any commitment has an area value (to conditionally show area column)
        const hasAreas = commitments.some((c) => c.area);

        console.log('');
        if (iOweThem.length > 0) {
          console.log(chalk.bold('I owe them'));
          for (const c of iOweThem) {
            const shortId = c.id.slice(0, 8);
            const personName = c.personName.padEnd(20).slice(0, 20);
            const goalPrefix = c.goalSlug ? chalk.cyan(`[${c.goalSlug}] `) : '';
            const areaTag = hasAreas ? (c.area ? chalk.magenta(`@${c.area} `) : '') : '';
            const date = c.date ? chalk.dim(`(${c.date})`) : '';
            console.log(`  ${chalk.dim(shortId)}  ${personName}  ${areaTag}${goalPrefix}${c.text}  ${date}`);
          }
          console.log('');
        }
        if (theyOweMe.length > 0) {
          console.log(chalk.bold('They owe me'));
          for (const c of theyOweMe) {
            const shortId = c.id.slice(0, 8);
            const personName = c.personName.padEnd(20).slice(0, 20);
            const goalPrefix = c.goalSlug ? chalk.cyan(`[${c.goalSlug}] `) : '';
            const areaTag = hasAreas ? (c.area ? chalk.magenta(`@${c.area} `) : '') : '';
            const date = c.date ? chalk.dim(`(${c.date})`) : '';
            console.log(`  ${chalk.dim(shortId)}  ${personName}  ${areaTag}${goalPrefix}${c.text}  ${date}`);
          }
          console.log('');
        }
        listItem('Total', String(commitments.length));
        console.log('');
      },
    );

  // ---------------------------------------------------------------------------
  // arete commitments create <text>
  // ---------------------------------------------------------------------------

  commitmentsCmd
    .command('create <text>')
    .description('Create a commitment')
    .requiredOption('--person <slug>', 'Person slug (e.g. anthony-avina)')
    .requiredOption(
      '--direction <direction>',
      'Direction: i_owe_them or they_owe_me',
    )
    .option('--person-name <name>', 'Person display name (derived from slug if omitted)')
    .option('--goal <slug>', 'Goal slug to link')
    .option('--area <slug>', 'Area slug')
    .option('--date <date>', 'Date (YYYY-MM-DD, defaults to today)')
    .option('--source <source>', 'Source reference (e.g. meeting file)')
    .option('--skip-qmd', 'Skip automatic qmd index update')
    .option('--json', 'Output as JSON')
    .action(
      async (
        text: string,
        opts: {
          person: string;
          direction: string;
          personName?: string;
          goal?: string;
          area?: string;
          date?: string;
          source?: string;
          skipQmd?: boolean;
          json?: boolean;
        },
      ) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
          if (opts.json) {
            console.log(
              JSON.stringify({ success: false, error: 'Not in an Areté workspace' }),
            );
          } else {
            error('Not in an Areté workspace');
            info('Run "arete install" to create a workspace');
          }
          process.exit(1);
        }

        // Validate direction
        if (
          opts.direction !== 'i_owe_them' &&
          opts.direction !== 'they_owe_me'
        ) {
          if (opts.json) {
            console.log(
              JSON.stringify({
                success: false,
                error: `Invalid direction: "${opts.direction}". Must be i_owe_them or they_owe_me`,
              }),
            );
          } else {
            error(
              `Invalid direction: "${opts.direction}". Must be i_owe_them or they_owe_me`,
            );
          }
          process.exit(1);
        }

        const direction = opts.direction as 'i_owe_them' | 'they_owe_me';

        // Derive person name from slug if not provided
        const personName =
          opts.personName ??
          opts.person
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');

        // Parse date
        const date = opts.date ? new Date(opts.date) : undefined;
        if (date && Number.isNaN(date.getTime())) {
          if (opts.json) {
            console.log(
              JSON.stringify({ success: false, error: `Invalid date: "${opts.date}"` }),
            );
          } else {
            error(`Invalid date: "${opts.date}"`);
          }
          process.exit(1);
        }

        let result;
        try {
          result = await services.commitments.create(
            text,
            opts.person,
            personName,
            direction,
            {
              goalSlug: opts.goal,
              area: opts.area,
              date,
              source: opts.source,
            },
          );
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'Failed to create commitment';
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: msg }));
          } else {
            error(msg);
          }
          process.exit(1);
        }

        // Refresh QMD index
        let qmdResult: QmdRefreshResult | undefined;
        if (!opts.skipQmd) {
          const config = await loadConfig(services.storage, root);
          qmdResult = await refreshQmdIndex(root, config.qmd_collection);
        }

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                commitment: {
                  id: result.commitment.id,
                  idShort: result.commitment.id.slice(0, 8),
                  text: result.commitment.text,
                  direction: result.commitment.direction,
                  personSlug: result.commitment.personSlug,
                  personName: result.commitment.personName,
                  date: result.commitment.date,
                  status: result.commitment.status,
                },
                ...(result.task
                  ? { task: { id: result.task.id, destination: result.task.destination } }
                  : {}),
                qmd: qmdResult ?? { indexed: false, skipped: true },
              },
              null,
              2,
            ),
          );
          return;
        }

        success('Commitment created.');
        listItem('Text', result.commitment.text);
        listItem('Person', personName);
        listItem(
          'Direction',
          direction === 'i_owe_them' ? 'I owe them' : 'They owe me',
        );
        listItem('ID', result.commitment.id.slice(0, 8));
        if (result.task) {
          listItem('Task', `${result.task.id} → ${result.task.destination}`);
        }
        displayQmdResult(qmdResult);
        console.log('');
      },
    );

  // ---------------------------------------------------------------------------
  // arete commitments resolve <id>
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // arete commitments backfill-area  (phase-8-followup-8 AC3)
  // ---------------------------------------------------------------------------

  commitmentsCmd
    .command('backfill-area')
    .description(
      'Backfill `area` on commitments missing it by inferring from source meeting. Default is preview (dry-run); pass --apply to write.',
    )
    .option('--apply', 'Write changes (default: preview-only dry-run)')
    .option(
      '--reset',
      'Clear `area` ONLY on commitments where areaSetBy="backfill" provenance marker is present; leaves Path A / Path B / manual areas intact',
    )
    .option('--json', 'Output as JSON')
    .action(async (opts: { apply?: boolean; reset?: boolean; json?: boolean }) => {
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

      // --reset path: clear backfill-marked areas only.
      if (opts.reset) {
        const result = await services.commitments.resetBackfilledAreas();
        if (opts.json) {
          console.log(JSON.stringify({ success: true, reset: result.reset }));
        } else {
          success(`Cleared area on ${result.reset} backfilled commitment(s).`);
          if (result.reset === 0) {
            info('No commitments carried the backfill provenance marker. Nothing to reset.');
          }
        }
        return;
      }

      // Default + --apply path: resolve area per source meeting, propose, optionally write.
      const { join } = await import('node:path');
      const { parse: parseYaml } = await import('yaml');

      // Resolver closure — same precedence as AC2:
      //   1. meeting frontmatter `area:` (explicit signal)
      //   2. AreaParserService.suggestAreaForMeeting at ≥0.7 confidence
      const meetingsDir = join(root, 'resources', 'meetings');
      const resolveArea = async (source: string): Promise<string | null> => {
        const meetingPath = join(meetingsDir, source);
        const content = await services.storage.read(meetingPath);
        if (!content) return null;

        // Parse YAML frontmatter
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
        if (!fmMatch) return null;
        let frontmatter: Record<string, unknown>;
        try {
          frontmatter = parseYaml(fmMatch[1] ?? '') as Record<string, unknown>;
        } catch {
          return null;
        }
        const body = fmMatch[2] ?? '';

        if (typeof frontmatter.area === 'string' && frontmatter.area.trim().length > 0) {
          return frontmatter.area;
        }
        if (typeof frontmatter.title !== 'string') return null;
        try {
          const match = await services.areaParser.suggestAreaForMeeting({
            title: String(frontmatter.title),
            summary: typeof frontmatter.summary === 'string' ? frontmatter.summary : undefined,
            transcript: body,
          });
          if (match && match.confidence >= 0.7) return match.areaSlug;
        } catch {
          // Inference failure non-fatal.
        }
        return null;
      };

      let report;
      try {
        report = await services.commitments.backfillArea(resolveArea, { apply: Boolean(opts.apply) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to run backfill';
        if (opts.json) console.log(JSON.stringify({ success: false, error: msg }));
        else error(msg);
        process.exit(1);
      }

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              applied: report.applied,
              candidates: report.candidates,
              matched: report.matched,
              proposals: report.proposals,
            },
            null,
            2,
          ),
        );
        return;
      }

      const mode = report.applied ? 'APPLIED' : 'PREVIEW (dry-run)';
      info(`Backfill: ${mode}`);
      listItem('Candidates (area=null)', String(report.candidates));
      listItem('Matched (proposed)', String(report.matched));
      if (report.matched > 0) {
        console.log('');
        console.log(chalk.bold('Proposed updates:'));
        for (const p of report.proposals) {
          console.log(
            `  ${chalk.dim(p.id.slice(0, 8))}  ${chalk.cyan(p.area)}  ${chalk.dim('←')} ${p.source}`,
          );
        }
        console.log('');
        if (!report.applied) {
          info('Re-run with --apply to write changes.');
          info('Use `arete commitments backfill-area --reset` to undo backfill-set areas later.');
        } else {
          success(`Applied area to ${report.matched} commitment(s); stamped areaSetBy: 'backfill' provenance.`);
        }
      } else if (report.candidates === 0) {
        info('No area-null commitments. Nothing to backfill.');
      } else {
        info('No matches found at the 0.7 confidence threshold. Commitments unchanged.');
      }
    });

  // ---------------------------------------------------------------------------
  // arete commitments restore --from <path>  (phase-10a-pre AC0/AC1d)
  // ---------------------------------------------------------------------------

  commitmentsCmd
    .command('restore')
    .description(
      'Restore .arete/commitments.json from a snapshot JSON file. Idempotent; writes a pre-restore snapshot to .arete/commitments.pre-restore-<ts>.json before overwriting (M6 mitigation).',
    )
    .requiredOption('--from <path>', 'Path to snapshot JSON (absolute or relative to workspace root)')
    .option('--yes', 'Skip confirmation prompt')
    .option('--json', 'Output as JSON')
    .action(async (opts: { from: string; yes?: boolean; json?: boolean }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      if (!root) {
        if (opts.json) {
          console.log(
            JSON.stringify({ success: false, error: 'Not in an Areté workspace' }),
          );
        } else {
          error('Not in an Areté workspace');
          info('Run "arete install" to create a workspace');
        }
        process.exit(1);
      }

      // Resolve the source path. Absolute paths used as-is; relative paths
      // anchored to the workspace root so users can pass
      // `.arete/commitments.pre-phase-10.json` without a leading ./.
      // Always pass the resolved path through normalize-against-root to
      // catch trivial `..` escapes; this is a soft injection guard — we
      // accept any in-workspace OR absolute path the user can supply
      // intentionally, but normalize first so the error message is sane.
      const sourcePath = isAbsolute(opts.from)
        ? resolvePath(opts.from)
        : resolvePath(root, opts.from);

      // Read source snapshot
      const sourceContent = await services.storage.read(sourcePath);
      if (sourceContent === null) {
        const msg = `Snapshot file not found: ${sourcePath}`;
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: msg }));
        } else {
          error(msg);
        }
        process.exit(1);
      }

      // Validate JSON shape — must parse and look like CommitmentsFile.
      // We accept anything with a `commitments` array; deeper schema
      // validation lives in CommitmentsService.load().
      let parsed: { commitments?: unknown };
      try {
        parsed = JSON.parse(sourceContent) as { commitments?: unknown };
      } catch (err) {
        const msg = `Snapshot is not valid JSON: ${
          err instanceof Error ? err.message : String(err)
        }`;
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: msg }));
        } else {
          error(msg);
        }
        process.exit(1);
      }
      if (!Array.isArray(parsed.commitments)) {
        const msg =
          'Snapshot JSON does not match commitments file shape (missing or non-array `commitments` field)';
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: msg }));
        } else {
          error(msg);
        }
        process.exit(1);
      }
      const incomingCount = (parsed.commitments as unknown[]).length;

      // Compute target + pre-restore snapshot paths
      const targetPath = join(root, '.arete/commitments.json');
      const currentContent = await services.storage.read(targetPath);
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const preRestorePath = join(
        root,
        `.arete/commitments.pre-restore-${ts}.json`,
      );

      // Confirmation prompt (unless --yes or --json)
      if (!opts.yes && !opts.json) {
        const { confirm } = await import('@inquirer/prompts');
        const currentCount = currentContent
          ? ((): number => {
              try {
                const cur = JSON.parse(currentContent) as { commitments?: unknown[] };
                return Array.isArray(cur.commitments) ? cur.commitments.length : 0;
              } catch {
                return 0;
              }
            })()
          : 0;
        console.log('');
        console.log(`  ${chalk.bold('From:')}    ${sourcePath}`);
        console.log(`  ${chalk.bold('To:')}      ${targetPath}`);
        console.log(`  ${chalk.bold('Current:')} ${currentCount} commitment(s)`);
        console.log(`  ${chalk.bold('Incoming:')} ${incomingCount} commitment(s)`);
        console.log(
          `  ${chalk.bold('Backup:')}  ${preRestorePath} (written before overwrite)`,
        );
        console.log('');
        const confirmed = await confirm({
          message:
            'Restore will REPLACE current commitments.json. Any commitments added since the snapshot will be lost. Continue?',
          default: false,
        });
        if (!confirmed) {
          info('Aborted.');
          process.exit(0);
        }
      }

      // Write pre-restore snapshot (best-effort; only if there's a current file)
      if (currentContent !== null) {
        try {
          await services.storage.write(preRestorePath, currentContent);
        } catch (err) {
          const msg = `Failed to write pre-restore snapshot: ${
            err instanceof Error ? err.message : String(err)
          }`;
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: msg }));
          } else {
            error(msg);
          }
          process.exit(1);
        }
      }

      // Restore: write source content verbatim. Byte-equal round-trip is
      // the AC. We intentionally do NOT re-serialize via load/save
      // (which would apply pruning + key-order normalization) — restore
      // means restore.
      try {
        await services.storage.write(targetPath, sourceContent);
      } catch (err) {
        const msg = `Failed to write commitments.json: ${
          err instanceof Error ? err.message : String(err)
        }`;
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: msg }));
        } else {
          error(msg);
        }
        process.exit(1);
      }

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              restored: incomingCount,
              from: sourcePath,
              to: targetPath,
              preRestoreSnapshot: currentContent !== null ? preRestorePath : null,
            },
            null,
            2,
          ),
        );
        return;
      }

      success(`Restored ${incomingCount} commitment(s) from snapshot.`);
      listItem('From', sourcePath);
      listItem('To', targetPath);
      if (currentContent !== null) {
        listItem('Pre-restore snapshot', preRestorePath);
      } else {
        info('No prior commitments.json — pre-restore snapshot skipped.');
      }
      console.log('');
    });

  commitmentsCmd
    .command('resolve <id>')
    .description(
      'Resolve or drop a commitment by ID (8-char prefix or full 64-char hash)',
    )
    .option(
      '--status <status>',
      'Resolution status: resolved or dropped (default: resolved)',
    )
    .option('--yes', 'Skip confirmation prompt')
    .option('--skip-qmd', 'Skip automatic qmd index update')
    .option('--json', 'Output as JSON')
    .action(
      async (
        id: string,
        opts: {
          status?: string;
          yes?: boolean;
          skipQmd?: boolean;
          json?: boolean;
        },
      ) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
          if (opts.json) {
            console.log(
              JSON.stringify({ success: false, error: 'Not in an Areté workspace' }),
            );
          } else {
            error('Not in an Areté workspace');
            info('Run "arete install" to create a workspace');
          }
          process.exit(1);
        }

        const config = await loadConfig(services.storage, root);

        // Validate status
        const status = (opts.status ?? 'resolved') as 'resolved' | 'dropped';
        if (status !== 'resolved' && status !== 'dropped') {
          if (opts.json) {
            console.log(
              JSON.stringify({
                success: false,
                error: `Invalid status: "${opts.status}". Must be resolved or dropped`,
              }),
            );
          } else {
            error(
              `Invalid status: "${opts.status}". Must be resolved or dropped`,
            );
          }
          process.exit(1);
        }

        // Look up the commitment to show details in confirmation prompt
        let targetCommitment:
          | Awaited<ReturnType<typeof services.commitments.listOpen>>[number]
          | undefined;
        try {
          const open = await services.commitments.listOpen();
          targetCommitment = open.find(
            (c) => c.id === id || c.id.startsWith(id),
          );
        } catch {
          // Non-critical — resolve() will produce its own error if needed
        }

        // Confirmation prompt (unless --yes or --json)
        if (!opts.yes && !opts.json) {
          const { confirm } = await import('@inquirer/prompts');
          if (targetCommitment) {
            console.log('');
            console.log(
              `  ${chalk.bold('Commitment:')} ${targetCommitment.text}`,
            );
            console.log(`  ${chalk.bold('Person:')}     ${targetCommitment.personName}`);
            console.log(
              `  ${chalk.bold('Direction:')}  ${
                targetCommitment.direction === 'i_owe_them'
                  ? 'I owe them'
                  : 'They owe me'
              }`,
            );
            console.log('');
          }
          const confirmed = await confirm({
            message: `Mark as ${status}?`,
            default: false,
          });
          if (!confirmed) {
            info('Aborted.');
            process.exit(0);
          }
        }

        // Resolve the commitment
        let resolved;
        try {
          resolved = await services.commitments.resolve(id, status);
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'Failed to resolve commitment';
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: msg }));
          } else {
            error(msg);
          }
          process.exit(1);
        }

        // Refresh QMD index
        let qmdResult: QmdRefreshResult | undefined;
        if (!opts.skipQmd) {
          qmdResult = await refreshQmdIndex(root, config.qmd_collection);
        }

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                resolved: {
                  id: resolved.id,
                  text: resolved.text,
                  personName: resolved.personName,
                  direction: resolved.direction,
                  resolvedAt: resolved.resolvedAt,
                  status: resolved.status,
                },
                qmd: qmdResult ?? { indexed: false, skipped: true },
              },
              null,
              2,
            ),
          );
          return;
        }

        success(`Commitment marked as ${status}.`);
        listItem('Text', resolved.text);
        listItem('Person', resolved.personName);
        displayQmdResult(qmdResult);
        console.log('');
      },
    );
}
