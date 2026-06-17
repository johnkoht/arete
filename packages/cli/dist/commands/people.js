/**
 * People commands — list, show, index
 */
import { createServices, loadConfig, refreshQmdIndex, extractPersonMemorySection, readPersonChannels, PEOPLE_CATEGORIES, } from '@arete/core';
import { join } from 'node:path';
import { promises as fsp, existsSync, readFileSync, readdirSync } from 'node:fs';
import * as readline from 'node:readline';
import chalk from 'chalk';
import { header, section, listItem, error, info, formatPath, } from '../formatters.js';
import { displayQmdResult } from '../lib/qmd-output.js';
export function registerPeopleCommands(program) {
    const peopleCmd = program
        .command('people')
        .description('List and show people');
    peopleCmd
        .command('list')
        .description('List people in the workspace')
        .option('--category <name>', 'Filter: internal, customers, or users')
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
        const category = parseCategory(opts.category);
        const people = await services.entity.listPeople(paths, category ? { category } : {});
        if (opts.json) {
            console.log(JSON.stringify({ success: true, people, count: people.length }, null, 2));
            return;
        }
        header('People');
        if (people.length === 0) {
            info('No people files yet.');
            console.log(chalk.dim('  Add markdown files under people/internal/, people/customers/, or people/users/'));
            return;
        }
        console.log('');
        console.log(chalk.dim('  Name                    Slug                 Category   Email'));
        console.log(chalk.dim('  ' + '-'.repeat(80)));
        for (const p of people) {
            const name = (p.name + ' ').slice(0, 24).padEnd(24);
            const slug = (p.slug + ' ').slice(0, 20).padEnd(20);
            const cat = p.category.padEnd(10);
            const email = p.email ?? '—';
            console.log(`  ${name} ${slug} ${cat} ${email}`);
        }
        console.log('');
        listItem('Total', String(people.length));
        console.log('');
    });
    peopleCmd
        .command('show <slug-or-email>')
        .description('Show a person by slug or email')
        .option('--category <name>', 'Category when looking up by slug')
        .option('--memory', 'Include auto-generated memory highlights section')
        .option('--channels', 'Include populated channel fields (email, slack_user_id, etc.)')
        .option('--json', 'Output as JSON')
        .action(async (slugOrEmail, opts) => {
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
        const category = parseCategory(opts.category);
        let person = null;
        if (slugOrEmail.includes('@')) {
            person = await services.entity.getPersonByEmail(paths, slugOrEmail);
        }
        else if (category) {
            person = await services.entity.getPersonBySlug(paths, category, slugOrEmail);
        }
        else {
            for (const cat of PEOPLE_CATEGORIES) {
                person = await services.entity.getPersonBySlug(paths, cat, slugOrEmail);
                if (person)
                    break;
            }
        }
        if (!person) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'Person not found',
                    slugOrEmail,
                }));
            }
            else {
                error(`Person not found: ${slugOrEmail}`);
                if (!category)
                    info('Try specifying --category internal|customers|users');
            }
            process.exit(1);
        }
        let memoryHighlights = null;
        if (opts.memory) {
            const personPath = join(paths.people, person.category, `${person.slug}.md`);
            const personContent = await services.storage.read(personPath);
            memoryHighlights = personContent ? extractPersonMemorySection(personContent) : null;
        }
        // Phase 7a AC5b — --channels surfaces populated channel fields
        // (only populated fields are returned per convention).
        let channels = null;
        if (opts.channels) {
            const personPath = join(paths.people, person.category, `${person.slug}.md`);
            channels = await readPersonChannels(services.storage, personPath);
        }
        if (opts.json) {
            const out = {
                success: true,
                person,
                memoryHighlights,
            };
            if (opts.channels) {
                // Surface as a dedicated "channels" object even if empty.
                out.channels = channels ?? {};
            }
            console.log(JSON.stringify(out, null, 2));
            return;
        }
        section(person.name);
        listItem('Slug', person.slug);
        listItem('Category', person.category);
        if (person.email)
            listItem('Email', person.email);
        if (person.role)
            listItem('Role', person.role);
        if (person.team)
            listItem('Team', person.team);
        if (person.company)
            listItem('Company', person.company);
        console.log('');
        if (opts.memory) {
            if (memoryHighlights) {
                section('Memory Highlights (Auto)');
                console.log(memoryHighlights.trim());
                console.log('');
            }
            else {
                info('No auto memory highlights found for this person yet.');
                console.log('');
            }
        }
        if (opts.channels) {
            section('Channels');
            if (channels && Object.keys(channels).length > 0) {
                if (channels.email)
                    listItem('email', channels.email);
                if (channels.alt_emails && channels.alt_emails.length > 0) {
                    listItem('alt_emails', channels.alt_emails.join(', '));
                }
                if (channels.slack_user_id)
                    listItem('slack_user_id', channels.slack_user_id);
                if (channels.slack_handle)
                    listItem('slack_handle', channels.slack_handle);
                if (channels.phone)
                    listItem('phone', channels.phone);
            }
            else {
                info('No channel fields populated for this person.');
            }
            console.log('');
        }
        listItem('File', formatPath(`people/${person.category}/${person.slug}.md`));
        console.log('');
    });
    // Phase 7a AC5c — workspace-wide channel-population audit.
    // Walks people/{internal,users,customers}/*.md, counts populated
    // channel fields, returns aggregate health + per-person gap detail.
    peopleCmd
        .command('audit-channels')
        .description('Audit channel-field population across all people (Phase 7a AC5c). ' +
        'Surfaces what is populated workspace-wide so reconciler degraded-coverage cases are visible.')
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
        const audit = await services.entity.auditPeopleChannels(paths);
        if (opts.json) {
            console.log(JSON.stringify({ success: true, audit }, null, 2));
            return;
        }
        header('People — channels-audit');
        if (audit.total === 0) {
            info('No people files yet.');
            return;
        }
        listItem('Total people', String(audit.total));
        listItem('with_email', String(audit.with_email));
        listItem('with_alt_emails', String(audit.with_alt_emails));
        listItem('with_slack_user_id', String(audit.with_slack_user_id));
        listItem('with_slack_handle', String(audit.with_slack_handle));
        listItem('with_phone', String(audit.with_phone));
        listItem('no_channels (none populated)', String(audit.no_channels));
        console.log('');
        const missingSlack = audit.total - audit.with_slack_user_id;
        if (missingSlack > 0) {
            const pct = Math.round((audit.with_slack_user_id / audit.total) * 100);
            console.log(`  ${missingSlack} of ${audit.total} people missing slack_user_id; reconciler match-rate for slack→person is ~${pct}%.`);
            console.log('');
            console.log('  Backfill is user-maintained. Recognized channel fields in person frontmatter:');
            console.log('    email:           # primary email');
            console.log('    alt_emails: []   # alternate/historical emails');
            console.log('    slack_user_id:   # canonical Slack ID (e.g. U01ABC123) — survives @-handle changes');
            console.log('    slack_handle:    # @-mention name (e.g. alice) — mutable');
            console.log('    phone:           # E.164 format preferred');
            console.log('');
            console.log('  All fields optional; missing fields just mean that channel-match rule does not apply.');
        }
        console.log('');
        // Show top gaps (up to 10) so the user can quickly identify
        // who to backfill first.
        if (audit.gaps.length > 0) {
            section('Per-person gaps (top 10)');
            for (const gap of audit.gaps.slice(0, 10)) {
                const missingStr = gap.missing.join(', ');
                console.log(`  ${gap.slug} (${gap.category}) — missing: ${missingStr}`);
            }
            if (audit.gaps.length > 10) {
                console.log(`  …and ${audit.gaps.length - 10} more (use --json for full list).`);
            }
            console.log('');
        }
    });
    peopleCmd
        .command('index')
        .description('Regenerate people/index.md')
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
        await services.entity.buildPeopleIndex(paths);
        const people = await services.entity.listPeople(paths);
        // Auto-refresh qmd index after write
        let qmdResult;
        if (!opts.skipQmd) {
            const config = await loadConfig(services.storage, root);
            qmdResult = await refreshQmdIndex(root, config.qmd_collection);
        }
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                path: `${paths.people}/index.md`,
                count: people.length,
                qmd: qmdResult ?? { indexed: false, skipped: true },
            }));
            return;
        }
        info(`Updated people/index.md with ${people.length} person(s).`);
        displayQmdResult(qmdResult);
    });
    const intelligenceCmd = peopleCmd
        .command('intelligence')
        .description('People intelligence classification tools');
    intelligenceCmd
        .command('digest')
        .description('Generate batch people intelligence suggestions from JSON candidates')
        .requiredOption('--input <path>', 'Path to JSON array of candidate records')
        .option('--threshold <n>', 'Confidence threshold for unknown queue (default: policy or 0.65)')
        .option('--feature-extraction-tuning', 'Enable extraction-tuning feature toggle for this run')
        .option('--feature-enrichment', 'Enable optional enrichment feature for this run')
        .option('--extraction-quality <n>', 'Optional extraction quality score (0..1) to include in KPI snapshot')
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
        if (!opts.input) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: 'Missing --input path' }));
            }
            else {
                error('Missing --input path');
            }
            process.exit(1);
        }
        const inputPath = opts.input.startsWith('/') ? opts.input : join(root, opts.input);
        const raw = await services.storage.read(inputPath);
        if (!raw) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: `Input file not found: ${opts.input}` }));
            }
            else {
                error(`Input file not found: ${opts.input}`);
            }
            process.exit(1);
        }
        let candidates = [];
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                throw new Error('Input must be a JSON array');
            }
            candidates = parsed.filter((item) => typeof item === 'object' && item !== null);
        }
        catch (parseError) {
            const message = parseError instanceof Error ? parseError.message : 'Invalid JSON input';
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: message }));
            }
            else {
                error(message);
            }
            process.exit(1);
        }
        const thresholdRaw = opts.threshold ? Number(opts.threshold) : undefined;
        const confidenceThreshold = typeof thresholdRaw === 'number' && Number.isFinite(thresholdRaw)
            ? thresholdRaw
            : undefined;
        const extractionQualityRaw = opts.extractionQuality ? Number(opts.extractionQuality) : undefined;
        const extractionQualityScore = typeof extractionQualityRaw === 'number' && Number.isFinite(extractionQualityRaw)
            ? Math.min(1, Math.max(0, extractionQualityRaw))
            : undefined;
        const paths = services.workspace.getPaths(root);
        const digest = await services.entity.suggestPeopleIntelligence(candidates.map((candidate) => ({
            name: typeof candidate.name === 'string' ? candidate.name : undefined,
            email: typeof candidate.email === 'string' ? candidate.email : null,
            company: typeof candidate.company === 'string' ? candidate.company : null,
            text: typeof candidate.text === 'string' ? candidate.text : null,
            source: typeof candidate.source === 'string' ? candidate.source : null,
            actualRoleLens: candidate.actualRoleLens === 'customer' || candidate.actualRoleLens === 'user' || candidate.actualRoleLens === 'partner' || candidate.actualRoleLens === 'unknown'
                ? candidate.actualRoleLens
                : undefined,
        })), paths, {
            confidenceThreshold,
            extractionQualityScore,
            features: {
                enableExtractionTuning: Boolean(opts.featureExtractionTuning),
                enableEnrichment: Boolean(opts.featureEnrichment),
            },
        });
        if (opts.json) {
            console.log(JSON.stringify({ success: true, ...digest }, null, 2));
            return;
        }
        header('People Intelligence Digest');
        listItem('Mode', digest.mode);
        listItem('Candidates', String(digest.totalCandidates));
        listItem('Suggested', String(digest.suggestedCount));
        listItem('Unknown queue', String(digest.unknownQueueCount));
        listItem('Confidence threshold', digest.policy.confidenceThreshold.toFixed(2));
        listItem('Feature: extraction tuning', String(digest.policy.features.enableExtractionTuning));
        listItem('Feature: enrichment', String(digest.policy.features.enableEnrichment));
        listItem('Triage burden (min/week)', String(digest.metrics.triageBurdenMinutes));
        listItem('Misclassification rate', digest.metrics.misclassificationRate == null
            ? 'n/a (no reviewed labels)'
            : `${Math.round(digest.metrics.misclassificationRate * 100)}%`);
        listItem('Extraction quality score', digest.metrics.extractionQualityScore == null
            ? 'n/a'
            : digest.metrics.extractionQualityScore.toFixed(2));
        console.log('');
        for (const suggestion of digest.suggestions) {
            const label = suggestion.candidate.name ?? suggestion.candidate.email ?? '(unnamed candidate)';
            console.log(`- ${label}`);
            console.log(`  queue: ${suggestion.recommendation.category} | confidence: ${suggestion.confidence.toFixed(2)} | status: ${suggestion.status} | enrichment: ${suggestion.enrichmentApplied}`);
            console.log(`  rationale: ${suggestion.rationale}`);
        }
        console.log('');
        info('Default review mode is digest/batch (non-blocking).');
    });
    const memoryCmd = peopleCmd
        .command('memory')
        .description('Person memory utilities');
    memoryCmd
        .command('refresh')
        .description('Refresh auto-generated person memory highlights from meetings. ' +
        'Extracts asks, concerns, and action items via regex. ' +
        'Stance extraction uses an LLM by default (services.ai.call(\'extraction\', ...)); ' +
        'pass --no-llm to skip stance extraction.')
        .option('--person <slug>', 'Refresh only one person by slug')
        .option('--days <n>', 'Scope to meetings from the last N days (incremental; default scans the last 90 days)')
        .option('--full', 'Full rebuild over the last 90 days (the default; explicit override for --days)')
        .option('--min-mentions <n>', 'Minimum repeated mentions to include (default: 2)')
        .option('--if-stale-days <n>', 'Only refresh when Last refreshed is older than N days')
        .option('--dry-run', 'Preview what would be extracted without writing files')
        .option('--skip-qmd', 'Skip automatic qmd index update')
        // Phase 9 AC8a — callLLM wiring + cost gating
        .option('--no-llm', 'Skip stance extraction (no LLM calls); produces signal-only memory')
        .option('--yes', 'Bypass cost-preview confirm gate ($1 threshold; required for >$10 ceiling regardless)')
        .option('--snapshot-path <path>', 'Write a pre-refresh snapshot of AUTO_PERSON_MEMORY blocks to this path before writing')
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
        const minMentionsParsed = opts.minMentions ? parseInt(opts.minMentions, 10) : undefined;
        const minMentions = typeof minMentionsParsed === 'number' && !isNaN(minMentionsParsed)
            ? minMentionsParsed
            : undefined;
        const ifStaleDaysParsed = opts.ifStaleDays ? parseInt(opts.ifStaleDays, 10) : undefined;
        const ifStaleDays = typeof ifStaleDaysParsed === 'number' && !isNaN(ifStaleDaysParsed)
            ? ifStaleDaysParsed
            : undefined;
        // Incremental window. `--days N` scopes the meeting set (and the cost
        // estimate below) to the last N days; `--full` (or no flag) keeps the
        // 90-day default behavior. `--full` wins if both are passed.
        const daysParsed = opts.days ? parseInt(opts.days, 10) : undefined;
        const sinceDays = !opts.full && typeof daysParsed === 'number' && !isNaN(daysParsed) && daysParsed >= 0
            ? daysParsed
            : undefined;
        // -----------------------------------------------------------------
        // Phase 9 AC8a — LLM wiring + stance-specific cost estimator
        //
        // Stance extraction is per-person × per-meeting-they-appear-in
        // (see entity.ts:1354-1372). The topic.ts:415 cost-preview formula
        // models per-integration; that's the WRONG unit for stances.
        //
        // F2 mitigation: estimate by walking refreshable people and counting
        // their meeting appearances in the last 90 days; multiply by
        // COST_PER_STANCE_CALL. Calibrated at $0.015/call default. TODO:
        // empirically recalibrate post-build by dividing actual spend
        // across N extractions.
        //
        // F1 mitigation: snapshot AUTO_PERSON_MEMORY blocks BEFORE any
        // writes when --snapshot-path is provided.
        // -----------------------------------------------------------------
        const useLLM = opts.llm !== false; // commander inverts --no-llm
        let callLLM;
        let estimatedCost = 0;
        let stanceCallCount = 0;
        if (useLLM) {
            // Estimate (best-effort): count refreshable people × their meeting appearances in last 90d.
            // This is the AC8a stance-specific shape: count = Σ over people of
            // count(meetings person appears in, last 90d).
            const COST_PER_STANCE_CALL = 0.015; // TODO: empirically calibrate
            const COST_CEILING_USD = 10.0;
            const COST_CONFIRM_THRESHOLD_USD = 1.0;
            try {
                const allPeople = await services.entity.listPeople(paths);
                const targetPeople = opts.person
                    ? allPeople.filter((p) => p.slug === opts.person)
                    : allPeople;
                const meetingsDir = join(paths.resources, 'meetings');
                if (existsSync(meetingsDir)) {
                    // Scope the estimate to the SAME window the refresh will use:
                    // `--days N` → last N days, otherwise the 90-day default. Keeps an
                    // incremental run from estimating against the full corpus and
                    // tripping the cost-confirm gate.
                    const windowDays = typeof sinceDays === 'number' ? sinceDays : 90;
                    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
                        .toISOString()
                        .slice(0, 10);
                    const meetingFiles = readdirSync(meetingsDir).filter((f) => f.endsWith('.md') && f !== 'index.md');
                    for (const person of targetPeople) {
                        const nameLower = person.name.toLowerCase();
                        for (const meetingFile of meetingFiles) {
                            const dateMatch = meetingFile.match(/^(\d{4}-\d{2}-\d{2})-/);
                            if (!dateMatch || dateMatch[1] < cutoff)
                                continue;
                            // Cheap: filename contains person slug, OR file content includes person name.
                            if (meetingFile.toLowerCase().includes(person.slug.toLowerCase())) {
                                stanceCallCount++;
                                continue;
                            }
                            // Read content lazily — only when slug doesn't match filename.
                            try {
                                const content = readFileSync(join(meetingsDir, meetingFile), 'utf8');
                                if (content.toLowerCase().includes(nameLower))
                                    stanceCallCount++;
                            }
                            catch {
                                // skip unreadable
                            }
                        }
                    }
                }
                estimatedCost = stanceCallCount * COST_PER_STANCE_CALL;
            }
            catch {
                // Best-effort — if estimator fails, fall through to ceiling check
                // with stanceCallCount = 0 (no gate).
            }
            // Ceiling — borrowed from topic.ts:963 seedMaxUsd pattern. Above
            // this requires interactive TTY confirmation, NOT just --yes.
            if (estimatedCost > COST_CEILING_USD) {
                if (opts.json) {
                    console.log(JSON.stringify({
                        success: false,
                        error: 'cost_exceeds_ceiling',
                        estimate: { stanceCallCount, costUsd: estimatedCost, ceilingUsd: COST_CEILING_USD },
                        hint: 'Re-run in a TTY to confirm interactively; --yes is insufficient for this magnitude.',
                    }, null, 2));
                    process.exit(1);
                }
                const ok = await confirmInteractive(`Estimated $${estimatedCost.toFixed(2)} (${stanceCallCount} stance calls). Above $${COST_CEILING_USD.toFixed(2)} ceiling — proceed?`);
                if (!ok) {
                    info('Aborted by user.');
                    return;
                }
            }
            else if (!opts.dryRun &&
                estimatedCost >= COST_CONFIRM_THRESHOLD_USD &&
                !opts.yes) {
                if (opts.json) {
                    console.log(JSON.stringify({
                        success: false,
                        error: 'confirm_required',
                        estimate: { stanceCallCount, costUsd: estimatedCost },
                        hint: 'Re-run with --yes to proceed, or --dry-run to inspect.',
                    }, null, 2));
                    process.exit(0);
                }
                info(`Will extract stances for ~${stanceCallCount} person×meeting pairs — estimated cost ~$${estimatedCost.toFixed(2)}.`);
                info('Re-run with --yes to proceed, --no-llm to skip stance extraction, or --dry-run for a no-spend preview.');
                process.exit(0);
            }
            // Wire callLLM (pattern from meeting.ts:838)
            if (services.ai.isConfigured() && process.env.ARETE_NO_LLM !== '1') {
                callLLM = async (prompt) => {
                    const r = await services.ai.call('extraction', prompt);
                    return r.text;
                };
            }
        }
        // Pre-refresh snapshot (F1 rollback artifact) — write BEFORE any
        // refresh path that could mutate person files.
        if (opts.snapshotPath && !opts.dryRun) {
            await writePreRefreshSnapshot(paths, opts.snapshotPath, opts.person);
        }
        const result = await services.entity.refreshPersonMemory(paths, {
            personSlug: opts.person,
            minMentions,
            ifStaleDays,
            dryRun: opts.dryRun,
            commitments: services.commitments,
            ...(typeof sinceDays === 'number' ? { sinceDays } : {}),
            ...(callLLM ? { callLLM } : {}),
        });
        // Auto-refresh qmd index after writes (skip if nothing updated or dry-run)
        let qmdResult;
        if (result.updated > 0 && !opts.skipQmd && !opts.dryRun) {
            const config = await loadConfig(services.storage, root);
            qmdResult = await refreshQmdIndex(root, config.qmd_collection);
        }
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                dryRun: Boolean(opts.dryRun),
                ...result,
                qmd: qmdResult ?? { indexed: false, skipped: true },
            }, null, 2));
            return;
        }
        if (opts.dryRun) {
            info(`[dry-run] Would update ${result.updated} people.`);
        }
        else {
            info(`Refreshed person memory highlights for ${result.updated} person file(s).`);
        }
        listItem('People scanned', String(result.scannedPeople));
        listItem('Meetings scanned', String(result.scannedMeetings));
        listItem('Skipped (fresh)', String(result.skippedFresh));
        listItem('Stances extracted', String(result.stancesExtracted));
        listItem('Action items extracted', String(result.actionItemsExtracted));
        listItem('Items aged out', String(result.itemsAgedOut));
        displayQmdResult(qmdResult);
        console.log('');
    });
}
function parseCategory(cat) {
    if (!cat)
        return undefined;
    const c = cat.toLowerCase();
    if (PEOPLE_CATEGORIES.includes(c))
        return c;
    return undefined;
}
/**
 * Phase 9 AC8a — F1 rollback artifact.
 *
 * Walks people/{internal,users,customers}/*.md and snapshots every
 * <!-- AUTO_PERSON_MEMORY:START --> ... :END --> block to JSON.
 * Restoration is via dev/work/plans/.../restore-memory-blocks.sh.
 */
