/**
 * Intelligence commands — context, memory, resolve, brief
 */
import { createServices, PRODUCT_PRIMITIVES, loadConfig, refreshQmdIndex, formatPersonBriefMarkdown, formatProjectBriefMarkdown, formatAreaBriefMarkdown, formatMeetingBriefMarkdown, } from '@arete/core';
import { promises as fs } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { header, info, success, warn, error, listItem, deprecated, } from '../formatters.js';
import { displayQmdResult } from '../lib/qmd-output.js';
function parsePrimitives(raw) {
    if (!raw)
        return undefined;
    const names = raw.split(',').map((s) => s.trim());
    const valid = names.filter((n) => PRODUCT_PRIMITIVES.includes(n));
    return valid.length > 0 ? valid : undefined;
}
export function registerContextCommand(program) {
    program
        .command('context')
        .description('Assemble relevant workspace context for a task')
        .option('--for <query>', 'Task description')
        .option('--inventory', 'Show context inventory with freshness dashboard')
        .option('--stale-days <days>', 'Staleness threshold in days (default: 30)')
        .option('--primitives <list>', 'Comma-separated primitives')
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
            }
            process.exit(1);
        }
        const paths = services.workspace.getPaths(root);
        // --inventory mode
        if (opts.inventory) {
            const staleDays = opts.staleDays ? parseInt(opts.staleDays, 10) : 30;
            const inventory = await services.context.getContextInventory(paths, {
                staleThresholdDays: isNaN(staleDays) ? 30 : staleDays,
            });
            if (opts.json) {
                console.log(JSON.stringify({
                    success: true,
                    totalFiles: inventory.totalFiles,
                    byCategory: inventory.byCategory,
                    staleThresholdDays: inventory.staleThresholdDays,
                    staleCount: inventory.staleFiles.length,
                    missingPrimitives: inventory.missingPrimitives,
                    freshness: inventory.freshness.map((f) => ({
                        relativePath: f.relativePath,
                        category: f.category,
                        primitive: f.primitive,
                        daysOld: f.daysOld,
                        isStale: f.isStale,
                    })),
                    staleFiles: inventory.staleFiles.map((f) => ({
                        relativePath: f.relativePath,
                        daysOld: f.daysOld,
                    })),
                }, null, 2));
                return;
            }
            header('Context Inventory');
            console.log(chalk.dim(`  Scanned: ${inventory.scannedAt.slice(0, 16).replace('T', ' ')}`));
            console.log(chalk.dim(`  Total files: ${inventory.totalFiles}`));
            console.log(chalk.dim(`  Stale threshold: ${inventory.staleThresholdDays} days`));
            console.log('');
            // File freshness list (context files first)
            const contextFiles = inventory.freshness.filter(f => f.category === 'context');
            const otherFiles = inventory.freshness.filter(f => f.category !== 'context');
            const orderedFiles = [...contextFiles, ...otherFiles];
            if (orderedFiles.length > 0) {
                console.log(chalk.bold('  Files:'));
                for (const f of orderedFiles) {
                    const age = f.daysOld !== null
                        ? (f.daysOld === 0 ? 'today' : f.daysOld === 1 ? '1 day old' : `${f.daysOld} days old`)
                        : 'unknown age';
                    const status = f.isStale
                        ? chalk.yellow('⚠ STALE')
                        : chalk.green('✓');
                    const primTag = f.primitive ? chalk.cyan(` [${f.primitive}]`) : '';
                    const maxPathLen = 45;
                    const paddedPath = f.relativePath.length < maxPathLen
                        ? f.relativePath + ' ' + chalk.dim('.'.repeat(maxPathLen - f.relativePath.length))
                        : f.relativePath;
                    console.log(`    ${paddedPath} ${chalk.dim(age)}  ${status}${primTag}`);
                }
                console.log('');
            }
            // Coverage gaps
            if (inventory.missingPrimitives.length > 0) {
                console.log(chalk.bold('  Coverage gaps:'));
                for (const prim of inventory.missingPrimitives) {
                    const suggestion = GAP_SUGGESTIONS_CLI[prim];
                    console.log(`    ${chalk.yellow(prim)} — ${suggestion || 'No context file found'}`);
                }
                console.log('');
            }
            // Stale files
            if (inventory.staleFiles.length > 0) {
                console.log(chalk.bold(`  Stale context (>${inventory.staleThresholdDays} days):`));
                for (const f of inventory.staleFiles) {
                    const age = f.daysOld !== null ? `Last updated ${f.daysOld} days ago` : 'Unknown age';
                    warn(`${f.relativePath} — ${age}`);
                }
                console.log('');
            }
            if (inventory.missingPrimitives.length === 0 && inventory.staleFiles.length === 0) {
                success('All context files are fresh and all primitives are covered');
                console.log('');
            }
            return;
        }
        // --for mode (original behavior)
        const query = opts.for;
        if (!query?.trim()) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'Missing --for. Usage: arete context --for "query"',
                }));
            }
            else {
                error('Missing --for or --inventory option');
                info('Usage: arete context --for "create a PRD for search"');
                info('       arete context --inventory');
            }
            process.exit(1);
        }
        const primitives = parsePrimitives(opts.primitives);
        const result = await services.context.getRelevantContext({
            query,
            paths,
            primitives,
        });
        // Deprecation warning (to stderr)
        deprecated('`arete context --for` is deprecated. Use `arete search "query"` instead.');
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                deprecated: true,
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
    });
}
const GAP_SUGGESTIONS_CLI = {
    Problem: 'No business overview — add context/business-overview.md',
    User: 'No user/persona file — add context/users-personas.md',
    Solution: 'No product details — add context/products-services.md',
    Market: 'No competitive landscape — add context/competitive-landscape.md',
    Risk: 'Risks are often in memory — use arete memory search',
};
export function registerMemoryCommand(program) {
    const memoryCmd = program
        .command('memory')
        .description('Search workspace memory');
    memoryCmd
        .command('search <query>')
        .description('Search decisions, learnings, and observations')
        .option('--types <list>', 'Comma-separated types')
        .option('--limit <n>', 'Max results')
        .option('--json', 'Output as JSON')
        .action(async (query, opts) => {
        if (!query?.trim()) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'Missing query. Usage: arete memory search "onboarding"',
                }));
            }
            else {
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
            }
            else {
                error('Not in an Areté workspace');
            }
            process.exit(1);
        }
        const paths = services.workspace.getPaths(root);
        const types = opts.types
            ? opts.types.split(',').map((s) => s.trim())
            : undefined;
        const limit = opts.limit ? parseInt(opts.limit, 10) : undefined;
        const result = await services.memory.search({
            query,
            paths,
            types,
            limit,
        });
        // Deprecation warning (to stderr)
        deprecated('`arete memory search` is deprecated. Use `arete search "query" --scope memory` instead.');
        if (opts.json) {
            console.log(JSON.stringify({ success: true, deprecated: true, query, total: result.total, results: result.results }, null, 2));
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
            const typeColor = item.type === 'decisions'
                ? chalk.cyan
                : item.type === 'learnings'
                    ? chalk.green
                    : chalk.yellow;
            const titleMatch = item.content.match(/^###\s+(?:\d{4}-\d{2}-\d{2}:\s*)?(.+)/m);
            const title = titleMatch
                ? titleMatch[1].trim()
                : item.content.slice(0, 80);
            console.log(`  ${dateStr}${typeColor(`[${item.type}]`)} ${title}`);
            console.log(chalk.dim(`    Source: ${item.source} | ${item.relevance}`));
            console.log('');
        }
    });
    memoryCmd
        .command('timeline <query>')
        .description('Show temporal timeline for a topic')
        .option('--days <n>', 'Number of days to look back')
        .option('--from <date>', 'Start date (YYYY-MM-DD)')
        .option('--to <date>', 'End date (YYYY-MM-DD)')
        .option('--json', 'Output as JSON')
        .action(async (query, opts) => {
        if (!query?.trim()) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'Missing query. Usage: arete memory timeline "onboarding"',
                }));
            }
            else {
                error('Missing query');
                info('Usage: arete memory timeline "onboarding"');
            }
            process.exit(1);
        }
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
            }
            else {
                error('Not in an Areté workspace');
            }
            process.exit(1);
        }
        const paths = services.workspace.getPaths(root);
        // Build date range from options
        let start = opts.from;
        let end = opts.to;
        if (opts.days) {
            const daysBack = parseInt(opts.days, 10);
            if (!isNaN(daysBack) && daysBack > 0) {
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - daysBack);
                start = start ?? startDate.toISOString().slice(0, 10);
            }
        }
        const range = (start || end) ? { start, end } : undefined;
        const timeline = await services.memory.getTimeline(query, paths, range);
        // Deprecation warning (to stderr)
        deprecated('`arete memory timeline` is deprecated. Use `arete search "query" --timeline` instead.');
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                deprecated: true,
                query: timeline.query,
                dateRange: timeline.dateRange,
                themes: timeline.themes,
                itemCount: timeline.items.length,
                items: timeline.items.map((item) => ({
                    date: item.date,
                    type: item.type,
                    title: item.title,
                    source: item.source,
                    relevanceScore: item.relevanceScore,
                })),
            }, null, 2));
            return;
        }
        header('Memory Timeline');
        console.log(chalk.dim(`  Query: "${timeline.query}"`));
        if (timeline.dateRange.start || timeline.dateRange.end) {
            console.log(chalk.dim(`  Date range: ${timeline.dateRange.start ?? '...'} to ${timeline.dateRange.end ?? '...'}`));
        }
        console.log('');
        if (timeline.themes.length > 0) {
            console.log(chalk.bold('  Recurring themes: ') + chalk.cyan(timeline.themes.join(', ')));
            console.log('');
        }
        if (timeline.items.length === 0) {
            info('No timeline items found for this query');
            return;
        }
        for (const item of timeline.items) {
            const typeLabel = item.type === 'meeting'
                ? chalk.green('Meeting')
                : item.type === 'decisions'
                    ? chalk.cyan('Decision')
                    : item.type === 'learnings'
                        ? chalk.green('Learning')
                        : chalk.yellow('Observation');
            console.log(`  ${chalk.dim(item.date)} ${chalk.dim('|')} ${typeLabel}: ${item.title}`);
        }
        console.log('');
    });
    memoryCmd
        .command('refresh')
        .description('Refresh all L3 computed memory (area summaries + person memory)')
        .option('--area <slug>', 'Refresh only this area')
        .option('--dry-run', 'Preview what would be refreshed without writing')
        .option('--skip-qmd', 'Skip automatic qmd index update')
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
            }
            process.exit(1);
        }
        const paths = services.workspace.getPaths(root);
        // 1. Refresh area memory (mechanical-only after Phase 7b — LLM
        //    synthesis paths removed; use `arete topic refresh --all` for
        //    topic-page LLM synthesis).
        const areaResult = await services.areaMemory.refreshAllAreaMemory(paths, {
            areaSlug: opts.area,
            dryRun: opts.dryRun,
        });
        // 2. Refresh person memory (unless targeting a specific area)
        let personResult;
        if (!opts.area) {
            personResult = await services.entity.refreshPersonMemory(paths, {
                dryRun: opts.dryRun,
                commitments: services.commitments,
            });
        }
        // 2c. Regenerate CLAUDE.md with Active Topics boot-context
        // (Step 9 — agent boot context). Only when AI is configured AND
        // not targeting a specific area (area-scoped refresh is targeted
        // work, not bulk boot-context refresh). Idempotent: no write when
        // byte-equal to existing file. Non-fatal on failure.
        let claudeMdRegen;
        if (!opts.area && !opts.dryRun) {
            try {
                const { loadMemorySummary } = await import('@arete/core');
                const config = await loadConfig(services.storage, root);
                const skillList = await services.skills.list(root);
                const memorySummary = await loadMemorySummary(services.topicMemory, paths);
                claudeMdRegen = await services.workspace.regenerateRootFiles(config, paths, { skills: skillList, memorySummary });
            }
            catch (err) {
                warn(`CLAUDE.md regeneration skipped: ${err instanceof Error ? err.message : 'unknown'}`);
            }
        }
        // 3. Refresh memory index (`.arete/memory/index.md`) — Obsidian landing page.
        // Idempotent: no write when content byte-equals existing file. Runs after
        // area + person refresh so topic/person counts reflect fresh data. Skipped
        // on --dry-run per convention.
        let indexStatus = 'skipped';
        let indexErrors = [];
        if (!opts.dryRun && !opts.area) {
            try {
                const r = await services.memoryIndex.refreshMemoryIndex(paths);
                indexStatus = r.status;
                indexErrors = r.errors;
            }
            catch (err) {
                // Non-fatal — area/person refresh already succeeded.
                warn(`Memory index refresh failed: ${err instanceof Error ? err.message : 'unknown'}`);
            }
        }
        // 3b. Emit a `refresh` event to .arete/memory/log.md — dogfoods the
        // grammar and gives replay tooling a timeline. Log write failure
        // never blocks the refresh, but it MUST warn — the bare swallow
        // here is how the 6/08 full refresh left zero trace in log.md
        // (wiki-repair W5: append failures warn, never vanish). The two
        // appends are independent: a refresh-event failure must not also
        // kill the claude-md-regen event.
        if (!opts.dryRun) {
            try {
                await services.memoryLog.append(paths, {
                    event: 'refresh',
                    fields: {
                        scope: opts.area !== undefined ? 'area' : 'all',
                        areas_updated: String(areaResult.updated),
                        people_updated: String(personResult?.updated ?? 0),
                        index_status: indexStatus,
                        index_errors: String(indexErrors.length),
                    },
                });
            }
            catch (err) {
                warn(`Memory log append failed (refresh event not recorded): ${err instanceof Error ? err.message : 'unknown'}`);
            }
            // Companion event for CLAUDE.md regen — distinct event kind
            // so replay can distinguish agent-boot-context changes from
            // data refreshes. Note: only emitted when regen RAN (full-scope,
            // non-dry refresh with `regenerateRootFiles` not throwing) — a
            // thrown regen is warned above at the 2c catch and leaves no
            // event by design (claudeMdRegen stays undefined).
            if (claudeMdRegen !== undefined) {
                const claudeMdStatus = claudeMdRegen['CLAUDE.md'] ?? 'skipped';
                try {
                    await services.memoryLog.append(paths, {
                        event: 'claude-md-regen',
                        fields: {
                            result: claudeMdStatus,
                        },
                    });
                }
                catch (err) {
                    warn(`Memory log append failed (claude-md-regen event not recorded): ${err instanceof Error ? err.message : 'unknown'}`);
                }
            }
        }
        // 4. Refresh QMD index (existing behavior)
        let qmdResult;
        const totalUpdated = areaResult.updated + (personResult?.updated ?? 0);
        if (totalUpdated > 0 && !opts.skipQmd && !opts.dryRun) {
            const config = await loadConfig(services.storage, root);
            qmdResult = await refreshQmdIndex(root, config.qmd_collection);
        }
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                dryRun: Boolean(opts.dryRun),
                areas: areaResult,
                people: personResult ?? null,
                bootContext: claudeMdRegen !== undefined
                    ? { claudeMd: claudeMdRegen['CLAUDE.md'] ?? 'skipped' }
                    : null,
                memoryIndex: {
                    status: indexStatus,
                    errors: indexErrors,
                },
                qmd: qmdResult ?? { indexed: false, skipped: true },
            }, null, 2));
            return;
        }
        if (opts.dryRun) {
            header('Memory Refresh (dry run)');
        }
        else {
            header('Memory Refresh');
        }
        // Area results
        if (opts.dryRun) {
            info(`[dry-run] Would update ${areaResult.updated} area memory file(s).`);
        }
        else {
            success(`Updated ${areaResult.updated} area memory file(s).`);
        }
        listItem('Areas scanned', String(areaResult.scannedAreas));
        listItem('Areas skipped', String(areaResult.skipped));
        // Person results
        if (personResult) {
            console.log('');
            if (opts.dryRun) {
                info(`[dry-run] Would update ${personResult.updated} person file(s).`);
            }
            else {
                success(`Updated ${personResult.updated} person memory file(s).`);
            }
            listItem('People scanned', String(personResult.scannedPeople));
            listItem('Meetings scanned', String(personResult.scannedMeetings));
        }
        // CLAUDE.md regen status — distinguish updated vs unchanged so
        // users know whether git status will reflect a change.
        if (claudeMdRegen !== undefined) {
            const claudeMdResult = claudeMdRegen['CLAUDE.md'];
            if (claudeMdResult === 'updated') {
                info('Boot context: CLAUDE.md updated (Active Topics section refreshed)');
            }
            else if (claudeMdResult === 'unchanged') {
                info('Boot context: CLAUDE.md unchanged (no content change)');
            }
            else if (claudeMdResult === 'failed') {
                warn('Boot context: CLAUDE.md regeneration failed (pre-existing file untouched)');
            }
        }
        // Memory index status — surface errors prominently so users know
        // when topic files are being silently excluded.
        if (indexStatus === 'updated') {
            if (indexErrors.length > 0) {
                warn(`Memory index: updated (${indexErrors.length} item(s) excluded due to errors — run \`arete topic lint\`)`);
            }
            else {
                info('Memory index: updated (.arete/memory/index.md)');
            }
        }
        else if (indexStatus === 'unchanged') {
            if (indexErrors.length > 0) {
                warn(`Memory index: unchanged (${indexErrors.length} item(s) excluded due to errors — run \`arete topic lint\`)`);
            }
            else {
                info('Memory index: unchanged (no content change)');
            }
        }
        displayQmdResult(qmdResult);
        console.log('');
    });
}
export function registerResolveCommand(program) {
    program
        .command('resolve <reference>')
        .description('Resolve ambiguous reference to workspace entity')
        .option('--type <type>', 'Entity type: person, meeting, project, any', 'any')
        .option('--all', 'Return all matches')
        .option('--json', 'Output as JSON')
        .action(async (reference, opts) => {
        if (!reference?.trim()) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'Missing reference. Usage: arete resolve "Jane"',
                }));
            }
            else {
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
            }
            else {
                error('Not in an Areté workspace');
            }
            process.exit(1);
        }
        const paths = services.workspace.getPaths(root);
        const entityType = (opts.type || 'any');
        if (opts.all) {
            const results = await services.entity.resolveAll(reference, entityType, paths, 10);
            if (opts.json) {
                console.log(JSON.stringify({
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
                }, null, 2));
                return;
            }
            header('Entity Resolution');
            console.log(chalk.dim(`  Reference: "${reference}"`));
            console.log(chalk.dim(`  Type: ${entityType}`));
            console.log(chalk.dim(`  Found: ${results.length} match(es)`));
            console.log('');
            for (const r of results) {
                const typeColor = r.type === 'person'
                    ? chalk.cyan
                    : r.type === 'meeting'
                        ? chalk.green
                        : chalk.yellow;
                console.log(`  ${typeColor(`[${r.type}]`)} ${chalk.bold(r.name)} ${chalk.dim(`(score: ${r.score})`)}`);
                if (r.slug)
                    console.log(chalk.dim(`    Slug: ${r.slug}`));
                console.log(chalk.dim(`    Path: ${r.path}`));
                const metaEntries = Object.entries(r.metadata).filter(([, v]) => v != null);
                if (metaEntries.length > 0) {
                    console.log(chalk.dim(`    ${metaEntries.map(([k, v]) => `${k}: ${v}`).join(', ')}`));
                }
                console.log('');
            }
            return;
        }
        const result = await services.entity.resolve(reference, entityType, paths);
        if (opts.json) {
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
        const typeColor = result.type === 'person'
            ? chalk.cyan
            : result.type === 'meeting'
                ? chalk.green
                : chalk.yellow;
        success(`Resolved: ${typeColor(`[${result.type}]`)} ${result.name}`);
        if (result.slug)
            listItem('Slug', result.slug);
        listItem('Path', result.path);
        listItem('Score', String(result.score));
        const metaEntries = Object.entries(result.metadata).filter(([, v]) => v != null);
        for (const [k, v] of metaEntries) {
            listItem(k.charAt(0).toUpperCase() + k.slice(1), String(v));
        }
        console.log('');
    });
}
/**
 * Phase 9 AC10c — telemetry: append one line per typed-mode invocation
 * to `dev/diary/brief-invocations.log`. Best-effort; failures don't block.
 */
