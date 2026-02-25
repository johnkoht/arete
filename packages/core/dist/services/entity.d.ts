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
export interface ListPeopleOptions {
    category?: PersonCategory;
}
export interface RefreshPersonMemoryOptions {
    personSlug?: string;
    minMentions?: number;
    ifStaleDays?: number;
}
export interface RefreshPersonMemoryResult {
    updated: number;
    scannedPeople: number;
    scannedMeetings: number;
    skippedFresh: number;
    /** Number of conversation files scanned. Optional for backward compatibility. */
    scannedConversations?: number;
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
    constructor(storage: StorageAdapter, searchProvider?: SearchProvider | undefined);
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
    loadPeopleIntelligencePolicy(workspacePaths: WorkspacePaths | null): Promise<PeopleIntelligencePolicy>;
    private mergePeopleIntelligencePolicy;
    savePeopleIntelligenceSnapshot(workspacePaths: WorkspacePaths | null, digest: PeopleIntelligenceDigest): Promise<void>;
    getRecentPeopleIntelligenceSnapshots(workspacePaths: WorkspacePaths | null, limit?: number): Promise<PeopleIntelligenceSnapshot[]>;
    suggestPeopleIntelligence(candidates: PeopleIntelligenceCandidate[], workspacePaths: WorkspacePaths | null, options?: PeopleIntelligenceOptions): Promise<PeopleIntelligenceDigest>;
    buildPeopleIndex(workspacePaths: WorkspacePaths | null): Promise<void>;
}
export { PEOPLE_CATEGORIES };
//# sourceMappingURL=entity.d.ts.map