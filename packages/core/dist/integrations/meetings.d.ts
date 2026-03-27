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
    /** Lifecycle status written to frontmatter at save time. Default: 'synced'. */
    status?: 'synced' | 'processed' | 'approved';
}
/**
 * Result of agenda matching with metadata for user prompting.
 */
export interface AgendaMatchResult {
    /** Matched agenda path (relative), or null if no match */
    match: string | null;
    /** How the match was determined */
    matchType: 'exact' | 'fuzzy' | 'none';
    /** Confidence score (1.0 for exact, 0-1 for fuzzy) */
    confidence: number;
    /** All candidate agendas for the same date (for user selection if no match) */
    candidates: Array<{
        path: string;
        meetingTitle?: string;
        score: number;
    }>;
}
/**
 * Find a matching agenda file for a meeting by date and title.
 *
 * Matching priority:
 * 1. Exact match on frontmatter `meeting_title` field (from calendar event)
 * 2. Fuzzy match on filename with relaxed threshold
 *
 * @param storage - Storage adapter
 * @param workspaceRoot - Workspace root path
 * @param date - Meeting date (YYYY-MM-DD or ISO string)
 * @param title - Meeting title (from calendar/Fathom/Krisp)
 * @returns Match result with metadata for user prompting
 */
export declare function findMatchingAgenda(storage: StorageAdapter, workspaceRoot: string, date: string, title: string): Promise<AgendaMatchResult>;
/**
 * Simple wrapper that returns just the path (for backward compatibility).
 * Only returns high-confidence matches (exact or fuzzy >= 0.7).
 */
export declare function findMatchingAgendaPath(storage: StorageAdapter, workspaceRoot: string, date: string, title: string): Promise<string | null>;
export declare function meetingFilename(meeting: MeetingForSave): string;
export declare function saveMeetingFile(storage: StorageAdapter, meeting: MeetingForSave, outputDir: string, templateContent: string, options?: {
    integration?: string;
    force?: boolean;
}): Promise<string | null>;
//# sourceMappingURL=meetings.d.ts.map