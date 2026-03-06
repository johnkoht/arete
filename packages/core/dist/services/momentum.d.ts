/**
 * Momentum service — commitment and relationship momentum analysis.
 *
 * computeCommitmentMomentum(): buckets open commitments into hot/stale/critical
 * computeRelationshipMomentum(): scans meeting attendees to classify relationships
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { Commitment } from '../models/index.js';
export type CommitmentBucket = 'hot' | 'stale' | 'critical';
export type CommitmentMomentumItem = {
    commitment: Commitment;
    bucket: CommitmentBucket;
    ageDays: number;
};
export type CommitmentMomentum = {
    hot: CommitmentMomentumItem[];
    stale: CommitmentMomentumItem[];
    critical: CommitmentMomentumItem[];
};
/**
 * Bucket open commitments by how long they've been open.
 *
 * Hot:      < 7 days old (recently created, still in motion)
 * Stale:    7–30 days old (drifting, needs attention)
 * Critical: > 30 days old (seriously overdue)
 *
 * Age is measured from the commitment's `date` field.
 */
export declare function computeCommitmentMomentum(commitments: Commitment[], referenceDate?: Date): CommitmentMomentum;
export type RelationshipBucket = 'active' | 'cooling' | 'stale';
export type RelationshipMomentumItem = {
    personSlug: string;
    personName: string;
    lastMeetingDate: string;
    daysSinceMeeting: number;
    bucket: RelationshipBucket;
    meetingCount: number;
};
export type RelationshipMomentum = {
    active: RelationshipMomentumItem[];
    cooling: RelationshipMomentumItem[];
    stale: RelationshipMomentumItem[];
};
/**
 * Compute relationship momentum by scanning meeting attendees.
 *
 * Reads all .md files in meetingsDirPath, collects attendee slugs per meeting,
 * and classifies each known person by their last meeting date.
 *
 * @param meetingsDirPath - Absolute path to resources/meetings/
 * @param peopleDir - Absolute path to people/ directory
 * @param storage - StorageAdapter
 * @param options - { days: 90 } lookback for "known" relationships; { personSlug } to filter
 */
export declare function computeRelationshipMomentum(meetingsDirPath: string, peopleDir: string, storage: StorageAdapter, options?: {
    days?: number;
    personSlug?: string;
    referenceDate?: Date;
}): Promise<RelationshipMomentum>;
//# sourceMappingURL=momentum.d.ts.map