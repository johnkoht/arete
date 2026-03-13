/**
 * Integrations domain types.
 *
 * Imports from common.ts ONLY.
 */

// ---------------------------------------------------------------------------
// Staged item types (meeting triage)
// ---------------------------------------------------------------------------

/** Status of an individual staged item — pending until the user acts on it */
export type StagedItemStatus = Record<string, 'approved' | 'skipped' | 'pending'>;

/** Map of itemId → edited text (only present when the user edits the default text) */
export type StagedItemEdits = Record<string, string>;

/** Owner metadata for a single action item */
export type StagedItemOwnerMeta = {
  ownerSlug?: string;
  direction?: StagedItemDirection;
  counterpartySlug?: string;
};

/** Map of itemId → owner metadata (for action items) */
export type StagedItemOwner = Record<string, StagedItemOwnerMeta>;

/** Direction of an action item relative to the user. */
export type StagedItemDirection = 'i_owe_them' | 'they_owe_me';

/** A single staged item extracted from a meeting file */
export type StagedItem = {
  id: string;   // e.g. "ai_001"
  text: string;
  type: 'ai' | 'de' | 'le';
  /** Origin of this item: ai (LLM extracted), dedup (matched user notes) */
  source?: 'ai' | 'dedup';
  /** LLM confidence score (0-1) for extracted items */
  confidence?: number;
  /** Owner slug for action items (who is responsible) */
  ownerSlug?: string;
  /** Direction: does the user owe them, or do they owe the user? */
  direction?: StagedItemDirection;
  /** Counterparty slug for action items (who is the other party) */
  counterpartySlug?: string;
};

/** All three staged sections for a meeting */
export type StagedSections = {
  actionItems: StagedItem[];
  decisions: StagedItem[];
  learnings: StagedItem[];
};

/** Fathom transcript from integration */
export type FathomTranscript = {
  id: string;
  title: string;
  date: string;
  duration?: number;
  summary?: string;
  transcriptPath?: string;
  meetingId?: string;
};

/** Integration configuration (maps to IntegrationDefinition) */
export type IntegrationConfig = {
  name: string;
  displayName: string;
  description: string;
  implements: string[];
  auth: IntegrationAuth;
  status: 'available' | 'planned';
};

/** Integration auth configuration */
export type IntegrationAuth = {
  type: 'api_key' | 'oauth' | 'none';
  envVar?: string;
  configKey?: string;
  instructions?: string;
};

/** Integration definition */
export type IntegrationDefinition = {
  name: string;
  displayName: string;
  description: string;
  implements: string[];
  auth: IntegrationAuth;
  status: 'available' | 'planned';
};

/** Seedable/pullable integration config */
export type ScriptableIntegration = {
  name: string;
  displayName: string;
  description: string;
  defaultDays: number;
  maxDays?: number;
  script: string;
  command: string;
};

/** Result from running an integration script */
export type ScriptResult = {
  stdout: string;
  stderr: string;
  code?: number;
};

/** Options for pull operations */
export type PullOptions = {
  integration: string;
  days?: number;
  force?: boolean;
  /** Notion: array of page URLs or IDs to pull */
  pages?: string[];
  /** Notion: where to save pulled pages */
  destination?: string;
};

/** Result of a pull operation */
export type PullResult = {
  integration: string;
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  errors: string[];
};

/** Integration status from config file */
export type IntegrationStatus = 'active' | 'inactive' | 'error' | null;

/** Entry returned by IntegrationService.list() */
export type IntegrationListEntry = {
  name: string;
  displayName: string;
  description: string;
  implements: string[];
  status: 'available' | 'planned';
  configured: IntegrationStatus;
  active: boolean;
};
