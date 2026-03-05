/**
 * Shared types for the Areté backend server.
 */

import type { StagedSections, StagedItemStatus } from '@arete/core';

export type MeetingSummary = {
  slug: string;
  title: string;
  date: string;
  status: string;
  attendees: Array<{ name: string; email: string }>;
  duration: string;
  source: string;
};

export type FullMeeting = MeetingSummary & {
  summary: string;
  body: string;
  frontmatter: Record<string, unknown>;
  stagedSections: StagedSections;
  stagedItemStatus: StagedItemStatus;
};
