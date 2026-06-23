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
  /**
   * Area this project belongs to (Phase 12 AC1). Derived at read time in
   * priority order: frontmatter `area:` → `areas:[0]` → prose `**Area**:`
   * line → unresolved. Stored only via creation-time proposal or
   * `arete project backfill-area --apply`.
   */
  area?: string;
  /** Provenance for `area` — `manual` | `creation` | `backfill` (Phase 12 AC2). */
  areaSetBy?: string;
  /**
   * System-owned topics cache from README frontmatter (Phase 14 AC2).
   * Display/convenience ONLY — written exclusively by
   * `arete project refresh-topics --apply`; never hand-edited; NO
   * consumer may branch behavior on it without first making it
   * authoritative with its own freshness contract (pre-mortem R10 —
   * the ownership comment the writer stamps into the README is the
   * user-facing copy of this rule).
   */
  topics?: string[];
  /** Date the topics cache last changed (bumped ONLY on slug-set change, R2). */
  topicsRefreshed?: string;
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
  /** Source of the resolution (e.g. 'local', 'directory') */
  source?: string;
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
 *
 * Phase 10a (v2) introduces `'self'` for self-reminder commitments — these
 * carry no counterparty and the only stakeholder is the workspace owner.
 * Migration's owner-as-personSlug parser routes the "note to self" /
 * "remember to" / etc. patterns to this direction. Pre-Phase-10 code paths
 * NEVER emit `'self'` — old shape (only `'i_owe_them' | 'they_owe_me'`)
 * remains the v1 read path until `COMMITMENTS_V2_ACTIVE` is flipped.
 */
export type CommitmentDirection = 'i_owe_them' | 'they_owe_me' | 'self';

/**
 * Role a Stakeholder plays on a Commitment (Phase 10a v2 — PM G6).
 *
 *  - `recipient`: outbound — the user owes / will deliver TO this person.
 *  - `sender`:    inbound  — this person owes / will deliver TO the user.
 *  - `mentioned`: appears in the text as context, but isn't the counterparty.
 *  - `self`:      self-reminder; the only stakeholder is the workspace owner.
 *
 * The role distinction matters for downstream gates (Phase 8 R4 set-overlap
 * EXCLUDES role='self' so a self-reminder doesn't match a recurring-meeting
 * attendee just because the owner is on the attendee list — see
 * `getCommitmentCounterpartySlugs` in commitments.ts).
 */
export type StakeholderRole = 'recipient' | 'sender' | 'mentioned' | 'self';

/**
 * Stakeholder on a commitment (Phase 10a v2 data model).
 *
 * Replaces v1's single `personSlug` field. A commitment may carry multiple
 * stakeholders with distinct roles (e.g., "Send Lindsay the deck and CC
 * Anthony" → recipient=lindsay, mentioned=anthony).
 */
export type Stakeholder = {
  /** Person slug (matches a file in people/<category>/<slug>.md). */
  slug: string;
  /** Role this person plays on the commitment. */
  role: StakeholderRole;
};

/**
 * External source for a commitment (Phase 11 — RESERVED in v2).
 *
 * In Phase 10a v2 this is always an empty array on persisted entries;
 * Phase 11 will populate it from Slack / Gmail / Jira cross-references.
 * The shape is committed up front so v2 dry-run reads emit a stable JSON
 * key layout — adding the field later would shift diffs unnecessarily.
 */
export type ExternalSource = {
  kind: 'slack' | 'gmail' | 'jira';
  /** Optional permalink. Phase 11 fills this when the integration provides it. */
  url?: string;
  /** Free-form reference (channel/ts, message-id, ticket key). */
  ref: string;
};

/** Hard cap on `Commitment.textVariants` (PM Q3 / Phase 10a v2 spec). */
export const COMMITMENT_TEXT_VARIANTS_MAX = 5;

/**
 * A tracked commitment between the user and another person.
 *
 * `date` — meeting/source date (when the commitment was made).
 * `resolvedAt` — ISO date string set when the commitment is resolved or dropped.
 *   Null means the commitment is still open and must NOT be pruned.
 *   A commitment from months ago resolved yesterday will have a recent `resolvedAt`
 *   and must be retained; pruning logic must use `resolvedAt`, never `date`.
 *
 * **v1 → v2 coexistence** (Phase 10a, AC0a / AC1c): the v1 fields
 * (`personSlug`, `personName`, `source`) remain REQUIRED so the v1 read path
 * keeps working during the 3-5 day dry-run window between
 * `arete commitments migrate --to-v2 --dry-run` and `--apply`. The v2 fields
 * (`stakeholders`, `source_meetings`, `source_external`, `textVariants`) are
 * OPTIONAL on read — code that needs them defaults sensibly when absent (see
 * `getCommitmentCounterpartySlugs` for the canonical dual-shape pattern).
 * After `--apply` runs, all rows carry both shapes.
 */
