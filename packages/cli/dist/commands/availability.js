/**
 * arete availability — find mutual availability with colleagues
 */
import { createServices, loadConfig, getCalendarProvider, findAvailableSlots, } from '@arete/core';
import { header, listItem, error, info, formatSlotTime } from '../formatters.js';
const DEFAULT_DURATION = 30;
const DEFAULT_DAYS = 7;
const DEFAULT_LIMIT = 5;
const defaultDeps = {
    createServicesFn: createServices,
    loadConfigFn: loadConfig,
    getCalendarProviderFn: getCalendarProvider,
};
export async function findAvailability(opts, deps = defaultDeps) {
    const services = await deps.createServicesFn(process.cwd());
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
    // Step 1: Resolve person → email
    let email = opts.with;
    let personName = opts.with;
    let personSlug;
    let personCategory;
    if (!opts.with.includes('@')) {
        // It's a name, resolve to person
        const resolved = await services.entity.resolve(opts.with, 'person', paths);
        if (!resolved) {
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'Person not found',
                    message: `Could not find '${opts.with}' in people/. Try: arete people list`,
                }));
            }
            else {
                error(`Could not find '${opts.with}' in people/. Try: arete people list`);
            }
            process.exit(1);
        }
        personName = resolved.name;
        personSlug = resolved.slug;
        personCategory = resolved.metadata?.category;
        const resolvedEmail = resolved.metadata?.email;
        if (!resolvedEmail) {
            const filePath = personCategory
                ? `people/${personCategory}/${personSlug}.md`
                : `people/internal/${personSlug}.md`;
            if (opts.json) {
                console.log(JSON.stringify({
                    success: false,
                    error: 'No email on file',
                    message: `${personName} found but no email on file — add email to ${filePath}`,
                }));
            }
            else {
                error(`${personName} found but no email on file — add email to ${filePath}`);
            }
            process.exit(1);
        }
        email = resolvedEmail;
    }
    // Step 2: Get calendar provider
    const config = await deps.loadConfigFn(services.storage, root);
    const provider = await deps.getCalendarProviderFn(config, services.storage, root);
    if (!provider) {
        if (opts.json) {
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
    // Step 3: Check provider has getFreeBusy
    if (!provider.getFreeBusy) {
        if (opts.json) {
            console.log(JSON.stringify({
                success: false,
                error: 'Provider does not support FreeBusy',
                message: 'Availability requires Google Calendar. Run: arete integration configure google-calendar',
            }));
        }
        else {
            error('Availability requires Google Calendar. Run: arete integration configure google-calendar');
        }
        process.exit(1);
    }
    // Step 4: Call FreeBusy
    const now = new Date();
    const endDate = new Date(now.getTime() + opts.days * 24 * 60 * 60 * 1000);
    let result;
    try {
        result = await provider.getFreeBusy([email], now, endDate);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (opts.json) {
            console.log(JSON.stringify({
                success: false,
                error: 'FreeBusy API error',
                message,
            }));
        }
        else {
            error(`Calendar API error: ${message}`);
        }
        process.exit(1);
    }
    // Step 5: Check calendar access
    const targetCalendar = result.calendars[email];
    if (!targetCalendar?.accessible) {
        const errorReason = targetCalendar?.error || 'unknown';
        if (opts.json) {
            console.log(JSON.stringify({
                success: false,
                error: 'No calendar access',
                message: `I couldn't see ${personName}'s availability — they may need to share their calendar with you`,
                reason: errorReason,
            }));
        }
        else {
            error(`I couldn't see ${personName}'s availability — they may need to share their calendar with you`);
        }
        process.exit(1);
    }
    // Step 6: Run algorithm
    const slots = findAvailableSlots(result.userBusy, targetCalendar.busy, {
        duration: opts.duration,
        days: opts.days,
        excludeWeekends: true,
    });
    // Step 7: Display results (limit to --limit)
    const displaySlots = slots.slice(0, opts.limit);
    if (opts.json) {
        console.log(JSON.stringify({
            success: true,
            person: {
                name: personName,
                email,
                slug: personSlug,
            },
            duration: opts.duration,
            days: opts.days,
            slotsFound: slots.length,
            slotsDisplayed: displaySlots.length,
            slots: displaySlots.map((slot) => ({
                start: slot.start.toISOString(),
                end: slot.end.toISOString(),
                duration: slot.duration,
                display: formatSlotTime(slot.start),
            })),
        }, null, 2));
        return;
    }
    header(`Availability with ${personName}`);
    listItem('Email', email);
    listItem('Duration', `${opts.duration} minutes`);
    listItem('Search window', `${opts.days} days`);
    console.log('');
    if (displaySlots.length === 0) {
        info(`No available slots found in the next ${opts.days} days.`);
        console.log('');
        return;
    }
    console.log(`  Found ${slots.length} slot${slots.length === 1 ? '' : 's'} (showing ${displaySlots.length}):\n`);
    for (const slot of displaySlots) {
        const startStr = formatSlotTime(slot.start);
        console.log(`  • ${startStr} (${slot.duration} min)`);
    }
    console.log('');
}
export function registerAvailabilityCommands(program) {
    const availabilityCmd = program
        .command('availability')
        .description('Find mutual availability with colleagues');
    availabilityCmd
        .command('find')
        .description('Find available time slots with a person')
        .requiredOption('--with <person-or-email>', 'Person name or email to find availability with')
        .option('--duration <minutes>', 'Meeting duration in minutes', String(DEFAULT_DURATION))
        .option('--days <n>', 'Number of days to search', String(DEFAULT_DAYS))
        .option('--limit <n>', 'Maximum slots to show', String(DEFAULT_LIMIT))
        .option('--json', 'Output as JSON')
        .action(async (opts) => {
        const duration = parseInt(opts.duration ?? String(DEFAULT_DURATION), 10);
        const days = parseInt(opts.days ?? String(DEFAULT_DAYS), 10);
        const limit = parseInt(opts.limit ?? String(DEFAULT_LIMIT), 10);
        await findAvailability({
            with: opts.with,
            duration,
            days,
            limit,
            json: opts.json ?? false,
        });
    });
}
//# sourceMappingURL=availability.js.map