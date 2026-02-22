/**
 * Krisp MCP integration types.
 * Verified against tools/list 2026-02-21
 * Source: live Krisp Core account — krisp-tools-schema.json
 */

export type KrispAttendee = {
  name?: string;
  email?: string;
};

export type KrispSpeaker = {
  name?: string;
};

export type KrispTranscriptSegment = {
  speaker?: string;
  text?: string;
  timestamp?: string;
};

export type KrispActionItem = {
  text: string;
  assignee?: string;
  due_date?: string;
  completed?: boolean;
};

/** Response from search_meetings with all content fields requested */
export type KrispMeeting = {
  id: string;
  name?: string;
  date?: string;
  url?: string;
  is_recurring?: boolean;
  attendees?: KrispAttendee[];
  speakers?: KrispSpeaker[];
  transcript?: KrispTranscriptSegment[];
  agenda?: string;
  meeting_notes?: string;
  detailed_summary?: string;
  key_points?: string[];
  action_items?: KrispActionItem[];
};

/** Response from get_document */
export type KrispDocument = {
  id?: string;
  [key: string]: unknown;
};