export type Commitment = {
  id: string;
  text: string;
  direction: CommitmentDirection;
  personSlug: string;
  personName: string;
  source: string;
  date: string;
  /**
   * ISO 8601 wall-clock timestamp of first creation. Preserved across merges
   * (Phase 10 dedup) and used as a secondary sort key when `date` ties.
   *
   * Added in phase-10a-pre. For pre-existing entries the migration script at
   * `services/migrations/add-created-at.ts` backfills this with the `date`
   * field value (sentinel — date-only, no time component); entries created
   * after the migration use `new Date().toISOString()`.
   */
  createdAt: string;
  status: CommitmentStatus;
  resolvedAt: string | null;
  /** Optional project association — inherited from meeting's projectSlug */
  projectSlug?: string;
  /** Optional goal association — links commitment to a quarterly goal */
  goalSlug?: string;
  /** Optional area association — domain scoping for commitment. Metadata only, NOT part of dedup hash. */
  area?: string;
  /**
   * Provenance marker for `area` (phase-8-followup-8 AC3).
   *
   * Set to `'backfill'` ONLY when the area was populated by
   * `arete commitments backfill-area --apply`. Used by `--reset` to
   * selectively clear backfill-set areas while leaving Path A (meeting
   * approval) and Path B (extract-time) areas intact.
   *
   * Absent when area was set at creation time or by sync(); also absent
   * when area itself is absent.
   */
  areaSetBy?: 'backfill';

  // -------------------------------------------------------------------------
  // Phase 10a v2 shape — counterparty → stakeholders[] migration
  // -------------------------------------------------------------------------

  /**
   * Stakeholders on this commitment (Phase 10a v2).
   *
   * Replaces v1's single `personSlug` semantically. v1 `personSlug` remains
   * populated for backward compat; readers MUST prefer `stakeholders` when
   * present (see `getCommitmentCounterpartySlugs`). Migration's owner-as-
   * personSlug parser rewrites v1 rows by extracting counterparties from
   * the commitment text (arrow notation + natural language) so the workspace
   * owner does not appear as a fake recipient.
   */
  stakeholders?: Stakeholder[];

  /**
   * Meeting slugs that surfaced this commitment (Phase 10a v2).
   *
   * Replaces v1's single `source` field semantically. v1 `source` remains
   * populated for backward compat (the canonical meeting that minted the row);
   * `source_meetings` carries the union across all dedup merges — same
   * commitment voiced in three meetings has three entries here.
   */
  source_meetings?: string[];

  /**
   * External cross-references (Phase 11 — RESERVED in v2).
   *
   * Phase 10a writes this as `[]` on every v2 row for shape stability.
   * Phase 11 populates from Slack/Gmail/Jira providers.
   */
  source_external?: ExternalSource[];

  /**
   * Observed wordings of the commitment text (Phase 10a v2).
   *
   * Cap = `COMMITMENT_TEXT_VARIANTS_MAX` (5). Eviction is oldest-first when
   * full. Phase 10b's semantic dedup pipeline appends to this when an
   * extracted item lands on an existing canonical with non-identical text.
   * The migration seeds this with `[text]` so every v2 row has at least
   * one variant on disk.
   */
  textVariants?: string[];

  // -------------------------------------------------------------------------
  // Phase 11 11a — Gmail Sent auto-resolution fields
  // -------------------------------------------------------------------------

  /**
   * Who/what resolved this commitment (Phase 11 11a).
   *
   * Phase 10 had implicit `'user'` semantics (any `resolve()` call). Phase 11
   * adds `'auto-gmail'` for Gmail-Sent-evidence auto-resolutions. The union is
   * load-bearing for:
   *  - the audit trail (`arete resolve --explain`),
   *  - the `[[unresolve]]` filter (only `'auto-gmail'` + week-1-staged are
   *    `[[unresolve]]`-eligible; `'user'`-resolved use `arete commitments
   *    reopen` or `[[unconfirm]]` within 24h),
   *  - the `--revert-all` mass-unresolve (AC13).
   *
   * Absent on open commitments and on pre-Phase-11 resolutions.
   */
  resolvedBy?: 'user' | 'auto-gmail';

  /**
   * Gmail thread URL (or other external evidence permalink) that fulfilled
   * the commitment (Phase 11 11a). Clickable in winddown output. Preserved
   * across `[[unresolve]]` as part of the audit trail (only `resolvedBy` /
   * `resolvedConfidence` / `resolvedAt` clear; `resolvedEvidence` +
   * `source_external[]` stay for forensics).
   */
  resolvedEvidence?: string;

  /**
   * Confidence of the auto-resolution (Phase 11 11a).
   *
   * Only `'HIGH'` ever writes to disk — MEDIUM is a winddown-surface-only
   * "possibly done, confirm?" signal and never mutates a commitment (Q6).
   * `[[confirm]]` on a MEDIUM-flagged item writes `'HIGH'` (user adjudicated).
   */
  resolvedConfidence?: 'HIGH' | 'MEDIUM';

  /**
   * Suppress-until marker for `[[unresolve]]` (Phase 11 11a, G5 structured).
   *
   * Set to `now + 14d` when the user `[[unresolve]]`s an auto-resolution.
   * The auto-resolve pipeline checks this field BEFORE firing (Step 2a) and
   * skips the commitment while `now < unresolveSuppressedUntil`. This is a
   * STRUCTURED field, NOT a log-grep (G5) — the pre-check is a direct field
   * comparison.
   *
   * Sentinel `'2100-01-01T00:00:00.000Z'` = permanent suppress
   * (`[[unresolve <id> --permanent]]`, M4 / AC6c) — pipeline treats far-future
   * identically to 14d.
   */
  unresolveSuppressedUntil?: string;

  /**
   * First-week confirm-gate marker (Phase 11 11a, F2 / AC2a).
   *
   * During days 1-7 post-ship, a HIGH-confidence match STAGES the resolve by
   * setting this field WITHOUT mutating `status` — the commitment stays
   * `'open'` and is surfaced under "Staged for confirm" with full inline
   * evidence. Cleared on `[[confirm]]` (converts to user-resolve) or
   * `[[unresolve]]` (rejects + 14d suppress).
   */
  resolveStagedAt?: string;

  /**
   * `[[unconfirm]]` 24h-recovery marker (Phase 11 11a, F2 / AC2b).
   *
   * Set to `now` when a `[[confirm]]` writes a user-resolve. Within 24h, an
   * `[[unconfirm <id>]]` directive can flip the resolution back to staged
   * (re-evaluation). Outside the 24h window, `[[unconfirm]]` is a no-op and
   * the user must use `arete commitments reopen` / `[[unresolve]]`.
   */
  confirmedAt?: string;
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
  /**
   * Former slugs this area was known by. Lets an area file be renamed
   * without rewriting historical `area:` references — old refs are
   * point-in-time records and stay as written; joins canonicalize via
   * the alias map instead. Resolution keys only: aliases never
   * participate in name/keyword inference (suggestAreaForMeeting).
   */
  aliases?: string[];
  /** Recurring meetings associated with this area */
  recurring_meetings?: Array<{
    title?: string;
    attendees?: string[];
    frequency?: string;
  }>;
  /**
   * Optional Jira epic watchlist for this area (Phase 7a AC4).
   * Strings — typically Jira ticket keys (e.g., "PLAT-11014"). Free-form;
   * no validation today (no Jira MCP wired). Phase 8 reconciler reads
   * the watchlist to prompt user for current state per epic.
   * Missing or empty = no epics tracked for this area.
   */
  jira_epics?: string[];
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
  /**
   * Which signal produced this match (Phase 13, pre-mortem D1). Additive —
   * existing consumers key off areaSlug/confidence only. The 0.8
   * name-substring match is the mislabel-prone signal; callers that write
   * areas at scale (meeting backfill) apply per-signal policy instead of
   * comparing confidence against magic numbers.
   *  - 'recurring-title'   exact recurring_meetings[].title match (1.0)
   *  - 'area-name-title'   area name substring in the meeting TITLE (0.8)
   *  - 'area-name-summary' area name substring in the SUMMARY only (0.8)
   *  - 'keyword'           focus-keyword Jaccard overlap (≤0.7)
   */
  signal?: 'recurring-title' | 'area-name-title' | 'area-name-summary' | 'keyword';
  /**
   * True when a second distinct signal also matched the SAME area
   * (e.g. name match + keyword overlap). Backfill preview uses this to
   * separate corroborated proposals from name-only ones (D1).
   */
  corroborated?: boolean;
};

/**
 * Parsed sections from area markdown body.
 */
export type AreaSections = {
  goal: string | null;
  focus: string | null;
  horizon: string | null;
  projects: string | null;
  backlog: string | null;
  stakeholders: string | null;
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
  /**
   * Jira epic watchlist for this area (Phase 7a AC4).
   * Defaults to empty array when frontmatter `jira_epics:` is missing.
   * Malformed entries (non-strings) are dropped at parse time.
   */
  jiraEpics: string[];
  /**
   * Former slugs (frontmatter `aliases:`). Defaults to empty array.
   * Malformed entries (non-strings/empty) are dropped at parse time.
   */
  aliases: string[];
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
  /** `'none'` = team-internal (single-pass D3); inert in commitments (D7). */
  direction: 'i_owe_them' | 'they_owe_me' | 'none';
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
