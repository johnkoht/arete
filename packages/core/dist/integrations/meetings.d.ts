/**
 * Meeting save logic — uses StorageAdapter, no direct fs.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { CalendarEvent } from './calendar/types.js';
/**
 * Meeting importance levels for triage workflow.
 * - skip: User-assigned only — auto-skip processing entirely
 * - light: Large audience meetings — minimal extraction
 * - normal: Standard meetings — full extraction
 * - important: 1:1s and self-organized — priority processing
 */
export type Importance = 'skip' | 'light' | 'normal' | 'important';
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
    /** Meeting importance for triage workflow. 'skip' is user-assigned only. */
    importance?: Importance;
    /** ID of the recurring event series (for recurring meeting detection). */
    recurring_series_id?: string;
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
 * Infer meeting importance from calendar event metadata.
 *
 * Priority rules (first match wins):
 * 1. Organizer is self → 'important'
 * 2. 1:1 meeting (2 attendees) → 'important'
 * 3. Small group (≤3 attendees) → 'normal'
 * 4. Large audience (≥5 attendees, not organizer) → 'light'
 * 5. Default → 'normal'
 *
 * Modifier: If hasAgenda is true and result would be 'light', upgrade to 'normal'.
 *
 * Note: Never returns 'skip' — that's user-assigned only.
 */
export declare function inferMeetingImportance(event: CalendarEvent, options?: {
    hasAgenda?: boolean;
}): 'light' | 'normal' | 'important';
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
 * Find a matching calendar event for a meeting by date and time.
 *
 * Matching priority:
 * 1. Same day + time overlap (meeting falls within calendar event window)
 * 2. Same day + fuzzy title match (when times don't match exactly)
 *
 * @param events - Array of calendar events to search
 * @param meetingDate - Meeting date (YYYY-MM-DD or ISO string)
 * @param meetingTitle - Meeting title for fuzzy matching
 * @returns Matched calendar event or null
 */
export declare function findMatchingCalendarEvent(events: CalendarEvent[], meetingDate: string, meetingTitle: string): CalendarEvent | null;
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