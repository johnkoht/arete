/**
 * Krisp MCP integration types.
 *
 * UNVERIFIED — all types and fields are inferred from the Fathom pattern and
 * Krisp documentation. Confirm against `tools/list` output after authenticating
 * with the Krisp MCP server. See Task 1b / builder gate.
 */

// UNVERIFIED — confirm with tools/list
export type KrispMeeting = {
  // UNVERIFIED — confirm with tools/list
  id: string;
  // UNVERIFIED — confirm with tools/list
  title: string;
  // UNVERIFIED — confirm with tools/list
  start_time: string; // ISO 8601
  // UNVERIFIED — confirm with tools/list
  end_time: string; // ISO 8601
  // UNVERIFIED — confirm with tools/list
  duration_seconds: number;
  // UNVERIFIED — confirm with tools/list
  participants: string[];
  // UNVERIFIED — confirm with tools/list
  has_transcript: boolean;
  // UNVERIFIED — confirm with tools/list
  has_summary: boolean;
};

// UNVERIFIED — confirm with tools/list
export type KrispTranscriptSegment = {
  // UNVERIFIED — confirm with tools/list
  speaker: string;
  // UNVERIFIED — confirm with tools/list
  text: string;
  // UNVERIFIED — confirm with tools/list
  start_time: number; // seconds from meeting start
  // UNVERIFIED — confirm with tools/list
  end_time: number; // seconds from meeting start
};

// UNVERIFIED — confirm with tools/list
export type KrispActionItem = {
  // UNVERIFIED — confirm with tools/list
  text: string;
  // UNVERIFIED — confirm with tools/list
  assignee?: string;
  // UNVERIFIED — confirm with tools/list
  due_date?: string;
};

// UNVERIFIED — confirm with tools/list
export type KrispSummary = {
  // UNVERIFIED — confirm with tools/list
  overview: string;
  // UNVERIFIED — confirm with tools/list
  key_points: string[];
  // UNVERIFIED — confirm with tools/list
  action_items: KrispActionItem[];
};

// UNVERIFIED — confirm with tools/list
export type KrispDocument = {
  // UNVERIFIED — confirm with tools/list
  id: string;
  // UNVERIFIED — confirm with tools/list
  title: string;
  // UNVERIFIED — confirm with tools/list
  start_time: string; // ISO 8601
  // UNVERIFIED — confirm with tools/list
  end_time: string; // ISO 8601
  // UNVERIFIED — confirm with tools/list
  duration_seconds: number;
  // UNVERIFIED — confirm with tools/list
  participants: string[];
  // UNVERIFIED — confirm with tools/list
  summary: KrispSummary | null;
  // UNVERIFIED — confirm with tools/list
  transcript: KrispTranscriptSegment[] | null;
  // UNVERIFIED — confirm with tools/list
  action_items: KrispActionItem[] | null;
};
