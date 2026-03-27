/**
 * Fathom integration — pull recordings into workspace.
 */
import { join } from 'path';
import { FathomClient, loadFathomApiKey } from './client.js';
import { meetingFromListItem } from './save.js';
import { saveMeetingFile, meetingFilename, findMatchingAgendaPath, findMatchingCalendarEvent, inferMeetingImportance, } from '../meetings.js';
const DEFAULT_TEMPLATE = `# {title}

**Date**: {date}
**Duration**: {duration}
**Source**: {integration}

## Summary

{summary}

## Action Items

{action_items}

<details>
<summary>Recorder Notes</summary>

### Original Summary

{summary}

### Key Points

{key_points}

</details>

## Transcript

{transcript}
`;
function dateRange(days) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
    };
}
export async function pullFathom(storage, workspaceRoot, paths, days, options) {
    const apiKey = await loadFathomApiKey(storage, workspaceRoot);
    if (!apiKey) {
        return { success: false, saved: 0, errors: ['Fathom API key not found'] };
    }
    const outputDir = join(paths.resources, 'meetings');
    const { startDate, endDate } = dateRange(days);
    const client = new FathomClient(apiKey);
    const meetings = await client.listMeetings({
        startDate,
        endDate,
        includeSummary: true,
        includeTranscript: true,
        includeActionItems: true,
    });
    let saved = 0;
    const errors = [];
    const calendarEvents = options?.calendarEvents ?? [];
    for (const m of meetings) {
        try {
            const meeting = meetingFromListItem(m);
            // Link agenda if available (use high-confidence matches only)
            const agenda = await findMatchingAgendaPath(storage, workspaceRoot, meeting.date, meeting.title);
            if (agenda) {
                meeting.agenda = agenda;
            }
            // Infer importance from calendar event if available (AC#1, AC#5, AC#6)
            const matchedEvent = findMatchingCalendarEvent(calendarEvents, meeting.date, meeting.title);
            if (matchedEvent) {
                meeting.importance = inferMeetingImportance(matchedEvent, { hasAgenda: !!agenda });
                // Copy recurring series ID if present
                if (matchedEvent.recurringEventId) {
                    meeting.recurring_series_id = matchedEvent.recurringEventId;
                }
            }
            else {
                // Default to 'normal' when no calendar event matched (AC#6)
                meeting.importance = 'normal';
            }
            const fullPath = await saveMeetingFile(storage, meeting, outputDir, DEFAULT_TEMPLATE, { integration: 'Fathom', force: false });
            if (fullPath)
                saved += 1;
        }
        catch (e) {
            errors.push(e.message);
        }
    }
    return {
        success: errors.length === 0,
        saved,
        errors,
    };
}
export { meetingFilename, loadFathomApiKey, FathomClient };
//# sourceMappingURL=index.js.map