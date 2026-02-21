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
