/**
 * Fathom API response types (External API v1).
 * @see https://developers.fathom.ai/api-reference/meetings/list-meetings
 */

export interface MeetingListResponse {
  limit: number | null;
  next_cursor: string | null;
  items: FathomMeeting[];
}

export interface FathomMeeting {
  title: string;
  meeting_title?: string | null;
  recording_id: number;
  url: string;
  share_url: string;
  created_at: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  recording_start_time: string;
  recording_end_time: string;
  calendar_invitees_domains_type: string;
  transcript_language: string;
  transcript?: TranscriptSegment[] | null;
  default_summary?: MeetingSummary | null;
  action_items?: ActionItem[] | null;
  calendar_invitees: Invitee[];
  recorded_by: FathomUser;
}

export interface MeetingSummary {
  template_name?: string | null;
  markdown_formatted?: string | null;
}

export interface TranscriptSegment {
  speaker: { display_name: string; matched_calendar_invitee_email?: string | null };
  text: string;
  timestamp: string;
}

export interface ActionItem {
  description: string;
  user_generated: boolean;
  completed: boolean;
  recording_timestamp: string;
  recording_playback_url: string;
  assignee: { name?: string | null; email?: string | null; team?: string | null };
}

export interface Invitee {
  name?: string | null;
  email?: string | null;
  email_domain?: string | null;
  is_external: boolean;
}

export interface FathomUser {
  name: string;
  email: string;
  email_domain: string;
  team?: string | null;
}

/** Recording summary endpoint response */
export interface RecordingSummaryResponse {
  summary?: { template_name?: string; markdown_formatted?: string };
  template_name?: string;
  markdown_formatted?: string;
}

/** Recording transcript endpoint response */
export interface RecordingTranscriptResponse {
  transcript?: TranscriptSegment[];
  segments?: TranscriptSegment[];
}
