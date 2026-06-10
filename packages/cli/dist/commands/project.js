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
import chalk from 'chalk';
import { createServices, loadConfig, refreshQmdIndex, listProjectsForBackfill, applyAreaToProjectReadme, resetBackfilledProjectAreas, } from '@arete/core';
import { error, info, success, listItem } from '../formatters.js';
import { displayQmdResult } from '../lib/qmd-output.js';
/** Confidence floor for area inference (pre-mortem R3 — non-negotiable). */
const BACKFILL_CONFIDENCE_FLOOR = 0.7;
export function registerProjectCommand(program) {
    const projectCmd = program
        .command('project')
        .description('Project flows — read-only open with holistic context, area backfill');
    // ---------------------------------------------------------------------
    // arete project backfill-area  (Phase 12 AC2)
    // ---------------------------------------------------------------------
    projectCmd
        .command('backfill-area')
        .description('Backfill `area:` on active projects missing it by inferring from README title + Background/Key Questions. Default is preview (dry-run); pass --apply to write.')
        .option('--apply', 'Write changes (default: preview-only dry-run)')
        .option('--reset', 'Clear `area`/`area_set_by` ONLY on projects where area_set_by="backfill"; creation/manual areas stay intact')
        .option('--skip-qmd', 'Skip automatic qmd index update after --apply')
        .option('--json', 'Output as JSON')
        .action(async (opts) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
            }
            else {
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
            }
            else {
                success(`Cleared area on ${result.reset.length} backfilled project(s).`);
                for (const slug of result.reset)
                    listItem('Reset', slug);
                if (result.reset.length === 0) {
                    info('No project carried the backfill provenance marker. Nothing to reset.');
                }
            }
            return;
        }
        // Preview / --apply path.
        const all = await listProjectsForBackfill(services.storage, paths);
        const candidates = all.filter((p) => !p.area);
        const proposals = [];
        const unmatched = [];
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
            }
            catch {
                // Inference failure is non-fatal — the project stays unmatched.
            }
            unmatched.push(candidate.slug);
        }
        let applied = false;
        if (opts.apply && proposals.length > 0) {
            const bySlug = new Map(candidates.map((c) => [c.slug, c]));
            for (const proposal of proposals) {
                const candidate = bySlug.get(proposal.slug);
                await applyAreaToProjectReadme(services.storage, candidate.readmePath, proposal.area, 'backfill');
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
            console.log(JSON.stringify({
                success: true,
                applied,
                candidates: candidates.length,
                matched: proposals.length,
                proposals,
                unmatched,
                qmd: qmdResult ?? { indexed: false, skipped: true },
            }, null, 2));
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
                console.log(`  ${chalk.dim(p.slug.padEnd(36))} ${chalk.cyan(p.area)} ${chalk.dim(`(confidence ${p.confidence})`)}`);
            }
        }
        if (unmatched.length > 0) {
            console.log('');
            console.log(chalk.bold('No confident match (left area-less — honest per AC6):'));
            for (const slug of unmatched)
                console.log(`  ${chalk.dim(slug)}`);
        }
        console.log('');
        if (proposals.length > 0 && !applied) {
            info('Re-run with --apply to write changes.');
            info('Use `arete project backfill-area --reset` to undo backfill-set areas later.');
        }
        else if (applied) {
            success(`Applied area to ${proposals.length} project(s); stamped area_set_by: backfill provenance.`);
            displayQmdResult(qmdResult);
        }
        else if (candidates.length === 0) {
            info('Every active project already resolves an area. Nothing to backfill.');
        }
    });
}
//# sourceMappingURL=project.js.map