/**
 * Entities domain types.
 *
 * Imports from common.ts ONLY.
 */

import type { EntityType } from './common.js';

/** People category for person classification */
export type PersonCategory = 'internal' | 'customers' | 'users';

/** Affiliation lens for people intelligence */
export type PersonAffiliation = 'internal' | 'external' | 'unknown';

/** Role lens for people intelligence */
export type PersonRoleLens = 'customer' | 'user' | 'partner' | 'unknown';

/** Tracking intent for people triage */
export type TrackingIntent = 'track' | 'defer' | 'ignore';

/** Person record (from frontmatter or API) */
export type Person = {
  slug: string;
  name: string;
  email?: string | null;
  role?: string | null;
  company?: string | null;
  team?: string | null;
  category: PersonCategory;
};

/** Meeting record */
export type Meeting = {
  id: string;
  title: string;
  date: string;
  attendees: string[];
  notes?: string;
  transcriptPath?: string;
  projectSlug?: string;
};

/** Project record */
export type Project = {
  slug: string;
  name: string;
  description?: string;
  status?: 'active' | 'completed' | 'archived';
  created?: string;
  updated?: string;
};

/** Goal status for tracking progress */
export type GoalStatus = 'active' | 'complete' | 'deferred';

/** Goal type — outcomes are measurable results, milestones are discrete achievements */
export type GoalType = 'outcome' | 'milestone';

/** Goal record (individual goal file) */
export type Goal = {
  /** Unique identifier (e.g., "Q1-1") */
  id: string;
  /** Filename-safe version of the goal */
  slug: string;
  /** Goal title */
  title: string;
  /** Current status */
  status: GoalStatus;
  /** Quarter this goal belongs to (e.g., "2026-Q1") */
  quarter: string;
  /** Type of goal */
  type: GoalType;
  /** How this goal aligns with org strategy */
  orgAlignment: string;
  /** Criteria for measuring success */
  successCriteria: string;
  /** Path to the goal file */
  filePath: string;
  /** Optional freeform content */
  body?: string;
  /** Optional area association — links goal to a persistent work domain */
  area?: string;
};

/** Candidate input for people intelligence classification */
export type PeopleIntelligenceCandidate = {
  name?: string;
  email?: string | null;
  company?: string | null;
  text?: string | null;
  source?: string | null;
  actualRoleLens?: PersonRoleLens;
};

/** Evidence item for people intelligence suggestions */
export type PeopleIntelligenceEvidence = {
  kind: 'email-domain' | 'profile-hint' | 'text-signal' | 'existing-person' | 'enrichment';
  source: string;
  snippet: string;
};

/** Feature toggles for people intelligence behavior */
export type PeopleIntelligenceFeatureToggles = {
  enableExtractionTuning: boolean;
  enableEnrichment: boolean;
};

/** Policy configuration for people intelligence */
export type PeopleIntelligencePolicy = {
  confidenceThreshold: number;
  defaultTrackingIntent: TrackingIntent;
  features: PeopleIntelligenceFeatureToggles;
};

/** Recommendation payload for people intelligence */
export type PeopleIntelligenceSuggestion = {
  candidate: PeopleIntelligenceCandidate;
  recommendation: {
    affiliation: PersonAffiliation;
    roleLens: PersonRoleLens;
    trackingIntent: TrackingIntent;
    category: PersonCategory | 'unknown_queue';
  };
  confidence: number;
  rationale: string;
  evidence: PeopleIntelligenceEvidence[];
  status: 'recommended' | 'needs-review';
  enrichmentApplied: boolean;
};

/** KPI snapshot for people intelligence digest */
export type PeopleIntelligenceMetrics = {
  misclassificationRate: number | null;
  triageBurdenMinutes: number;
  interruptionComplaintRate: number;
  unknownQueueRate: number;
  extractionQualityScore: number | null;
};

/** Digest output (batch review default) */
export type PeopleIntelligenceDigest = {
  mode: 'digest';
  totalCandidates: number;
  suggestedCount: number;
  unknownQueueCount: number;
  suggestions: PeopleIntelligenceSuggestion[];
  metrics: PeopleIntelligenceMetrics;
  policy: PeopleIntelligencePolicy;
};

/** Persisted KPI snapshot record for trend analysis */
export type PeopleIntelligenceSnapshot = {
  createdAt: string;
  metrics: PeopleIntelligenceMetrics;
  totalCandidates: number;
  unknownQueueCount: number;
};

/** A resolved entity */
export type ResolvedEntity = {
  type: 'person' | 'meeting' | 'project';
  path: string;
  name: string;
  slug?: string;
  metadata: Record<string, unknown>;
  score: number;
};

/** Source type classification for entity mentions */
export type MentionSourceType = 'context' | 'meeting' | 'memory' | 'project' | 'conversation';

/** Mention of an entity in content */
export type EntityMention = {
  entity: string;
  entityType: EntityType;
  sourcePath: string;
  sourceType: MentionSourceType;
  excerpt: string;
  date?: string;
};

/** Relationship type — exactly three types */
export type RelationshipType = 'works_on' | 'attended' | 'mentioned_in';

/** Relationship between two entities */
export type EntityRelationship = {
  from: string;
  fromType: EntityType;
  to: string;
  toType: EntityType;
  type: RelationshipType;
  evidence?: string;
};

// ---------------------------------------------------------------------------
// Commitments domain
// ---------------------------------------------------------------------------

/** Lifecycle status of a commitment */
export type CommitmentStatus = 'open' | 'resolved' | 'dropped';

/**
 * Direction of a commitment relative to the user.
 *
 * Defined here in models (parallel to ActionItemDirection in services) to
 * avoid circular imports between models and services.
 */
export type CommitmentDirection = 'i_owe_them' | 'they_owe_me';

