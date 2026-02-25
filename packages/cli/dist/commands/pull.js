/**
 * arete pull [integration] — fetch data from integrations
 */
import { createServices, loadConfig, getCalendarProvider, refreshQmdIndex } from '@arete/core';
import { isAbsolute, join } from 'path';
import { tmpdir } from 'os';
import { header, listItem, success, error, info } from '../formatters.js';
import { resolveEntities } from '@arete/core';
import { displayQmdResult } from '../lib/qmd-output.js';
const DEFAULT_DAYS = 7;
const DEFAULT_NOTION_DESTINATION = 'resources/notes';
export function registerPullCommand(program) {
    program
        .command('pull [integration]')
        .description('Fetch latest data from integrations or calendar')
        .option('--days <n>', 'Number of days to fetch', String(DEFAULT_DAYS))
        .option('--today', 'Fetch only today\'s events (calendar only)')
        .option('--page <url-or-id>', 'Notion page URL/ID (repeatable)', collectOptionValues, [])
        .option('--destination <path>', 'Destination path for Notion pulls', DEFAULT_NOTION_DESTINATION)
        .option('--dry-run', 'Fetch + convert and print markdown without saving (notion only)')
        .option('--skip-qmd', 'Skip automatic qmd index update')
        .option('--json', 'Output as JSON')
        .action(async (integration, opts) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
            if (opts.json) {
                console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
            }
            else {
                error('Not in an Areté workspace');
                info('Run "arete install" to create a workspace first');
            }
            process.exit(1);
        }
        const days = parseInt(opts.days ?? String(DEFAULT_DAYS), 10);
        if (integration === 'calendar') {
            return pullCalendar(services, root, opts.today ?? false, opts.json ?? false);
        }
        if (integration === 'notion') {
            return pullNotion(services, root, {
                pages: opts.page ?? [],
                destination: opts.destination ?? DEFAULT_NOTION_DESTINATION,
                dryRun: Boolean(opts.dryRun),
                skipQmd: Boolean(opts.skipQmd),
                json: Boolean(opts.json),
            });
        }
        if (integration === 'fathom' || !integration) {
            const config = await loadConfig(services.storage, root);
            const result = await services.integrations.pull(root, 'fathom', { integration: 'fathom', days });
            // Auto-refresh qmd index after write (skip if nothing new or --skip-qmd)
            let qmdResult;
            if (result.itemsCreated > 0 && !opts.skipQmd) {
                qmdResult = await refreshQmdIndex(root, config.qmd_collection);
            }
            if (opts.json) {
                console.log(JSON.stringify({
                    success: result.errors.length === 0,
                    integration: 'fathom',
                    itemsProcessed: result.itemsProcessed,
                    itemsCreated: result.itemsCreated,
                    errors: result.errors,
                    qmd: qmdResult ?? { indexed: false, skipped: true },
                }, null, 2));
                return;
            }
            if (!opts.json) {
                header('Pull Latest Data');
                listItem('Integration', 'Fathom');
                listItem('Time range', `Last ${days} days`);
                console.log('');
            }
            if (result.errors.length === 0) {
                success(`Fathom pull complete! ${result.itemsCreated} item(s) saved.`);
            }
            else {
                error(`Fathom pull failed: ${result.errors.join(', ')}`);
            }
            displayQmdResult(qmdResult);
            return;
        }
        if (integration === 'krisp') {
            const config = await loadConfig(services.storage, root);
            const result = await services.integrations.pull(root, 'krisp', { integration: 'krisp', days });
            // Auto-refresh qmd index after write (skip if nothing new or --skip-qmd)
            let qmdResult;
            if (result.itemsCreated > 0 && !opts.skipQmd) {
                qmdResult = await refreshQmdIndex(root, config.qmd_collection);
            }
            if (opts.json) {
                console.log(JSON.stringify({
                    success: result.errors.length === 0,
                    integration: 'krisp',
                    itemsProcessed: result.itemsProcessed,
                    itemsCreated: result.itemsCreated,
                    errors: result.errors,
                    qmd: qmdResult ?? { indexed: false, skipped: true },
                }, null, 2));
                return;
            }
            header('Pull Latest Data');
            listItem('Integration', 'Krisp');
            listItem('Time range', `Last ${days} days`);
            console.log('');
            if (result.errors.length === 0) {
                success(`Krisp pull complete! ${result.itemsCreated} item(s) saved.`);
            }
            else {
                error(`Krisp pull failed: ${result.errors.join(', ')}`);
            }
            displayQmdResult(qmdResult);
            return;
        }
        if (opts.json) {
            console.log(JSON.stringify({
                success: false,
                error: `Unknown integration: ${integration}`,
                available: ['calendar', 'fathom', 'krisp', 'notion'],
            }));
        }
        else {
            error(`Unknown integration: ${integration}`);
            info('Available: calendar, fathom, krisp, notion');
        }
        process.exit(1);
    });
}
function collectOptionValues(value, previous) {
    return [...previous, value];
}
export async function pullNotion(services, workspaceRoot, opts, deps = {
    loadConfigFn: loadConfig,
    refreshQmdIndexFn: refreshQmdIndex,
}) {
    if (opts.pages.length === 0) {
        if (opts.json) {
            console.log(JSON.stringify({ success: false, error: 'Provide at least one --page <url-or-id>' }));
        }
        else {
            error('Provide at least one --page <url-or-id>');
        }
        process.exit(1);
    }
    if (opts.dryRun) {
        const dryRunDestination = join(tmpdir(), `arete-notion-dry-run-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        try {
            const result = await services.integrations.pull(workspaceRoot, 'notion', {
                integration: 'notion',
                pages: opts.pages,
                destination: dryRunDestination,
            });
            const markdownFiles = (await services.storage.list(dryRunDestination, { extensions: ['.md'] }))
                .sort((a, b) => a.localeCompare(b));
            const previews = [];
            for (const filePath of markdownFiles) {
                const content = await services.storage.read(filePath);
                if (content) {
                    previews.push({
                        path: filePath,
                        markdown: stripFrontmatter(content),
                    });
                }
            }
            if (opts.json) {
                console.log(JSON.stringify({
                    success: result.errors.length === 0,
                    integration: 'notion',
                    dryRun: true,
                    itemsProcessed: result.itemsProcessed,
                    itemsCreated: result.itemsCreated,
                    errors: result.errors,
                    previews,
                }, null, 2));
                return;
            }
            header('Notion Pull (dry-run)');
            listItem('Pages requested', String(opts.pages.length));
            listItem('Pages converted', String(previews.length));
            console.log('');
            if (previews.length === 0) {
                info('No markdown generated.');
            }
            for (const preview of previews) {
                console.log(`--- ${preview.path} ---`);
                console.log(preview.markdown);
                if (!preview.markdown.endsWith('\n')) {
                    console.log('');
                }
            }
            if (result.errors.length > 0) {
                error(`Notion dry-run completed with errors: ${result.errors.join(', ')}`);
            }
            return;
        }
        finally {
            await services.storage.delete(dryRunDestination);
        }
    }
    const destination = resolveDestinationPath(workspaceRoot, opts.destination);
    const result = await services.integrations.pull(workspaceRoot, 'notion', {
        integration: 'notion',
        pages: opts.pages,
        destination,
    });
    let qmdResult;
    if (result.itemsCreated > 0 && !opts.skipQmd) {
        const config = await deps.loadConfigFn(services.storage, workspaceRoot);
        qmdResult = await deps.refreshQmdIndexFn(workspaceRoot, config.qmd_collection);
    }
    if (opts.json) {
        console.log(JSON.stringify({
            success: result.errors.length === 0,
            integration: 'notion',
            destination,
            pages: opts.pages,
            itemsProcessed: result.itemsProcessed,
            itemsCreated: result.itemsCreated,
            errors: result.errors,
            qmd: qmdResult ?? { indexed: false, skipped: true },
        }, null, 2));
        return;
    }
    header('Pull Latest Data');
    listItem('Integration', 'Notion');
    listItem('Pages', String(opts.pages.length));
    listItem('Destination', destination);
    console.log('');
    if (result.errors.length === 0) {
        success(`Notion pull complete! ${result.itemsCreated} page(s) saved.`);
    }
    else {
        error(`Notion pull completed with errors: ${result.errors.join(', ')}`);
    }
    displayQmdResult(qmdResult);
}
function resolveDestinationPath(workspaceRoot, destination) {
    if (isAbsolute(destination)) {
        return destination;
    }
    return join(workspaceRoot, destination);
}
function stripFrontmatter(content) {
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
    return match ? match[1] : content;
}
async function pullCalendar(services, workspaceRoot, today, json) {
    const config = await loadConfig(services.storage, workspaceRoot);
    const provider = await getCalendarProvider(config, services.storage, workspaceRoot);
    if (!provider) {
        if (json) {
            console.log(JSON.stringify({
                success: false,
                error: 'Calendar not configured',
                message: 'Run: arete integration configure calendar',
            }));
        }
        else {
            error('Calendar not configured');
            info('Run: arete integration configure calendar');
        }
        process.exit(1);
    }
    const available = await provider.isAvailable();
    if (!available) {
        let errorMsg;
        let helpMsg;
        if (provider.name === 'ical-buddy') {
            errorMsg = 'icalBuddy not installed';
            helpMsg = 'Run: brew install ical-buddy';
        }
        else if (provider.name === 'google-calendar') {
            errorMsg = 'Google Calendar not available';
            helpMsg = 'Run: arete integration configure google-calendar';
        }
        else {
            errorMsg = `Calendar provider "${provider.name}" not available`;
            helpMsg = 'Check your integration configuration';
        }
        if (json) {
            console.log(JSON.stringify({
                success: false,
                error: errorMsg,
                message: helpMsg,
            }));
        }
        else {
            error(errorMsg);
            info(helpMsg);
        }
        process.exit(1);
    }
    const events = today
        ? await provider.getTodayEvents()
        : await provider.getUpcomingEvents(7);
    const paths = services.workspace.getPaths(workspaceRoot);
    const enrichedEvents = [];
    for (const event of events) {
        const enrichedAttendees = [];
        for (const attendee of event.attendees) {
            const e = { ...attendee };
            if (attendee.email) {
                const matches = await resolveEntities(attendee.email, 'person', paths, 1);
                if (matches.length > 0) {
                    e.personSlug = matches[0].slug;
                }
            }
            enrichedAttendees.push(e);
        }
        enrichedEvents.push({ ...event, attendees: enrichedAttendees });
    }
    if (json) {
        console.log(JSON.stringify({
            success: true,
            events: enrichedEvents.map((e) => ({
                title: e.title,
                startTime: e.startTime.toISOString(),
                endTime: e.endTime.toISOString(),
                calendar: e.calendar,
                location: e.location,
                isAllDay: e.isAllDay,
                attendees: e.attendees.map((a) => ({
                    name: a.name,
                    email: a.email,
                    personSlug: a.personSlug,
                })),
            })),
        }, null, 2));
        return;
    }
    console.log('');
    console.log(`📅 Calendar Events (${today ? 'Today' : 'Next 7 days'})`);
    console.log('');
    for (const event of enrichedEvents) {
        const dateStr = event.startTime.toISOString().split('T')[0];
        const timeStr = event.isAllDay
            ? 'All day'
            : `${event.startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}-${event.endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
        console.log(`📅 ${dateStr} ${timeStr}  ${event.title} (${event.calendar})`);
        if (event.location)
            console.log(`   📍 ${event.location}`);
        if (event.attendees.length > 0) {
            console.log('   👥 Attendees:');
            for (const a of event.attendees) {
                let line = `      ${a.name}`;
                if (a.email)
                    line += ` (${a.email})`;
                console.log(line);
            }
        }
        console.log('');
    }
    console.log(`Total: ${enrichedEvents.length} event(s)`);
    console.log('');
}
//# sourceMappingURL=pull.js.map