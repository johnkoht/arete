/**
 * Intelligence commands — context, memory, resolve, brief
 */
import { createServices, PRODUCT_PRIMITIVES } from '@arete/core';
import chalk from 'chalk';
import { header, info, success, warn, error, listItem, } from '../formatters.js';
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
        if (opts.json) {
            console.log(JSON.stringify({
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
        if (opts.json) {
            console.log(JSON.stringify({ success: true, query, total: result.total, results: result.results }, null, 2));
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
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
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
export function registerBriefCommand(program) {
    program
        .command('brief')
        .description('Assemble primitive briefing before running a skill')
        .requiredOption('--for <query>', 'Task description')
        .option('--skill <name>', 'Skill name for the briefing')
        .option('--primitives <list>', 'Comma-separated primitives')
        .option('--json', 'Output as JSON')
        .action(async (opts) => {
        const task = opts.for;
        if (!task?.trim()) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'Missing --for. Usage: arete brief --for "create PRD"',
                }));
            }
            else {
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
            }
            else {
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
        console.log('');
        console.log(briefing.markdown);
    });
}
//# sourceMappingURL=intelligence.js.map