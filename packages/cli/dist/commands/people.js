/**
 * People commands — list, show, index
 */
import { createServices, loadConfig, refreshQmdIndex, PEOPLE_CATEGORIES, } from '@arete/core';
import { join } from 'node:path';
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
            memoryHighlights = extractAutoPersonMemorySection(personContent);
        }
        if (opts.json) {
            console.log(JSON.stringify({ success: true, person, memoryHighlights }, null, 2));
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
        listItem('File', formatPath(`people/${person.category}/${person.slug}.md`));
        console.log('');
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
        .description('Refresh auto-generated person memory highlights from meetings')
        .option('--person <slug>', 'Refresh only one person by slug')
        .option('--min-mentions <n>', 'Minimum repeated mentions to include (default: 2)')
        .option('--if-stale-days <n>', 'Only refresh when Last refreshed is older than N days')
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
        const minMentionsParsed = opts.minMentions ? parseInt(opts.minMentions, 10) : undefined;
        const minMentions = typeof minMentionsParsed === 'number' && !isNaN(minMentionsParsed)
            ? minMentionsParsed
            : undefined;
        const ifStaleDaysParsed = opts.ifStaleDays ? parseInt(opts.ifStaleDays, 10) : undefined;
        const ifStaleDays = typeof ifStaleDaysParsed === 'number' && !isNaN(ifStaleDaysParsed)
            ? ifStaleDaysParsed
            : undefined;
        const result = await services.entity.refreshPersonMemory(paths, {
            personSlug: opts.person,
            minMentions,
            ifStaleDays,
        });
        // Auto-refresh qmd index after writes (skip if nothing updated)
        let qmdResult;
        if (result.updated > 0 && !opts.skipQmd) {
            const config = await loadConfig(services.storage, root);
            qmdResult = await refreshQmdIndex(root, config.qmd_collection);
        }
        if (opts.json) {
            console.log(JSON.stringify({
                success: true,
                ...result,
                qmd: qmdResult ?? { indexed: false, skipped: true },
            }, null, 2));
            return;
        }
        info(`Refreshed person memory highlights for ${result.updated} person file(s).`);
        listItem('People scanned', String(result.scannedPeople));
        listItem('Meetings scanned', String(result.scannedMeetings));
        listItem('Skipped (fresh)', String(result.skippedFresh));
        displayQmdResult(qmdResult);
        console.log('');
    });
}
function extractAutoPersonMemorySection(content) {
    if (!content)
        return null;
    const startMarker = '<!-- AUTO_PERSON_MEMORY:START -->';
    const endMarker = '<!-- AUTO_PERSON_MEMORY:END -->';
    const start = content.indexOf(startMarker);
    const end = content.indexOf(endMarker);
    if (start < 0 || end <= start)
        return null;
    const sectionStart = start + startMarker.length;
    const section = content.slice(sectionStart, end).trim();
    return section.length > 0 ? section : null;
}
function parseCategory(cat) {
    if (!cat)
        return undefined;
    const c = cat.toLowerCase();
    if (PEOPLE_CATEGORIES.includes(c))
        return c;
    return undefined;
}
//# sourceMappingURL=people.js.map