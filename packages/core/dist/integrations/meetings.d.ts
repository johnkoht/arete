/**
 * Meeting save logic — uses StorageAdapter, no direct fs.
 */
import type { StorageAdapter } from '../storage/adapter.js';
export interface MeetingForSave {
    title: string;
    date: string;
    created_at?: string;
    recording_id?: number;
    id?: number;
    duration_minutes: number;
    summary: string;
    transcript: string;
    action_items: string[];
    highlights: string[];
    attendees?: Array<{
        name?: string | null;
        email?: string | null;
    } | string>;
    url: string;
    share_url?: string;
    agenda?: string;
}
/**
 * Find a matching agenda file for a meeting by date and title.
 * Requires exact date match and title similarity > 0.7.
 *
 * @param storage - Storage adapter
 * @param workspaceRoot - Workspace root path
 * @param date - Meeting date (YYYY-MM-DD)
 * @param title - Meeting title
 * @returns Relative path to agenda if found, null otherwise
 */
export declare function findMatchingAgenda(storage: StorageAdapter, workspaceRoot: string, date: string, title: string): Promise<string | null>;
export declare function meetingFilename(meeting: MeetingForSave): string;
export declare function saveMeetingFile(storage: StorageAdapter, meeting: MeetingForSave, outputDir: string, templateContent: string, options?: {
    integration?: string;
    force?: boolean;
}): Promise<string | null>;
//# sourceMappingURL=meetings.d.ts.map