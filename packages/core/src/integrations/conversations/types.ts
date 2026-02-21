/**
 * Conversation artifact types for manual conversation capture.
 *
 * Follows MeetingForSave pattern from ../meetings.ts.
 * Source-agnostic: works with Slack, Teams, email, or any pasted text.
 */

/**
 * Optional insight sections extracted from a conversation.
 * Each section is only present when the conversation warrants it.
 */
export type ConversationInsights = {
  summary?: string;
  decisions?: string[];
  actionItems?: string[];
  openQuestions?: string[];
  stakeholders?: string[];
  risks?: string[];
};

/**
 * Provenance metadata for a conversation artifact.
 */
export type ConversationProvenance = {
  source: 'manual';
  capturedAt: string;
  capturedBy?: string;
};

/**
 * Full conversation data ready to be saved as a markdown artifact.
 */
export type ConversationForSave = {
  title: string;
  date: string;
  source: string;
  participants: string[];
  rawTranscript: string;
  normalizedContent: string;
  insights: ConversationInsights;
  provenance: ConversationProvenance;
  /**
   * Resolved person slugs for participants. When undefined, no `participant_ids`
   * field is written (backward compatible). When defined (even empty), the field
   * is written to frontmatter and can be patched after people mapping.
   */
  participantIds?: string[];
};
