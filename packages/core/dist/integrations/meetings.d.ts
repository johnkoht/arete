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
}
export declare function meetingFilename(meeting: MeetingForSave): string;
export declare function saveMeetingFile(storage: StorageAdapter, meeting: MeetingForSave, outputDir: string, templateContent: string, options?: {
    integration?: string;
    force?: boolean;
}): Promise<string | null>;
//# sourceMappingURL=meetings.d.ts.map