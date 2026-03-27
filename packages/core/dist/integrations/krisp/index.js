/**
 * Krisp integration — pull recordings into workspace.
 */
import { join } from 'path';
import { KrispMcpClient } from './client.js';
import { loadKrispCredentials } from './config.js';
import { meetingFromKrisp } from './save.js';
import { saveMeetingFile, meetingFilename, findMatchingAgendaPath } from '../meetings.js';
const DEFAULT_TEMPLATE = `# {title}

**Date**: {date}
**Duration**: {duration}
**Source**: Krisp

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
    // Add 1 day to `before` so meetings with UTC dates on the current day aren't
    // excluded (e.g. 9pm CST = next day UTC).
    end.setDate(end.getDate() + 1);
    const start = new Date();
    start.setDate(start.getDate() - days);
    return {
        after: start.toISOString().slice(0, 10),
        before: end.toISOString().slice(0, 10),
    };
}
export async function pullKrisp(storage, workspaceRoot, paths, days) {
    const creds = await loadKrispCredentials(storage, workspaceRoot);
    if (!creds) {
        return {
            success: false,
            saved: 0,
            errors: ['Krisp credentials not found — run: arete integration configure krisp'],
        };
    }
    const outputDir = join(paths.resources, 'meetings');
    const { after, before } = dateRange(days);
    const client = new KrispMcpClient(storage, workspaceRoot);
    const meetings = await client.listMeetings({ after, before });
    let saved = 0;
    const errors = [];
    // Batch-fetch full documents (transcript + notes) for all meetings
    const docMap = new Map();
    const idsToFetch = meetings
        .filter(m => m.meeting_id)
        .map(m => m.meeting_id);
    if (idsToFetch.length > 0) {
        try {
            const docs = await client.getMultipleDocuments(idsToFetch);
            for (const doc of docs) {
                if (doc.document)
                    docMap.set(doc.id, doc.document);
            }
        }
        catch {
            // Document fetch failed — proceed with search_meetings data only
        }
    }
    for (const m of meetings) {
        try {
            const transcriptText = docMap.get(m.meeting_id) ?? '';
            const meeting = meetingFromKrisp(m, transcriptText);
            // Link agenda if available (use high-confidence matches only)
            const agenda = await findMatchingAgendaPath(storage, workspaceRoot, meeting.date, meeting.title);
            if (agenda) {
                meeting.agenda = agenda;
            }
            const fullPath = await saveMeetingFile(storage, meeting, outputDir, DEFAULT_TEMPLATE, { integration: 'Krisp', force: false });
            if (fullPath)
                saved += 1;
        }
        catch (e) {
            errors.push(e.message);
        }
    }
    return { success: errors.length === 0, saved, errors };
}
export { meetingFilename, loadKrispCredentials, KrispMcpClient };
//# sourceMappingURL=index.js.map