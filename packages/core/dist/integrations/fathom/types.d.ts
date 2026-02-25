/**
 * Fathom API response types.
 */
export interface FathomMeeting {
    title: string;
    recording_id: number;
    url: string;
    share_url: string;
    created_at: string;
    scheduled_start_time: string;
    scheduled_end_time: string;
    recording_start_time: string;
    recording_end_time: string;
    transcript?: TranscriptSegment[] | null;
    default_summary?: {
        markdown_formatted?: string;
    } | null;
    action_items?: Array<{
        description?: string;
    }> | null;
    calendar_invitees: Array<{
        name?: string | null;
        email?: string | null;
    }>;
}
export interface TranscriptSegment {
    speaker: {
        display_name?: string;
    };
    text: string;
    timestamp?: string;
}
export interface RecordingSummaryResponse {
    summary?: {
        markdown_formatted?: string;
    };
    markdown_formatted?: string;
}
export interface RecordingTranscriptResponse {
    transcript?: TranscriptSegment[];
    segments?: TranscriptSegment[];
}
//# sourceMappingURL=types.d.ts.map