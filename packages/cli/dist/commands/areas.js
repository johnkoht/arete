/**
 * Areas commands — list, epics (Phase 7a AC4)
 *
 * The `arete areas` noun (plural, matches `arete people`) surfaces the
 * areas/<slug>.md layer for orchestrator consumers (Phase 8 reconciler)
 * and ad-hoc queries.
 *
 * Subcommand shape convention: `arete areas <noun-or-noun-phrase>`
 * (e.g., `list`, `epics`), not `arete areas <verb>`. Verbs go on
 * subcommand options. This keeps the namespace open for future area
 * work (focus, sync, refresh) without forcing awkward renaming.
 *
 * Future subcommand sketches (not implemented in 7a):
 *   - `arete areas show <slug>` — detailed view of one area
 *   - `arete areas focus` — surface area-focus suggestions
 *   - `arete areas sync` — re-derive recurring-meeting mappings
 *
 * All three fit `arete areas <noun>` without conflicting with `list` /
 * `epics`.
 */
import { createServices } from '@arete/core';
import { header, listItem, error, info, } from '../formatters.js';
import chalk from 'chalk';
export function registerAreasCommands(program) {
    const areasCmd = program
        .command('areas')
        .description('List areas and surface area-level intelligence (epics, etc.)');
    // ---------------------------------------------------------------------
    // arete areas list [--json]
    // ---------------------------------------------------------------------
    areasCmd
        .command('list')
        .description('List all areas in the workspace with summary fields')
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
        const contexts = await services.areaParser.listAreas();
        const areas = contexts
            .map((ctx) => ({
            slug: ctx.slug,
            name: ctx.name,
            status: ctx.status,
            recurringMeetingCount: ctx.recurringMeetings.length,
            jiraEpicCount: ctx.jiraEpics.length,
        }))
            .sort((a, b) => a.slug.localeCompare(b.slug));
        if (opts.json) {
            console.log(JSON.stringify({ success: true, areas, count: areas.length }, null, 2));
            return;
        }
        header('Areas');
        if (areas.length === 0) {
            info('No areas yet.');
            console.log(chalk.dim('  Create one with: arete create area <slug>'));
            return;
        }
        console.log('');
        console.log(chalk.dim('  Slug                       Name                              Status     Meetings  Epics'));
        console.log(chalk.dim('  ' + '-'.repeat(90)));
        for (const a of areas) {
            const slug = (a.slug + ' ').slice(0, 26).padEnd(26);
            const name = (a.name + ' ').slice(0, 33).padEnd(33);
            const status = a.status.padEnd(10);
            const meetings = String(a.recurringMeetingCount).padStart(8);
            const epics = String(a.jiraEpicCount).padStart(5);
            console.log(`  ${slug} ${name} ${status} ${meetings}  ${epics}`);
        }
        console.log('');
        listItem('Total', String(areas.length));
        console.log('');
    });
    // ---------------------------------------------------------------------
    // arete areas epics [--active] [--slug <s>] [--json]
    //
    // Lists epics per area, with a `union` field (deduplicated union of
    // jira_epics across `status: active` areas) when --active is used.
    // ---------------------------------------------------------------------
    areasCmd
        .command('epics')
        .description('List Jira epic watchlists declared in area frontmatter')
        .option('--active', 'Only include status: active areas; emit union field')
        .option('--slug <slug>', 'Return only the named area\'s epics')
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
        let contexts = await services.areaParser.listAreas();
        // --slug filter (overrides --active for selection; both still
        // contribute to the union when --active is also set).
        if (opts.slug) {
            contexts = contexts.filter((ctx) => ctx.slug === opts.slug);
            if (contexts.length === 0) {
                if (opts.json) {
                    console.log(JSON.stringify({
                        success: false,
                        error: `Area not found: ${opts.slug}`,
                    }));
                }
                else {
                    error(`Area not found: ${opts.slug}`);
                }
                process.exit(1);
            }
        }
        else if (opts.active) {
            contexts = contexts.filter((ctx) => ctx.status === 'active');
        }
        const areas = contexts
            .map((ctx) => ({
            slug: ctx.slug,
            name: ctx.name,
            status: ctx.status,
            epics: ctx.jiraEpics,
        }))
            .sort((a, b) => a.slug.localeCompare(b.slug));
        // Union is emitted when --active (regardless of --slug) so a
        // reconciler can pull the full watchlist in one call.
        const result = { success: true, areas };
        if (opts.active) {
            const seen = new Set();
            const union = [];
            for (const a of areas) {
                for (const epic of a.epics) {
                    if (!seen.has(epic)) {
                        seen.add(epic);
                        union.push(epic);
                    }
                }
            }
            union.sort();
            result.union = union;
        }
        if (opts.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }
        // Human-readable output.
        const titleSuffix = opts.slug
            ? ` (slug=${opts.slug})`
            : opts.active
                ? ' (active)'
                : '';
        header(`Areas — epic watchlist${titleSuffix}`);
        if (areas.length === 0) {
            info('No areas matched.');
            return;
        }
        for (const a of areas) {
            console.log('');
            console.log(`  ${chalk.bold(a.name)} ${chalk.dim('(' + a.slug + ', ' + a.status + ')')}`);
            if (a.epics.length === 0) {
                console.log(chalk.dim('    (no epics declared)'));
            }
            else {
                for (const epic of a.epics) {
                    console.log(`    - ${epic}`);
                }
            }
        }
        console.log('');
        listItem('Areas', String(areas.length));
        if (result.union) {
            listItem('Union (deduped)', String(result.union.length) + ' epic(s)');
            if (result.union.length > 0) {
                console.log('');
                console.log(chalk.dim('  Union:'));
                for (const epic of result.union) {
                    console.log(`    - ${epic}`);
                }
            }
        }
        console.log('');
    });
}
//# sourceMappingURL=areas.js.map