/**
 * A tracked commitment between the user and another person.
 *
 * `date` — meeting/source date (when the commitment was made).
 * `resolvedAt` — ISO date string set when the commitment is resolved or dropped.
 *   Null means the commitment is still open and must NOT be pruned.
 *   A commitment from months ago resolved yesterday will have a recent `resolvedAt`
 *   and must be retained; pruning logic must use `resolvedAt`, never `date`.
 */
export type Commitment = {
  id: string;
  text: string;
  direction: CommitmentDirection;
  personSlug: string;
  personName: string;
  source: string;
  date: string;
  status: CommitmentStatus;
  resolvedAt: string | null;
  /** Optional project association — inherited from meeting's projectSlug */
  projectSlug?: string;
  /** Optional goal association — links commitment to a quarterly goal */
  goalSlug?: string;
  /** Optional area association — domain scoping for commitment. Metadata only, NOT part of dedup hash. */
  area?: string;
};

/** Persisted commitments file structure */
export type CommitmentsFile = {
  commitments: Commitment[];
};

// ---------------------------------------------------------------------------
// Areas domain
// ---------------------------------------------------------------------------

/**
 * Recurring meeting configuration from area frontmatter.
 */
export type RecurringMeeting = {
  /** Meeting title pattern for matching */
  title: string;
  /** Attendee slugs for this recurring meeting */
  attendees: string[];
  /** Meeting frequency (e.g., 'weekly', 'biweekly', 'monthly') */
  frequency?: string;
};

/**
 * Area YAML frontmatter structure.
 */
export type AreaFrontmatter = {
  /** Area display name */
  area?: string;
  /** Area status (active, inactive, archived) */
  status?: string;
  /** Recurring meetings associated with this area */
  recurring_meetings?: Array<{
    title?: string;
    attendees?: string[];
    frequency?: string;
  }>;
};

/**
 * Match result for meeting-to-area lookup.
 */
export type AreaMatch = {
  /** The matched area's slug */
  areaSlug: string;
  /** How the match was determined */
  matchType: 'recurring' | 'inferred';
  /** Confidence of the match (0.0 - 1.0) */
  confidence: number;
};

/**
 * Parsed sections from area markdown body.
 */
export type AreaSections = {
  currentState: string | null;
  keyDecisions: string | null;
  backlog: string | null;
  activeGoals: string | null;
  activeWork: string | null;
  openCommitments: string | null;
  notes: string | null;
};

/**
 * Memory context for an area, parsed from areas/{slug}/memory.md.
 * Used for relevance scoring in meeting reconciliation.
 */
export type AreaMemory = {
  /** Keywords that indicate relevance to this area */
  keywords: string[];
  /** Person slugs of people actively working in this area */
  activePeople: string[];
  /** Current open work items/tasks */
  openWork: string[];
  /** Recently completed work (for completion matching) */
  recentlyCompleted: string[];
  /** Recent decisions made in this area */
  recentDecisions: string[];
};

/**
 * Complete parsed context for an area.
 */
export type AreaContext = {
  /** Area slug (filename without .md) */
  slug: string;
  /** Area display name from frontmatter */
  name: string;
  /** Area status */
  status: string;
  /** Recurring meetings associated with this area */
  recurringMeetings: RecurringMeeting[];
  /** Path to the area file */
  filePath: string;
  /** Parsed markdown sections */
  sections: AreaSections;
  /** Parsed memory context from areas/{slug}/memory.md */
  memory?: AreaMemory;
};

// ---------------------------------------------------------------------------
// Reconciliation domain
// ---------------------------------------------------------------------------

/**
 * A structured action item for reconciliation.
 *
 * Mirrors the ActionItem shape from meeting-extraction but lives in models
 * to keep the models layer free of service imports.
 */
export type ReconciliationActionItem = {
  owner: string;
  ownerSlug: string;
  description: string;
  direction: 'i_owe_them' | 'they_owe_me';
  counterpartySlug?: string;
  due?: string;
  confidence?: number;
};

/**
 * Item types that can be reconciled from meeting extractions.
 */
export type ExtractedItemType = 'action' | 'decision' | 'learning';

/**
 * A single item being reconciled, with its status and annotations.
 */
export type ReconciledItem = {
  /** The original extracted item (action item struct, or decision/learning text) */
  original: ReconciliationActionItem | string;
  /** Type of item */
  type: ExtractedItemType;
  /** Source meeting path */
  meetingPath: string;
  /** Reconciliation status */
  status: 'keep' | 'duplicate' | 'completed' | 'irrelevant';
  /** Relevance score (0-1) */
  relevanceScore: number;
  /** Relevance tier derived from score */
  relevanceTier: 'high' | 'normal' | 'low';
  /** Annotations explaining the reconciliation */
  annotations: {
    areaSlug?: string;
    projectSlug?: string;
    personSlug?: string;
    duplicateOf?: string;
    completedOn?: string;
    why: string;
  };
};

/**
 * Result of reconciling a batch of meeting extractions.
 */
export type ReconciliationResult = {
  /** All reconciled items */
  items: ReconciledItem[];
  /** Summary statistics */
  stats: {
    duplicatesRemoved: number;
    completedMatched: number;
    lowRelevanceCount: number;
  };
};

/**
 * Context used for reconciliation scoring and matching.
 */
export type ReconciliationContext = {
  /** Area memories keyed by area slug */
  areaMemories: Map<string, AreaMemory>;
  /** Recently committed memory items for duplicate detection */
  recentCommittedItems: Array<{
    text: string;
    date: string;
    source: string;
  }>;
  /** Completed tasks for completion matching */
  completedTasks: Array<{
    text: string;
    completedOn: string;
    owner?: string;
  }>;
};
