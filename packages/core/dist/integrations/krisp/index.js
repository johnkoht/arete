/**
 * Krisp integration — pull recordings into workspace.
 */
import { join } from 'path';
import { KrispMcpClient } from './client.js';
import { loadKrispCredentials } from './config.js';
import { meetingFromKrisp } from './save.js';
import { saveMeetingFile, meetingFilename } from '../meetings.js';
const DEFAULT_TEMPLATE = `# {title}
**Date**: {date}
**Duration**: {duration}
**Source**: Krisp

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
    for (const m of meetings) {
        try {
            // Fetch transcript via getDocument if Krisp returned a reference
            let transcriptText = '';
            if (m.transcript && !Array.isArray(m.transcript) && typeof m.transcript === 'object' && 'status' in m.transcript) {
                // Krisp returns transcript as a reference — fetch via getDocument using meeting_id
                try {
                    const doc = await client.getDocument(m.meeting_id);
                    transcriptText = doc.document ?? '';
                }
                catch {
                    // Transcript fetch failed — proceed without it
                }
            }
            const meeting = meetingFromKrisp(m, transcriptText);
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