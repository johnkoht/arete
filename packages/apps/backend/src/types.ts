/**
 * Shared types for the Areté backend server.
 */

import type { StagedSections, StagedItemStatus, StagedItemEdits } from '@arete/core';

export type MeetingSummary = {
  slug: string;
  title: string;
  date: string;
  status: string;
  attendees: Array<{ name: string; email: string }>;
  duration: string;
  source: string;
  recordingUrl: string;
};

export type ApprovedItems = {
  actionItems: string[];
  decisions: string[];
  learnings: string[];
};

/** Parsed item from body content (for old meetings without staged flow) */
export type ParsedItem = {
  text: string;
  completed?: boolean;
};

/** Parsed sections from meeting body */
export type ParsedSections = {
  actionItems: ParsedItem[];
  decisions: ParsedItem[];
  learnings: ParsedItem[];
};

export type FullMeeting = MeetingSummary & {
  summary: string;
  body: string;
  /** Just the transcript portion of body */
  transcript: string;
  frontmatter: Record<string, unknown>;
  stagedSections: StagedSections;
  stagedItemStatus: StagedItemStatus;
  /** User edits to staged item text (itemId → edited text) */
  stagedItemEdits: StagedItemEdits;
  /** Approved items (populated after approval via new staged flow) */
  approvedItems: ApprovedItems;
  /** Parsed sections from body (for old meetings or viewing approved items) */
  parsedSections: ParsedSections;
};
