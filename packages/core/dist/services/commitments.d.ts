/**
 * CommitmentsService — single source of truth for commitment data.
 *
 * Manages `.arete/commitments.json` via StorageAdapter — no direct fs calls.
 *
 * Hash computation mirrors computeActionItemHash() in person-signals.ts but is
 * intentionally kept as a local replica to avoid a service-layer circular dependency.
 * Both use: sha256(normalized text + personSlug + direction).
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { Commitment, CommitmentDirection, CommitmentStatus } from '../models/index.js';
import type { PersonActionItem } from './person-signals.js';
import type { HealthIndicator } from './person-health.js';
/**
 * Priority levels for commitments based on computed score.
 */
export type PriorityLevel = 'high' | 'medium' | 'low';
/**
 * Input for computing commitment priority.
 */
export type CommitmentPriorityInput = {
    daysOpen: number;
    healthIndicator: HealthIndicator;
    direction: CommitmentDirection;
    text: string;
};
/**
 * Output from priority computation.
 */
export type CommitmentPriorityResult = {
    score: number;
    level: PriorityLevel;
};
/**
 * Compute priority score for a commitment.
 *
 * Formula: priority = (staleness * 30) + (health * 25) + (direction * 25) + (specificity * 20)
 * All component scores are 0-100, so the final score is 0-100.
 *
 * @param input - Commitment attributes needed for scoring
 * @returns Priority score (0-100) and level (high/medium/low)
 */
export declare function computeCommitmentPriority(input: CommitmentPriorityInput): CommitmentPriorityResult;
/**
 * Options for creating a commitment.
 */
export type CreateCommitmentOptions = {
    /** Create a linked task in inbox. Default: true for i_owe_them, false for they_owe_me */
    createTask?: boolean;
    /** Goal slug to attach to commitment (metadata) */
    goalSlug?: string;
    /** Area slug to attach to commitment (metadata) */
    area?: string;
    /** Meeting date for the commitment */
    date?: Date;
    /** Meeting source file */
    source?: string;
};
/**
 * Result of creating a commitment.
 */
export type CreateCommitmentResult = {
    commitment: Commitment;
    task?: {
        id: string;
        text: string;
        destination: string;
    };
};
/**
 * Function to create a linked task. Injected by factory to avoid circular dep.
 */
export type CreateTaskFn = (text: string, metadata: {
    area?: string;
    person?: string;
    from?: {
        type: 'commitment' | 'meeting';
        id: string;
    };
}) => Promise<{
    id: string;
    text: string;
}>;
export declare class CommitmentsService {
    private readonly storage;
    private readonly filePath;
    private createTaskFn?;
    constructor(storage: StorageAdapter, workspaceRoot: string);
    /**
     * Set the task creation function. Called by factory after TaskService is created.
     * Avoids circular dependency.
     */
    setCreateTaskFn(fn: CreateTaskFn): void;
    private load;
    /**
     * Write commitments to disk, applying pruning first.
     * ⚠️ Pruning uses `resolvedAt`, never `date`. Open items are never pruned.
     */
    private save;
    /**
     * List open commitments, optionally filtered by direction, person slugs, and/or area.
     */
    listOpen(opts?: {
        direction?: CommitmentDirection;
        personSlugs?: string[];
        area?: string;
    }): Promise<Commitment[]>;
    /**
     * Convenience: open commitments for a single person.
     * Delegates to listOpen().
     */
    listForPerson(personSlug: string): Promise<Commitment[]>;
    /**
     * Mark a commitment as resolved or dropped.
     *
     * Accepts an 8-char prefix OR a full 64-char hash.
     * Errors if 0 matches; errors if 2+ matches (ambiguous prefix).
     */
    resolve(id: string, status?: Extract<CommitmentStatus, 'resolved' | 'dropped'>): Promise<Commitment>;
    /**
     * Batch resolve a list of ids using the same prefix matching as resolve().
     * Returns all resolved commitments.
     */
    bulkResolve(ids: string[], status?: Extract<CommitmentStatus, 'resolved' | 'dropped'>): Promise<Commitment[]>;
    /**
     * Merge extraction results from person-signals into commitments.json.
     *
     * Input: Map<personSlug, PersonActionItem[]>
     * nameMap: optional Map<personSlug, personName> — used to store real names instead of slugs
     *
     * Rules:
     * - New items (hash not seen before) → add as 'open'
     * - Existing open items → preserve as-is
     * - Existing resolved/dropped items → NEVER reopen
     */
    sync(freshItems: Map<string, PersonActionItem[]>, nameMap?: Map<string, string>): Promise<void>;
    /**
     * Fuzzy-match completed items against open commitments using Jaccard similarity.
     *
     * Threshold: ≥ 0.6 (JACCARD_THRESHOLD).
     * Never auto-resolves — only returns candidates sorted by confidence descending.
     *
     * Uses normalized word-overlap Jaccard similarity:
     *   normalize = lowercase + strip non-alphanumeric + split on whitespace
     *   jaccard   = |intersection| / |union|
     */
    reconcile(completedItems: {
        text: string;
        source: string;
    }[]): Promise<{
        commitment: Commitment;
        completedItem: {
            text: string;
            source: string;
        };
        confidence: number;
    }[]>;
    /**
     * Create a commitment with optional linked task.
     *
     * For i_owe_them: default creates linked task in inbox
     * For they_owe_me: default does NOT create task (goes to Waiting On separately)
     *
     * Transactional: if task creation fails, commitment is rolled back.
     * Idempotent: if commitment hash already exists, returns existing commitment (no task created).
     *
     * @param text - Commitment description
     * @param personSlug - Person slug (e.g. 'john-smith')
     * @param personName - Person display name (e.g. 'John Smith')
     * @param direction - 'i_owe_them' or 'they_owe_me'
     * @param options - Optional settings
     */
    create(text: string, personSlug: string, personName: string, direction: CommitmentDirection, options?: CreateCommitmentOptions): Promise<CreateCommitmentResult>;
    /**
     * Check if a commitment exists by hash prefix.
     */
    exists(hashPrefix: string): Promise<boolean>;
}
//# sourceMappingURL=commitments.d.ts.map