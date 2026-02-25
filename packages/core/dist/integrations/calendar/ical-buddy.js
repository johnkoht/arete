/**
 * IcalBuddy calendar provider — macOS Calendar via icalBuddy CLI.
 * Integrations may use fs/child_process (infrastructure).
 */
import { execFile, spawnSync } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
function parseAttendee(attendeeStr) {
    const trimmed = attendeeStr.trim();
    const match = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
    if (match) {
        return { name: match[1].trim(), email: match[2].trim() };
    }
    if (trimmed.includes('@')) {
        return { name: trimmed, email: trimmed };
    }
    return { name: trimmed };
}
function parseEventBlock(block, defaultCalendar = 'Unknown') {
    const lines = block.split('\n').filter((l) => l.trim());
    if (lines.length === 0)
        return null;
    const titleLine = lines[0].replace(/^•\s*/, '').trim();
    if (!titleLine)
        return null;
    let location;
    let attendees = [];
    let notes;
    let dateTimeLine;
    let calendar = defaultCalendar;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('location:')) {
            location = line.substring('location:'.length).trim();
        }
        else if (line.startsWith('attendees:')) {
            const attendeeStr = line.substring('attendees:'.length).trim();
            attendees = attendeeStr.split(',').map(parseAttendee);
        }
        else if (line.startsWith('notes:')) {
            notes = line.substring('notes:'.length).trim();
        }
        else if (line.startsWith('calendar:')) {
            calendar = line.substring('calendar:'.length).trim();
        }
        else if (line.match(/\d{4}-\d{2}-\d{2}/)) {
            dateTimeLine = line;
        }
    }
    if (!dateTimeLine)
        return null;
    const isAllDay = dateTimeLine.includes('all-day') || dateTimeLine.includes('00:00 - 00:00');
    let startTime;
    let endTime;
    if (isAllDay) {
        const dateMatch = dateTimeLine.match(/(\d{4}-\d{2}-\d{2})/);
        if (!dateMatch)
            return null;
        startTime = new Date(dateMatch[1] + 'T00:00:00.000Z');
        endTime = new Date(dateMatch[1] + 'T23:59:59.000Z');
    }
    else {
        const timeMatch = dateTimeLine.match(/(\d{4}-\d{2}-\d{2})\s+at\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
        if (!timeMatch)
            return null;
        const [, date, startStr, endStr] = timeMatch;
        startTime = new Date(`${date}T${startStr}:00.000Z`);
        endTime = new Date(`${date}T${endStr}:00.000Z`);
    }
    return {
        title: titleLine,
        startTime,
        endTime,
        calendar,
        location,
        attendees,
        notes,
        isAllDay,
    };
}
function parseIcalBuddyOutput(stdout, defaultCalendar = 'Unknown') {
    if (!stdout.trim())
        return [];
    const blocks = stdout.split(/\n\s*\n/).filter((b) => b.trim());
    const events = [];
    for (const block of blocks) {
        const event = parseEventBlock(block, defaultCalendar);
        if (event)
            events.push(event);
    }
    return events;
}
export function getIcalBuddyProvider() {
    return {
        name: 'ical-buddy',
        async isAvailable() {
            try {
                const { spawnSync } = await import('child_process');
                const r = spawnSync('which', ['icalBuddy'], { encoding: 'utf8' });
                return r.status === 0 && (r.stdout?.trim()?.length ?? 0) > 0;
            }
            catch {
                return false;
            }
        },
        async getTodayEvents(options) {
            const args = [
                '-b', '',
                '-nc',
                '-nrd',
                '-ea',
                '-df', '%Y-%m-%d',
                '-tf', '%H:%M',
                'eventsToday',
            ];
            if (options?.calendars?.length) {
                args.push('-ic', options.calendars.join(','));
            }
            const { stdout } = await execFileAsync('icalBuddy', args, {
                timeout: 10000,
                maxBuffer: 10 * 1024 * 1024,
            });
            return parseIcalBuddyOutput(stdout ?? '', options?.calendars?.[0]);
        },
        async getUpcomingEvents(days, options) {
            const today = new Date();
            const endDate = new Date(today);
            endDate.setDate(endDate.getDate() + days);
            const formatDate = (d) => d.toISOString().split('T')[0];
            const args = [
                '-b', '',
                '-nc',
                '-nrd',
                '-ea',
                '-df', '%Y-%m-%d',
                '-tf', '%H:%M',
                'eventsFrom:today',
                `to:${formatDate(endDate)}`,
            ];
            if (options?.calendars?.length) {
                args.push('-ic', options.calendars.join(','));
            }
            const { stdout } = await execFileAsync('icalBuddy', args, {
                timeout: 10000,
                maxBuffer: 10 * 1024 * 1024,
            });
            return parseIcalBuddyOutput(stdout ?? '', options?.calendars?.[0]);
        },
    };
}
/**
 * Parse `icalBuddy calendars` output into calendar names.
 * Calendar names are lines starting with `• ` (U+2022 bullet + space).
 * Metadata lines (type, UID, etc.) are indented and do not start with `• `.
 */
export function parseIcalBuddyCalendars(stdout) {
    if (!stdout.trim())
        return [];
    return stdout
        .split('\n')
        .filter((line) => line.startsWith('\u2022 '))
        .map((line) => line.slice(2).trim());
}
/**
 * List available macOS calendars via `icalBuddy calendars`.
 * Returns `{ available: false, calendars: [] }` when icalBuddy is not found
 * or the command fails for any reason (no throw).
 */
export async function listIcalBuddyCalendars(deps) {
    const whichFn = deps?.which ??
        ((cmd) => spawnSync('which', [cmd], { encoding: 'utf8' }));
    const execFn = deps?.exec ??
        ((cmd, args) => execFileAsync(cmd, args, { timeout: 10000 }));
    try {
        const whichResult = whichFn('icalBuddy');
        if (whichResult.status !== 0) {
            return { available: false, calendars: [] };
        }
        const { stdout } = await execFn('icalBuddy', ['calendars']);
        const calendars = parseIcalBuddyCalendars(stdout ?? '');
        return { available: true, calendars };
    }
    catch {
        return { available: false, calendars: [] };
    }
}
//# sourceMappingURL=ical-buddy.js.map