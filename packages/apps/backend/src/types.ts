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

export type FullMeeting = MeetingSummary & {
  summary: string;
  body: string;
  frontmatter: Record<string, unknown>;
  stagedSections: StagedSections;
  stagedItemStatus: StagedItemStatus;
  /** User edits to staged item text (itemId → edited text) */
  stagedItemEdits: StagedItemEdits;
  /** Approved items (populated after approval) */
  approvedItems: ApprovedItems;
};