async function writePreRefreshSnapshot(paths, snapshotPath, personSlugFilter) {
    const START = '<!-- AUTO_PERSON_MEMORY:START -->';
    const END = '<!-- AUTO_PERSON_MEMORY:END -->';
    const blocks = [];
    for (const cat of PEOPLE_CATEGORIES) {
        const catDir = join(paths.people, cat);
        if (!existsSync(catDir))
            continue;
        let files;
        try {
            files = readdirSync(catDir).filter((f) => f.endsWith('.md') && f !== 'index.md');
        }
        catch {
            continue;
        }
        for (const f of files) {
            const slug = f.replace(/\.md$/, '');
            if (personSlugFilter && slug !== personSlugFilter)
                continue;
            const filePath = join(catDir, f);
            try {
                const content = readFileSync(filePath, 'utf8');
                const start = content.indexOf(START);
                const end = content.indexOf(END);
                const block = start >= 0 && end > start ? content.slice(start, end + END.length) : null;
                blocks.push({
                    path: filePath,
                    relativePath: filePath.startsWith(paths.root + '/')
                        ? filePath.slice(paths.root.length + 1)
                        : filePath,
                    block,
                });
            }
            catch {
                // skip
            }
        }
    }
    const target = snapshotPath.startsWith('/') ? snapshotPath : join(paths.root, snapshotPath);
    const dir = target.substring(0, target.lastIndexOf('/'));
    if (dir)
        await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(target, JSON.stringify({ snapshotAt: new Date().toISOString(), blocks }, null, 2), 'utf8');
    info(`Wrote pre-refresh snapshot: ${target} (${blocks.length} person files)`);
}
/** Prompt for y/N interactive confirmation. Returns false in non-TTY. */
async function confirmInteractive(prompt) {
    if (!process.stdin.isTTY)
        return false;
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(`${prompt} [y/N] `, (answer) => {
            rl.close();
            resolve(/^y(es)?$/i.test(answer.trim()));
        });
    });
}
//# sourceMappingURL=people.js.map