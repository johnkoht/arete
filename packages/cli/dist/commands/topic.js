/**
 * Topic commands — list, show, refresh, lint
 *
 * The `arete topic` noun (mirrors `arete people`) surfaces the L3
 * topic-wiki layer: list all topics, view a single topic page, refresh
 * a topic's narrative from meetings that mention it, lint for stale /
 * stub / orphan topics.
 *
 * Seed (one-shot backfill from all meetings) is separate — see Step 8.
 */
import { createServices, renderTopicPage, estimateRefreshCostUsd, parseMeetingFile, acquireSeedLock, SeedLockHeldError, getActiveTopics, renderActiveTopicsAsSlugList, } from '@arete/core';
import { join, basename } from 'node:path';
import chalk from 'chalk';
import { header, listItem, error, info, success, warn, } from '../formatters.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const STALE_DAYS = 60;
function daysSince(dateStr) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime()))
        return Infinity;
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}
function today() {
    return new Date().toISOString().slice(0, 10);
}
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
export function registerTopicCommands(program) {
    const topicCmd = program
        .command('topic')
        .description('List, view, refresh, and lint topic pages (L3 wiki memory)');
    // ---------------------------------------------------------------------------
    // arete topic list
    // ---------------------------------------------------------------------------
    topicCmd
        .command('list')
        .description('List all topic pages')
        .option('--area <slug>', 'Filter to topics in this area')
        .option('--active', 'Filter to active topics (open items OR refreshed within recency window)')
        .option('--slugs', 'Emit the bare-slug active-topics list (the same shape the meeting-extraction prompt is biased with). Requires --active. With --json: { slugs: string[] }; without --json: one `slug — status: summary` per line.')
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
        const { topics, errors } = await services.topicMemory.listAll(paths);
        // ---- --active --slugs primitive ------------------------------------
        // Emits the active-topics slug list (canonical interchange shape used
        // by the meeting-extraction prompt bias). External consumers — e.g.
        // the slack-digest skill — pipe this into their own extraction prompts
        // so both source classes propose against the same slug universe.
        //
        // Implementation deliberately calls
        // `renderActiveTopicsAsSlugList(getActiveTopics(...))` directly. Do
        // NOT inline a slug-list renderer here; rendering must be reachable
        // from one place to keep the dual-tier sprawl defense single-sourced.
        if (opts.slugs) {
            if (opts.active !== true) {
                if (opts.json) {
                    console.log(JSON.stringify({ success: false, error: '--slugs requires --active' }));
                }
                else {
                    error('--slugs requires --active.');
                    info('e.g., `arete topic list --active --slugs --json`');
                }
                process.exit(1);
            }
            const activeEntries = getActiveTopics(topics);
            if (opts.json) {
                // JSON object form per PRD AC: `{ slugs: string[] }`. This is the
                // canonical interchange shape; consumers parse `.slugs` to feed
                // the meeting-extraction-equivalent prompt bias.
                console.log(JSON.stringify({
                    slugs: activeEntries.map((e) => e.slug),
                }));
            }
            else {
                // Plain form: byte-equal to renderActiveTopicsAsSlugList output.
                // (The meeting-extraction prompt embeds this exact string.)
                const rendered = renderActiveTopicsAsSlugList(activeEntries);
                if (rendered.length > 0)
                    console.log(rendered);
            }
            return;
        }
        const filtered = opts.area !== undefined
            ? topics.filter((t) => t.frontmatter.area === opts.area)
            : topics;
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                count: filtered.length,
                topics: filtered.map((t) => ({
                    slug: t.frontmatter.topic_slug,
                    area: t.frontmatter.area ?? null,
                    status: t.frontmatter.status,
                    last_refreshed: t.frontmatter.last_refreshed,
                    sources: t.frontmatter.sources_integrated.length,
                })),
                errors,
            }, null, 2));
            return;
        }
        header(opts.area !== undefined ? `Topics — ${opts.area}` : 'Topics');
        if (filtered.length === 0) {
            if (opts.area !== undefined) {
                info(`No topic pages tagged to area "${opts.area}".`);
            }
            else {
                info('No topic pages yet.');
                console.log(chalk.dim('  Topics are materialized by `arete meeting apply` or `arete topic refresh`.'));
            }
            if (errors.length > 0) {
                console.log('');
                warn(`${errors.length} topic file(s) could not be parsed — run \`arete topic lint\``);
            }
            return;
        }
        console.log('');
        console.log(chalk.dim('  Slug                         Area              Status       Last refreshed  Sources'));
        console.log(chalk.dim('  ' + '-'.repeat(90)));
        const sorted = [...filtered].sort((a, b) => a.frontmatter.topic_slug < b.frontmatter.topic_slug ? -1 : 1);
        for (const t of sorted) {
            const slug = (t.frontmatter.topic_slug + ' ').slice(0, 30).padEnd(30);
            const area = ((t.frontmatter.area ?? '—') + ' ').slice(0, 18).padEnd(18);
            const status = t.frontmatter.status.padEnd(12);
            const lastRef = t.frontmatter.last_refreshed.padEnd(16);
            const sources = String(t.frontmatter.sources_integrated.length);
            console.log(`  ${slug} ${area} ${status} ${lastRef} ${sources}`);
        }
        console.log('');
        listItem('Total', String(filtered.length));
        if (errors.length > 0) {
            warn(`${errors.length} topic file(s) could not be parsed — run \`arete topic lint\``);
        }
        console.log('');
    });
    // ---------------------------------------------------------------------------
    // arete topic show <slug>
    // ---------------------------------------------------------------------------
    topicCmd
        .command('show <slug>')
        .description('Print a topic page')
        .option('--json', 'Output as JSON (frontmatter + sections)')
        .action(async (slug, opts) => {
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
        const { topics } = await services.topicMemory.listAll(paths);
        const match = topics.find((t) => t.frontmatter.topic_slug === slug);
        if (!match) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: `Topic "${slug}" not found` }));
            }
            else {
                error(`Topic "${slug}" not found`);
                info('Run `arete topic list` to see available topics.');
            }
            process.exit(1);
        }
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                topic: match,
            }, null, 2));
            return;
        }
        console.log(renderTopicPage(match));
    });
    // ---------------------------------------------------------------------------
    // arete topic refresh [slug]
    // ---------------------------------------------------------------------------
    topicCmd
        .command('refresh [slug]')
        .description('Refresh existing topic page(s) by re-integrating source meetings (LLM-gated). Use `arete topic seed` to create new pages from meeting frontmatter.')
        .option('--all', 'Refresh every topic (otherwise slug is required)')
        .option('--dry-run', 'Preview what would be refreshed; no LLM calls, no writes')
        .option('--allow-no-llm', 'Write Source trail only when no AI is configured (default: abort)')
        .option('-y, --yes', 'Skip the interactive confirmation prompt (scripted mode)')
        .option('--cost-threshold <usd>', 'Estimated-cost threshold that triggers confirm (default 1.00)', parseFloat, 1.00)
        .option('--json', 'Output as JSON')
        .action(async (slug, opts) => {
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
        if (!slug && !opts.all) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: 'Specify a slug or --all' }));
            }
            else {
                error('Specify a topic slug or pass --all.');
                info('e.g., `arete topic refresh cover-whale-templates`');
            }
            process.exit(1);
        }
        // Honor ARETE_NO_LLM envvar regardless of AI configuration.
        const noLlmEnv = process.env.ARETE_NO_LLM === '1';
        const callLLM = services.ai.isConfigured() && !noLlmEnv
            ? async (prompt) => {
                const result = await services.ai.call('synthesis', prompt);
                return result.text;
            }
            : undefined;
        if (callLLM === undefined && !opts.allowNoLlm && !opts.dryRun) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'AI not configured — pass --allow-no-llm to write source trails only',
                }));
            }
            else {
                error(noLlmEnv
                    ? 'ARETE_NO_LLM=1 is set. Topic refresh requires an LLM for narrative synthesis.'
                    : 'AI not configured. Topic refresh requires an LLM for narrative synthesis.');
                info('Pass --allow-no-llm to write Source trail entries only (no narrative).');
            }
            process.exit(1);
        }
        // --- Cost estimate via dry-run through the batch helper. This also
        // surfaces how many integrations would actually happen (accounting for
        // content-hash dedup of previously-integrated meetings).
        const slugs = opts.all ? undefined : slug !== undefined ? [slug] : [];
        const estimate = await services.topicMemory.refreshAllFromSources(paths, {
            today: today(),
            dryRun: true,
            slugs,
        });
        const integrationsNeeded = estimate.totalIntegrated;
        const estimatedCost = estimateRefreshCostUsd(integrationsNeeded);
        if (estimate.topics.length === 0) {
            if (opts.json) {
                console.log(JSON.stringify({ success: true, refreshed: [], message: 'No topics to refresh' }));
            }
            else {
                info('No topics to refresh.');
            }
            return;
        }
        // Confirm-gate: required when cost crosses threshold AND not scripted.
        if (!opts.dryRun && callLLM !== undefined && estimatedCost >= opts.costThreshold && !opts.yes) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'confirm_required',
                    estimate: {
                        topics: estimate.topics.length,
                        integrations: integrationsNeeded,
                        cost_usd: estimatedCost,
                        threshold_usd: opts.costThreshold,
                    },
                    hint: 'Re-run with --yes to proceed, or --dry-run to inspect.',
                }, null, 2));
            }
            else {
                warn(`Will integrate ${integrationsNeeded} source(s) across ${estimate.topics.length} topic(s) ` +
                    `— estimated cost ~$${estimatedCost.toFixed(2)}.`);
                info('Re-run with --yes to proceed, or --dry-run for a no-spend preview.');
            }
            process.exit(0);
        }
        // If dry-run, just report the estimate and exit.
        if (opts.dryRun) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: true,
                    dryRun: true,
                    topics: estimate.topics,
                    estimate: {
                        integrations: integrationsNeeded,
                        cost_usd: estimatedCost,
                    },
                }, null, 2));
                return;
            }
            header('Topic Refresh (dry run)');
            for (const t of estimate.topics) {
                if (t.status === 'no-sources') {
                    info(`${t.slug}: no meetings tag this topic yet`);
                    continue;
                }
                const parts = [];
                if (t.integrated > 0)
                    parts.push(chalk.green(`${t.integrated} would integrate`));
                if (t.skipped > 0)
                    parts.push(chalk.dim(`${t.skipped} already integrated`));
                console.log(`  ${t.slug}: ${parts.join(', ')}`);
            }
            if (integrationsNeeded > 0) {
                console.log('');
                info(`Estimated cost: ~$${estimatedCost.toFixed(2)} for ${integrationsNeeded} integration(s).`);
            }
            return;
        }
        // Real run via the shared batch helper. Acquires `.seed.lock` so
        // concurrent refresh (e.g., from `arete memory refresh` in cron)
        // cannot race on topic-page writes.
        let result;
        try {
            result = await services.topicMemory.refreshAllFromSources(paths, {
                today: today(),
                callLLM,
                slugs,
                workspaceRoot: root,
                lockLabel: 'topic refresh',
            });
        }
        catch (err) {
            if (err instanceof Error && err.name === 'SeedLockHeldError') {
                if (opts.json) {
                    console.log(JSON.stringify({
                        success: false,
                        error: 'seed_lock_held',
                        hint: err.message,
                    }, null, 2));
                }
                else {
                    error(err.message);
                    info('Wait for the other refresh/seed to finish.');
                }
                process.exit(1);
            }
            throw err;
        }
        // Log event (best-effort)
        try {
            await services.memoryLog.append(paths, {
                event: 'refresh',
                fields: {
                    scope: opts.all ? 'topic_all' : 'topic_one',
                    targets: String(result.topics.length),
                    integrated: String(result.totalIntegrated),
                    fallback: String(result.totalFallback),
                    skipped: String(result.totalSkipped),
                },
            });
        }
        catch {
            // best-effort
        }
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                dryRun: false,
                topics: result.topics,
                totals: {
                    integrated: result.totalIntegrated,
                    fallback: result.totalFallback,
                    skipped: result.totalSkipped,
                },
            }, null, 2));
            return;
        }
        header('Topic Refresh');
        for (const t of result.topics) {
            if (t.status === 'no-sources') {
                info(`${t.slug}: no meetings tag this topic yet`);
                continue;
            }
            const parts = [];
            if (t.integrated > 0)
                parts.push(chalk.green(`${t.integrated} integrated`));
            if (t.fallback > 0)
                parts.push(chalk.yellow(`${t.fallback} fallback`));
            if (t.skipped > 0)
                parts.push(chalk.dim(`${t.skipped} skipped`));
            console.log(`  ${t.slug}: ${parts.join(', ')}`);
        }
        if (result.totalIntegrated > 0) {
            success(`Refreshed ${result.topics.length} topic(s), ${result.totalIntegrated} sources integrated.`);
        }
    });
    // ---------------------------------------------------------------------------
    // arete topic find <query>
    // ---------------------------------------------------------------------------
    topicCmd
        .command('find <query>')
        .description('Retrieve relevant topic pages for skill context injection')
        .option('--limit <n>', 'Top k topics to return (default 3)', parseInt, 3)
        .option('--area <slug>', 'Boost topics tagged to this area')
        .option('--budget <n>', 'Word budget for bodyForContext per topic (default 1000)', parseInt, 1000)
        .option('--json', 'Output as JSON (skills consume this)')
        .action(async (query, opts) => {
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
        const retrieval = await services.topicMemory.retrieveRelevant(query, {
            limit: opts.limit,
            area: opts.area,
            budgetWords: opts.budget,
        });
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                query,
                results: retrieval.results,
                searchBackend: retrieval.searchBackend,
            }, null, 2));
            return;
        }
        header(`Topic Retrieval — "${query}"`);
        if (retrieval.searchBackend === 'none') {
            warn('No search provider configured — topic retrieval unavailable.');
            info('Run `arete index` to set up qmd, or install the fallback provider.');
            return;
        }
        if (retrieval.results.length === 0) {
            info('No matching topics.');
            return;
        }
        for (const r of retrieval.results) {
            console.log('');
            console.log(chalk.bold(`[[${r.slug}]]`) + chalk.dim(` (score ${r.score.toFixed(2)})`));
            const area = r.frontmatter.area !== undefined ? `area: ${r.frontmatter.area} • ` : '';
            console.log(chalk.dim(`  ${area}status: ${r.frontmatter.status} • updated: ${r.frontmatter.last_refreshed}`));
            if (r.bodyForContext.length > 0) {
                console.log('');
                console.log(r.bodyForContext);
            }
        }
        console.log('');
    });
    // ---------------------------------------------------------------------------
    // arete topic lint
    // ---------------------------------------------------------------------------
    topicCmd
        .command('lint')
        .description('Flag stale, stub, and orphan topic pages')
        .option('--fix-dangling', 'Rewrite dangling wikilinks to plain text (removes [[brackets]] for targets that no longer exist)')
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
        const { topics, errors: parseErrors } = await services.topicMemory.listAll(paths);
        // Known-valid wikilink targets: topic slugs + person slugs + area slugs.
        // Anything pointing outside this set is flagged as dangling.
        const allSlugs = new Set(topics.map((t) => t.frontmatter.topic_slug));
        const people = await services.entity.listPeople(paths).catch(() => []);
        const personSlugs = new Set(people.map((p) => p.slug));
        const areas = await services.areaParser.listAreas().catch(() => []);
        const areaSlugs = new Set(areas.map((a) => a.slug));
        // Meeting-file refs (date-prefixed filenames without `.md`) are valid
        // targets from Source trail and are resolved elsewhere (Obsidian
        // follows the filename). Recognize them by pattern.
        const meetingSlugRe = /^\d{4}-\d{2}-\d{2}-/;
        // Sections we scan for dangling refs. Source trail intentionally
        // excluded — it records meeting wikilinks by design.
        const DANGLING_SCAN_SECTIONS = [
            'Current state',
            'Why/background',
            'Scope and behavior',
            'Rollout/timeline',
            'Open questions',
            'Known gaps',
            'Relationships',
            'Change log',
        ];
        // Find inbound wikilink references across all topic pages for orphan
        // detection — a topic with zero inbound references from another topic
        // is an orphan. (Source trail IS scanned here because self-references
        // should not satisfy the orphan check.)
        const refRe = /\[\[([a-z0-9-]+)\]\]/g;
        const inboundRefs = new Map(); // target → sources
        for (const t of topics) {
            const fromSlug = t.frontmatter.topic_slug;
            const body = Object.values(t.sections).join('\n');
            let m;
            while ((m = refRe.exec(body)) !== null) {
                const target = m[1];
                if (target === fromSlug)
                    continue; // self-ref doesn't count
                if (!inboundRefs.has(target))
                    inboundRefs.set(target, new Set());
                inboundRefs.get(target).add(fromSlug);
            }
        }
        const stale = [];
        const stub = [];
        const orphan = [];
        const dangling = [];
        for (const t of topics) {
            const slug = t.frontmatter.topic_slug;
            if (daysSince(t.frontmatter.last_refreshed) > STALE_DAYS) {
                stale.push(slug);
            }
            const current = t.sections['Current state'];
            if (current === undefined || current.trim().length === 0) {
                stub.push(slug);
            }
            if ((inboundRefs.get(slug)?.size ?? 0) === 0) {
                orphan.push(slug);
            }
            // Dangling refs — scan narrative sections only, exclude Source trail.
            // Resolve targets against topics ∪ people ∪ areas ∪ meeting-slug pattern.
            for (const sectionName of DANGLING_SCAN_SECTIONS) {
                const body = t.sections[sectionName];
                if (body === undefined)
                    continue;
                const re = /\[\[([a-z0-9-]+)\]\]/g;
                let m;
                while ((m = re.exec(body)) !== null) {
                    const target = m[1];
                    if (allSlugs.has(target))
                        continue;
                    if (personSlugs.has(target))
                        continue;
                    if (areaSlugs.has(target))
                        continue;
                    if (meetingSlugRe.test(target))
                        continue;
                    dangling.push({ fromSlug: slug, toSlug: target });
                }
            }
        }
        // ---- --fix-dangling action ----------------------------------------
        // Rewrite dangling `[[slug]]` references to plain text `slug` in each
        // topic's narrative sections. Leaves Source trail untouched (we didn't
        // scan it in the first place). Idempotent via writeIfChanged.
        let fixedCount = 0;
        const fixedPaths = [];
        if (opts.fixDangling && dangling.length > 0) {
            const { renderTopicPage } = await import('@arete/core');
            // Group dangling refs by source slug for batched per-page rewrites.
            const danglingByTopic = new Map();
            for (const d of dangling) {
                if (!danglingByTopic.has(d.fromSlug))
                    danglingByTopic.set(d.fromSlug, new Set());
                danglingByTopic.get(d.fromSlug).add(d.toSlug);
            }
            for (const [fromSlug, toSlugs] of danglingByTopic) {
                const page = topics.find((t) => t.frontmatter.topic_slug === fromSlug);
                if (!page)
                    continue;
                let pageMutated = false;
                const newSections = { ...page.sections };
                for (const sectionName of DANGLING_SCAN_SECTIONS) {
                    const body = page.sections[sectionName];
                    if (body === undefined)
                        continue;
                    let rewritten = body;
                    let sectionMutated = false;
                    for (const target of toSlugs) {
                        // Global, word-boundary-safe replace of [[target]] → target
                        const re = new RegExp(`\\[\\[${target.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\]\\]`, 'g');
                        const next = rewritten.replace(re, target);
                        if (next !== rewritten) {
                            rewritten = next;
                            sectionMutated = true;
                        }
                    }
                    if (sectionMutated) {
                        newSections[sectionName] = rewritten;
                        pageMutated = true;
                    }
                }
                if (pageMutated) {
                    const outPath = join(paths.memory, 'topics', `${fromSlug}.md`);
                    const newContent = renderTopicPage({ ...page, sections: newSections });
                    if (services.storage.writeIfChanged !== undefined) {
                        const r = await services.storage.writeIfChanged(outPath, newContent);
                        if (r === 'updated') {
                            fixedCount += toSlugs.size;
                            fixedPaths.push(fromSlug);
                        }
                    }
                    else {
                        await services.storage.write(outPath, newContent);
                        fixedCount += toSlugs.size;
                        fixedPaths.push(fromSlug);
                    }
                }
            }
        }
        const findings = {
            stale,
            stub,
            orphan,
            dangling,
            parse_errors: parseErrors.map((e) => ({ path: e.path, reason: e.reason })),
            ...(opts.fixDangling
                ? { fixed: { dangling: fixedCount, topicsModified: fixedPaths } }
                : {}),
        };
        const totalFindings = stale.length + stub.length + orphan.length + dangling.length + parseErrors.length;
        // Log event
        try {
            await services.memoryLog.append(paths, {
                event: 'lint',
                fields: {
                    findings: String(totalFindings),
                    stale: String(stale.length),
                    stub: String(stub.length),
                    orphan: String(orphan.length),
                    dangling: String(dangling.length),
                },
            });
        }
        catch {
            // best-effort
        }
        if (opts.json) {
            console.log(JSON.stringify({ success: true, findings, total: totalFindings }, null, 2));
            return;
        }
        header('Topic Lint');
        if (totalFindings === 0) {
            success('No findings.');
            return;
        }
        if (stale.length > 0) {
            warn(`Stale (not refreshed in >${STALE_DAYS}d): ${stale.length}`);
            for (const s of stale)
                console.log(`  - ${s}`);
        }
        if (stub.length > 0) {
            warn(`Stub (empty or missing Current state): ${stub.length}`);
            for (const s of stub)
                console.log(`  - ${s}`);
        }
        if (orphan.length > 0) {
            warn(`Orphan (no inbound [[refs]]): ${orphan.length}`);
            for (const s of orphan)
                console.log(`  - ${s}`);
        }
        if (dangling.length > 0) {
            const fixedNote = opts.fixDangling && fixedCount > 0
                ? ` — ${chalk.green(`${fixedCount} rewritten to plain text across ${fixedPaths.length} topic(s)`)}`
                : opts.fixDangling
                    ? ` — ${chalk.dim('(nothing to fix)')}`
                    : '';
            warn(`Dangling refs (wikilink → missing topic or person): ${dangling.length}${fixedNote}`);
            for (const d of dangling)
                console.log(`  - [[${d.toSlug}]] from ${d.fromSlug}`);
        }
        if (parseErrors.length > 0) {
            error(`Parse errors: ${parseErrors.length}`);
            for (const e of parseErrors)
                console.log(`  - ${e.path}: ${e.reason}`);
        }
        console.log('');
        listItem('Total findings', String(totalFindings));
    });
    // ---------------------------------------------------------------------------
    // arete topic seed
    // ---------------------------------------------------------------------------
    topicCmd
        .command('seed')
        .description('One-shot backfill: create topic pages for every unique slug found across all historical meeting frontmatter. Use this once when adopting topic-wiki-memory on an existing workspace; `arete meeting approve` integrates new meetings incrementally thereafter. LLM-spending.')
        .option('--dry-run', 'Preview scope + cost estimate without spending LLM')
        .option('-y, --yes', 'Skip the interactive confirmation prompt')
        .option('--allow-no-llm', 'Write Source trail only (no narrative synthesis)')
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
        // ---- Scan meetings for unique topic slugs --------------------------
        // Run BEFORE the AI-configured check so empty workspaces exit 0 with a
        // clear "nothing to seed" message rather than a misleading AI error.
        const meetingsDir = join(paths.resources, 'meetings');
        const meetingFiles = (await services.storage.exists(meetingsDir))
            ? await services.storage.list(meetingsDir, { extensions: ['.md'] })
            : [];
        const slugSet = new Set();
        let meetingsWithTopics = 0;
        for (const meetingPath of meetingFiles) {
            if (basename(meetingPath) === 'index.md')
                continue;
            const content = await services.storage.read(meetingPath);
            if (content === null)
                continue;
            const parsed = parseMeetingFile(content);
            if (!parsed)
                continue;
            const topics = parsed.frontmatter.topics;
            if (!Array.isArray(topics) || topics.length === 0)
                continue;
            meetingsWithTopics++;
            for (const t of topics) {
                if (typeof t === 'string' && t.length > 0)
                    slugSet.add(t);
            }
        }
        if (slugSet.size === 0) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: true,
                    message: 'No meetings with topics frontmatter found — nothing to seed',
                    meetings_scanned: meetingFiles.length,
                }));
            }
            else {
                info('No meetings with topics frontmatter found.');
                info('Seed runs over extracted topic slugs; ensure `arete meeting apply` has run on historical meetings first.');
            }
            return;
        }
        const targetSlugs = [...slugSet].sort();
        // ---- AI configuration check (only matters when there IS work to do) -
        const noLlmEnv = process.env.ARETE_NO_LLM === '1';
        const callLLM = services.ai.isConfigured() && !noLlmEnv
            ? async (prompt) => {
                const result = await services.ai.call('synthesis', prompt);
                return result.text;
            }
            : undefined;
        if (callLLM === undefined && !opts.allowNoLlm && !opts.dryRun) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'AI not configured — pass --allow-no-llm to seed with source trails only',
                }));
            }
            else {
                error(noLlmEnv
                    ? 'ARETE_NO_LLM=1 is set. Seed requires an LLM for narrative synthesis.'
                    : 'AI not configured. Seed requires an LLM for narrative synthesis.');
                info('Pass --allow-no-llm to backfill Source trail entries only.');
            }
            process.exit(1);
        }
        // ---- Cost estimate via dry-run through the batch helper ------------
        const estimate = await services.topicMemory.refreshAllFromSources(paths, {
            today: today(),
            dryRun: true,
            slugs: targetSlugs,
        });
        const integrationsNeeded = estimate.totalIntegrated;
        const estimatedCost = estimateRefreshCostUsd(integrationsNeeded);
        // ---- Seed budget ceiling (pre-mortem Risk 2) -----------------------
        // Honors ARETE_SEED_MAX_USD env var (default $50 — more generous than
        // the per-refresh $1 confirm threshold because seed is explicitly bulk).
        const seedMaxUsdEnv = process.env.ARETE_SEED_MAX_USD;
        const seedMaxUsd = seedMaxUsdEnv !== undefined && Number.isFinite(parseFloat(seedMaxUsdEnv))
            ? parseFloat(seedMaxUsdEnv)
            : 50.0;
        if (callLLM !== undefined && estimatedCost > seedMaxUsd) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'seed_cost_exceeds_ceiling',
                    estimate: {
                        topics: targetSlugs.length,
                        integrations: integrationsNeeded,
                        cost_usd: estimatedCost,
                        max_usd: seedMaxUsd,
                    },
                    hint: 'Raise ARETE_SEED_MAX_USD or narrow scope via arete topic refresh --slug <slug>.',
                }, null, 2));
            }
            else {
                error(`Estimated cost $${estimatedCost.toFixed(2)} exceeds ceiling $${seedMaxUsd.toFixed(2)} ` +
                    `(${integrationsNeeded} integrations across ${targetSlugs.length} topics).`);
                info('Raise ceiling with `ARETE_SEED_MAX_USD=100 arete topic seed`, or refresh slugs one at a time.');
            }
            process.exit(1);
        }
        // ---- Confirm gate --------------------------------------------------
        if (!opts.dryRun && callLLM !== undefined && !opts.yes) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'confirm_required',
                    estimate: {
                        topics: targetSlugs.length,
                        integrations: integrationsNeeded,
                        cost_usd: estimatedCost,
                        meetings_scanned: meetingsWithTopics,
                    },
                    hint: 'Re-run with --yes to proceed, or --dry-run to inspect.',
                }, null, 2));
            }
            else {
                warn(`Seed will integrate ${integrationsNeeded} source(s) across ${targetSlugs.length} ` +
                    `topic(s) from ${meetingsWithTopics} meeting(s).`);
                warn(`Estimated cost ~$${estimatedCost.toFixed(2)} (ceiling $${seedMaxUsd.toFixed(2)}).`);
                info('Re-run with --yes to proceed, or --dry-run for a no-spend preview.');
            }
            process.exit(0);
        }
        // ---- Dry-run output ------------------------------------------------
        if (opts.dryRun) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: true,
                    dryRun: true,
                    meetings_with_topics: meetingsWithTopics,
                    unique_slugs: targetSlugs.length,
                    topics: estimate.topics,
                    estimate: {
                        integrations: integrationsNeeded,
                        cost_usd: estimatedCost,
                        max_usd: seedMaxUsd,
                    },
                }, null, 2));
                return;
            }
            header('Topic Seed (dry run)');
            listItem('Meetings with topics', String(meetingsWithTopics));
            listItem('Unique topic slugs', String(targetSlugs.length));
            listItem('Integrations needed', String(integrationsNeeded));
            listItem('Estimated cost', `~$${estimatedCost.toFixed(2)}`);
            listItem('Ceiling (ARETE_SEED_MAX_USD)', `$${seedMaxUsd.toFixed(2)}`);
            console.log('');
            info('Pass --yes to proceed.');
            return;
        }
        // ---- Acquire seed lock (pre-mortem Risk 15) ------------------------
        // Prevents concurrent `arete meeting apply` from racing on topic-page
        // writes while seed is in flight. Lock file lives at `.arete/.seed.lock`.
        const areteDir = join(paths.root, '.arete');
        let releaseLock;
        try {
            releaseLock = await acquireSeedLock(areteDir, 'topic seed');
        }
        catch (err) {
            if (err instanceof SeedLockHeldError) {
                if (opts.json) {
                    console.log(JSON.stringify({
                        success: false,
                        error: 'seed_lock_held',
                        lock: err.info,
                        hint: 'Wait for the other seed/refresh to finish, or `arete topic seed --break-lock` if stale.',
                    }, null, 2));
                }
                else {
                    error(err.message);
                    info('If the previous process crashed, clear the stale lock file at .arete/.seed.lock.');
                }
                process.exit(1);
            }
            throw err;
        }
        // ---- Real run ------------------------------------------------------
        // Seed holds the outer .seed.lock; pass `skipLock: true` so the
        // service doesn't try to double-acquire.
        let result;
        try {
            result = await services.topicMemory.refreshAllFromSources(paths, {
                today: today(),
                callLLM,
                slugs: targetSlugs,
                skipLock: true,
            });
        }
        finally {
            if (releaseLock !== undefined) {
                await releaseLock();
            }
        }
        // Log event
        try {
            await services.memoryLog.append(paths, {
                event: 'seed',
                fields: {
                    meetings: String(meetingsWithTopics),
                    topics_total: String(targetSlugs.length),
                    integrated: String(result.totalIntegrated),
                    fallback: String(result.totalFallback),
                    skipped: String(result.totalSkipped),
                    llm_cost_usd: estimatedCost.toFixed(4),
                },
            });
        }
        catch {
            // best-effort
        }
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                dryRun: false,
                meetings_scanned: meetingsWithTopics,
                topics: result.topics,
                totals: {
                    integrated: result.totalIntegrated,
                    fallback: result.totalFallback,
                    skipped: result.totalSkipped,
                },
            }, null, 2));
            return;
        }
        header('Topic Seed');
        success(`Integrated ${result.totalIntegrated} source(s) across ${result.topics.length} topic(s).`);
        if (result.totalFallback > 0) {
            warn(`${result.totalFallback} fallback(s) — LLM errors; re-run seed to upgrade when AI is stable.`);
        }
        if (result.totalSkipped > 0) {
            info(`${result.totalSkipped} already-integrated source(s) skipped (idempotent).`);
        }
        console.log('');
        info('Run `arete topic list` to see materialized topic pages.');
    });
}
//# sourceMappingURL=topic.js.map