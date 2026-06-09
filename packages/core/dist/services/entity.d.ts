/**
 * EntityService — resolves entity references, relationships, and people management.
 *
 * Ported from src/core/entity-resolution.ts and src/core/people.ts.
 * Uses StorageAdapter for all file I/O (no direct fs imports).
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { SearchProvider } from '../search/types.js';
import type { EntityType, ResolvedEntity, EntityMention, EntityRelationship, Person, PersonCategory, PeopleIntelligenceCandidate, PeopleIntelligenceDigest, PeopleIntelligenceFeatureToggles, PeopleIntelligencePolicy, PeopleIntelligenceSnapshot, TrackingIntent, WorkspacePaths } from '../models/index.js';
declare const PEOPLE_CATEGORIES: PersonCategory[];
/**
 * Generate a URL-safe slug from a name (e.g. "Jane Doe" -> "jane-doe").
 */
export declare function slugifyPersonName(name: string): string;
/**
 * Tokenize stance topic text for Jaccard comparison.
 * Lowercase, replace non-alphanumeric with space, split, drop tokens of length <= 2
 * (filters stopwords-ish noise like "a", "an", "by", "of", "on").
 *
 * Exported for unit testing.
 */
export declare function normalizeStanceTokens(text: string): Set<string>;
/**
 * Compute Jaccard similarity between two token sets.
 * Returns 0–1 where 1 is identical and 0 is completely disjoint.
 *
 * Exported for unit testing.
 */
export declare function stanceJaccardSimilarity(a: Set<string>, b: Set<string>): number;
/** Jaccard threshold above which two stances with the same direction are considered duplicates. */
export declare const STANCE_JACCARD_DEDUP_THRESHOLD = 0.7;
/**
 * Dedup a list of stances by Jaccard token similarity on `topic`, scoped per `direction`.
 *
 * For each new stance:
 * - Compute its token set on `topic`.
 * - Compare against already-kept stances with the same `direction`.
 * - If any has Jaccard ≥ STANCE_JACCARD_DEDUP_THRESHOLD → drop the new one.
 * - Otherwise → keep it.
 *
 * Order is preserved: the first occurrence (earliest meeting in input order) wins,
 * preserving provenance.
 *
 * Exported for unit testing.
 */
export declare function dedupeStancesByJaccard(stances: readonly PersonStance[], threshold?: number): PersonStance[];
/**
 * Channel-style fields recognized by Phase 7a AC5 convention. Only
 * populated fields are returned; missing fields are simply absent
 * from the returned object (so `Object.keys(channels).length` is the
 * "populated count" for audit purposes).
 *
 * Schema convention: see `dev/conventions/person-frontmatter.md`.
 */
export type PersonChannels = {
    email?: string;
    alt_emails?: string[];
    slack_user_id?: string;
    slack_handle?: string;
    phone?: string;
};
/**
 * Extract populated channel-style fields from a person file's
 * frontmatter. Tolerant: missing fields are simply absent from the
 * returned object; malformed entries (wrong type) are dropped.
 *
 * Returns null only when the file doesn't exist or has no frontmatter
 * (matching the readPersonFile null contract).
 */
export declare function readPersonChannels(storage: StorageAdapter, filePath: string): Promise<PersonChannels | null>;
/**
 * Phase 7a AC5c — audit result for channel-field population across
 * the workspace. Surfaces what's populated so a reconciler (Phase 8)
 * can degrade gracefully when channel fields are missing.
 */
export type ChannelsAuditEntry = {
    slug: string;
    category: PersonCategory;
    populated: string[];
    missing: string[];
};
export type ChannelsAuditResult = {
    total: number;
    with_email: number;
    with_alt_emails: number;
    with_slack_user_id: number;
    with_slack_handle: number;
    with_phone: number;
    /** People that have NO channel fields populated (not even email). */
    no_channels: number;
    /**
     * Per-person gap detail — only people missing at least one channel
     * field. Sorted alphabetically by slug for stable output.
     */
    gaps: ChannelsAuditEntry[];
};
declare const CHANNEL_FIELD_NAMES: readonly ["email", "alt_emails", "slack_user_id", "slack_handle", "phone"];
/**
 * Compute the channels-audit result given a per-person channels map.
 * Pure function — easy to unit-test without filesystem.
 */