async function appendBriefInvocationTelemetry(workspaceRoot, mode, input) {
    try {
        const dir = join(workspaceRoot, 'dev', 'diary');
        await fs.mkdir(dir, { recursive: true });
        const logPath = join(dir, 'brief-invocations.log');
        const line = `${new Date().toISOString()} ${mode} ${JSON.stringify(input)}\n`;
        await fs.appendFile(logPath, line, 'utf8');
    }
    catch {
        // best-effort — never block the command
    }
}
/** Simple Levenshtein for project-slug typo suggestions (M4). */
function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0)
        return n;
    if (n === 0)
        return m;
    const prev = new Array(n + 1);
    const curr = new Array(n + 1);
    for (let j = 0; j <= n; j++)
        prev[j] = j;
    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        for (let j = 0; j <= n; j++)
            prev[j] = curr[j];
    }
    return prev[n];
}
async function closestProjectSlug(workspaceRoot, attempted) {
    try {
        const activeDir = join(workspaceRoot, 'projects', 'active');
        const entries = await fs.readdir(activeDir, { withFileTypes: true });
        const slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
        if (slugs.length === 0)
            return null;
        let best = null;
        for (const slug of slugs) {
            const dist = levenshtein(attempted.toLowerCase(), slug.toLowerCase());
            if (!best || dist < best.dist)
                best = { slug, dist };
        }
        return best && best.dist <= Math.max(2, Math.floor(attempted.length / 2))
            ? best.slug
            : null;
    }
    catch {
        return null;
    }
}
export function registerBriefCommand(program) {
    program
        .command('brief')
        .description('Assemble structured context — typed modes (--person/--project/--area/--meeting) or free-text (--for)')
        // Phase 9 AC8: --for demoted from requiredOption to option so mode-count
        // validation can enforce mutual exclusion across {--for, --person, etc.}.
        .option('--for <query>', 'Free-text task or topic description (ad-hoc mode)')
        .option('--person <slug>', 'Typed mode: assemble a brief for a person')
        .option('--project <slug>', 'Typed mode: assemble a brief for a project (also: override for --meeting)')
        .option('--area <slug>', 'Typed mode: assemble a brief for an area')
        .option('--meeting <slug-or-title>', 'Typed mode: assemble a brief for a meeting (slug or free-text title)')
        .option('--skill <name>', '(--for mode only) Skill name for the briefing')
        .option('--primitives <list>', '(--for mode only) Comma-separated primitives')
        // --raw is retained as a hidden no-op for backward compat; raw is now the only mode.
        .option('--raw', 'Deprecated: raw is now the only mode (flag accepted, no-op)', false)
        .option('--json', 'Output as JSON')
        .action(async (opts) => {
        // -------------------------------------------------------------------
        // Phase 9 AC8: mode-count validation.
        // Exactly ONE of {--for, --person, --project, --area, --meeting}.
        // --project is special: it ALSO acts as an override on --meeting mode,
        // so when --meeting is also passed, --project is not counted as a mode.
        // -------------------------------------------------------------------
        const modes = ['for', 'person', 'project', 'area', 'meeting'];
        // If --meeting is set, --project is the override, not a mode.
        const isProjectOverride = !!opts.meeting && !!opts.project;
        const activeModes = modes.filter((k) => {
            if (k === 'project' && isProjectOverride)
                return false;
            return !!opts[k];
        });
        if (activeModes.length === 0) {
            const msg = 'exactly one of --for/--person/--project/--area/--meeting required';
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: msg }));
            }
            else {
                error(msg);
                info('Usage: arete brief --meeting "John / Lindsay 1:1"');
            }
            process.exit(1);
        }
        if (activeModes.length > 1) {
            const flagList = activeModes.map((k) => `--${k}`).join(', ');
            const msg = `exactly one of --for/--person/--project/--area/--meeting required (got: ${flagList})`;
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: msg }));
            }
            else {
                error(msg);
            }
            process.exit(1);
        }
        if (opts.raw) {
            process.stderr.write('(--raw is now the only mode; flag accepted for backward compat)\n');
        }
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
            }
            else {
                error('Not in an Areté workspace');
            }
            process.exit(1);
        }
        const paths = services.workspace.getPaths(root);
        // ----------------- Typed-mode dispatch -----------------
        if (opts.person) {
            const brief = await services.intelligence.assembleBriefForPerson(opts.person, paths);
            await appendBriefInvocationTelemetry(root, '--person', opts.person);
            if (opts.json) {
                const { metadata, sections, sources, subject, subjectSlug, mode, truncated, truncatedSections } = brief;
                console.log(JSON.stringify({ mode, subject, subjectSlug, metadata, sections, sources, truncated, truncatedSections }, null, 2));
            }
            else {
                console.log(formatPersonBriefMarkdown(brief));
            }
            return;
        }
        if (opts.area) {
            const brief = await services.intelligence.assembleBriefForArea(opts.area, paths);
            await appendBriefInvocationTelemetry(root, '--area', opts.area);
            if (opts.json) {
                const { metadata, sections, sources, subject, subjectSlug, mode, truncated, truncatedSections } = brief;
                console.log(JSON.stringify({ mode, subject, subjectSlug, metadata, sections, sources, truncated, truncatedSections }, null, 2));
            }
            else {
                console.log(formatAreaBriefMarkdown(brief));
            }
            return;
        }
        if (opts.meeting) {
            // M4: validate --project override slug if provided.
            if (opts.project) {
                const projectDir = join(root, 'projects', 'active', opts.project, 'README.md');
                try {
                    await fs.access(projectDir);
                }
                catch {
                    const closest = await closestProjectSlug(root, opts.project);
                    const hint = closest ? `; did you mean: ${closest}?` : '';
                    const msg = `project '${opts.project}' not found${hint}`;
                    if (opts.json) {
                        console.log(JSON.stringify({ success: false, error: msg }));
                    }
                    else {
                        error(msg);
                    }
                    process.exit(1);
                }
            }
            const brief = await services.intelligence.assembleBriefForMeeting(opts.meeting, paths, {
                projectOverride: opts.project,
            });
            await appendBriefInvocationTelemetry(root, '--meeting', opts.meeting);
            if (opts.json) {
                const { metadata, sections, sources, subject, subjectSlug, mode, truncated, truncatedSections, attendeeMiniBriefs } = brief;
                console.log(JSON.stringify({ mode, subject, subjectSlug, metadata, sections, sources, truncated, truncatedSections, attendeeMiniBriefs }, null, 2));
            }
            else {
                console.log(formatMeetingBriefMarkdown(brief));
            }
            return;
        }
        if (opts.project) {
            // --project (standalone, not an override) is a typed mode.
            const brief = await services.intelligence.assembleBriefForProject(opts.project, paths);
            await appendBriefInvocationTelemetry(root, '--project', opts.project);
            if (opts.json) {
                const { metadata, sections, sources, subject, subjectSlug, mode, truncated, truncatedSections } = brief;
                console.log(JSON.stringify({ mode, subject, subjectSlug, metadata, sections, sources, truncated, truncatedSections }, null, 2));
            }
            else {
                console.log(formatProjectBriefMarkdown(brief));
            }
            return;
        }
        // ----------------- Free-text --for mode (unchanged) -----------------
        const task = opts.for;
        if (!task?.trim()) {
            const msg = 'Missing --for. Usage: arete brief --for "create PRD"';
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: msg }));
            }
            else {
                error('Missing --for option');
                info('Usage: arete brief --for "topic"');
            }
            process.exit(1);
        }
        const primitives = parsePrimitives(opts.primitives);
        const briefing = await services.intelligence.assembleBriefing({
            task,
            paths,
            skillName: opts.skill,
            primitives,
        });
        if (opts.json) {
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
                raw: briefing.markdown,
            }, null, 2));
            return;
        }
        console.log(briefing.markdown);
    });
}
//# sourceMappingURL=intelligence.js.map