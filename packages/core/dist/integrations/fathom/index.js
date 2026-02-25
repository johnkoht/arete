/**
 * Fathom integration — pull recordings into workspace.
 */
import { join } from 'path';
import { FathomClient, loadFathomApiKey } from './client.js';
import { meetingFromListItem } from './save.js';
import { saveMeetingFile, meetingFilename, } from '../meetings.js';
const DEFAULT_TEMPLATE = `# {title}
**Date**: {date}
**Duration**: {duration}
**Source**: {integration}

## Summary
{summary}

## Key Points
{key_points}

## Action Items
{action_items}

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
export async function pullFathom(storage, workspaceRoot, paths, days) {
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
    for (const m of meetings) {
        try {
            const meeting = meetingFromListItem(m);
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