export declare function computeChannelsAudit(perPerson: Array<{
    slug: string;
    category: PersonCategory;
    channels: PersonChannels;
}>): ChannelsAuditResult;
export { CHANNEL_FIELD_NAMES };
import { CommitmentsService } from './commitments.js';
import type { AreaParserService } from './area-parser.js';
import type { LLMCallFn, PersonStance } from './person-signals.js';
export interface ListPeopleOptions {
    category?: PersonCategory;
}
export interface RefreshPersonMemoryOptions {
    personSlug?: string;
    minMentions?: number;
    ifStaleDays?: number;
    callLLM?: LLMCallFn;
    /** When true, compute everything but skip writing files to disk. */
    dryRun?: boolean;
    /**
     * When provided, enables bidirectional commitment sync via person memory checkboxes.
     * Commitments are rendered as `- [ ] text (date) <!-- h:XXXXXXXX -->` lines.
     * On refresh, checked boxes and deleted lines are auto-resolved.
     * Without this option, plain-text action items are rendered (no regression).
     */
    commitments?: CommitmentsService;
    /**
     * Pin the "current date" used for action-item staleness aging
     * (defaults to wall-clock now). Surfaced for deterministic testing so the
     * staleness window can be anchored relative to fixture dates rather than
     * `Date.now()`, which otherwise turns fixed-date fixtures into time-bombs.
     */
    referenceDate?: Date;
}
export interface RefreshPersonMemoryResult {
    updated: number;
    scannedPeople: number;
    scannedMeetings: number;
    skippedFresh: number;
    /** Number of conversation files scanned. Optional for backward compatibility. */
    scannedConversations?: number;
    /** Number of stances extracted across all people. */
    stancesExtracted: number;
    /** Number of action items extracted across all people (after lifecycle). */
    actionItemsExtracted: number;
    /** Number of action items aged out (stale). */
    itemsAgedOut: number;
}
export interface PeopleIntelligenceOptions {
    confidenceThreshold?: number;
    internalDomains?: string[];
    defaultTrackingIntent?: TrackingIntent;
    features?: Partial<PeopleIntelligenceFeatureToggles>;
    extractionQualityScore?: number | null;
}
export declare class EntityService {
    private storage;
    private searchProvider?;
    private directoryProvider?;
    private areaParser?;
    constructor(storage: StorageAdapter, searchProvider?: SearchProvider | undefined, directoryProvider?: import('../integrations/gws/types.js').DirectoryProvider | null);
    /**
     * Inject AreaParserService for area-inference fallback during refreshPersonMemory
     * (phase-8-followup-8 AC2). Called by the service factory after both services exist.
     *
     * When set, refreshPersonMemory falls back to `suggestAreaForMeeting()` when a
     * meeting has no `area:` in its frontmatter, applying the match at a 0.7
     * confidence floor (recurring + area-name matches; rejects weak keyword overlap).
     *
     * Without this injection, area inference is silently skipped — Path B still
     * propagates `area:` when the meeting has it in frontmatter, just no fallback.
     */
    setAreaParser(parser: AreaParserService): void;
    resolve(reference: string, type: EntityType, workspacePaths: WorkspacePaths): Promise<ResolvedEntity | null>;
    resolveAll(reference: string, type: EntityType, workspacePaths: WorkspacePaths, limit?: number): Promise<ResolvedEntity[]>;
    findMentions(entity: ResolvedEntity, workspacePaths: WorkspacePaths): Promise<EntityMention[]>;
    getRelationships(entity: ResolvedEntity, workspacePaths: WorkspacePaths): Promise<EntityRelationship[]>;
    /**
     * Check if content has team/owner sections mentioning the entity.
     */
    private matchesTeamOrOwner;
    /**
     * Check if meeting content/frontmatter has this entity as an attendee.
     */
    private matchesAttendee;
    refreshPersonMemory(workspacePaths: WorkspacePaths | null, options?: RefreshPersonMemoryOptions): Promise<RefreshPersonMemoryResult>;
    listPeople(workspacePaths: WorkspacePaths | null, options?: ListPeopleOptions): Promise<Person[]>;
    showPerson(slugOrEmail: string, workspacePaths: WorkspacePaths | null): Promise<Person | null>;
    getPersonBySlug(workspacePaths: WorkspacePaths | null, category: PersonCategory, slug: string): Promise<Person | null>;
    getPersonByEmail(workspacePaths: WorkspacePaths | null, email: string): Promise<Person | null>;
    /**
     * Phase 7a AC5b — read channel-style fields for one person by slug.
     * Only populated fields are returned. Returns null if person file
     * not found or has no frontmatter.
     */
    getPersonChannels(workspacePaths: WorkspacePaths | null, category: PersonCategory, slug: string): Promise<PersonChannels | null>;
    /**
     * Phase 7a AC5c — workspace-wide audit of channel-field population.
     * Walks all `people/{internal,users,customers}/*.md`, counts which
     * channel fields are populated per person, and returns aggregate
     * health + per-person gap detail.
     */
    auditPeopleChannels(workspacePaths: WorkspacePaths | null): Promise<ChannelsAuditResult>;
    loadPeopleIntelligencePolicy(workspacePaths: WorkspacePaths | null): Promise<PeopleIntelligencePolicy>;
    private mergePeopleIntelligencePolicy;
    savePeopleIntelligenceSnapshot(workspacePaths: WorkspacePaths | null, digest: PeopleIntelligenceDigest): Promise<void>;
    getRecentPeopleIntelligenceSnapshots(workspacePaths: WorkspacePaths | null, limit?: number): Promise<PeopleIntelligenceSnapshot[]>;
    suggestPeopleIntelligence(candidates: PeopleIntelligenceCandidate[], workspacePaths: WorkspacePaths | null, options?: PeopleIntelligenceOptions): Promise<PeopleIntelligenceDigest>;
    buildPeopleIndex(workspacePaths: WorkspacePaths | null): Promise<void>;
}
export { PEOPLE_CATEGORIES };
//# sourceMappingURL=entity.d.ts.map