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
 * Content-normalized dedup hash: sha256(normalized text + personSlug + direction).
 *
 * Must produce the same hash as computeActionItemHash() in person-signals.ts —
 * same algorithm, separate implementation to avoid circular deps.
 *
 * EXPORTED for the hash-invariance gate test (phase-8-followup-8 AC5/C2,
 * pre-mortem R3): the test must call the real function directly to detect
 * regressions where `area` (or other metadata) accidentally leaks into the
 * hash inputs. Production code paths still go through sync()/create().
 */
export declare function computeCommitmentHash(text: string, personSlug: string, direction: CommitmentDirection): string;
/**
 * Minimal counterparty-bearing shape used by Rule 4's set-overlap math.
 *
 * Phase 10 will extend the canonical Commitment with a `stakeholders[]`
 * field; until that lands, R4 reads `personSlug` directly. This type
 * captures BOTH shapes so a single helper serves the dry-run window.
 */
export type CommitmentLike = {
    /** v1 shape: single counterparty slug. */
    personSlug?: string;
    /**
     * v2 shape (Phase 10 10a): stakeholders with role distinction.
     * When present, this is the authoritative counterparty source —
     * `personSlug` is ignored (it may carry the owner slug under the
     * "owner-as-personSlug" pattern that Phase 10 migration repairs).
     */
    stakeholders?: ReadonlyArray<{
        slug: string;
        role?: string;
    }>;
};
/**
 * Extract the set of counterparty slugs to use for Rule 4 set-overlap.
 *
 * Read order (AC0a dual-shape):
 *  1. `stakeholders[]` if present → all non-self slugs (M2 fix)
 *  2. otherwise → singleton `[personSlug]` (v1 fallback)
 *  3. neither present → empty set (overlap is always 0)
 *
 * Returns a deduplicated array (Set semantics, array shape for ergonomic
 * consumption). Slug order is preserved from the source for stable
 * test snapshots.
 */
export declare function getCommitmentCounterpartySlugs(c: CommitmentLike): string[];
/**
 * Compute set-overlap count between a commitment's counterparties and a
 * meeting's attendees. Used by Phase 8 Rule 4 (daily-winddown SKILL.md
 * §"Rule 4 — Intent → already-tracked open commitment").
 *
 * Returns the count of common slugs after the AC0a dual-shape read.
 * A return of 0 means R4's counterparty gate does NOT fire (no overlap,
 * candidate is NOT a collapse target).
 *
 * Example:
 *   commitment.stakeholders = [{slug:'dave'}, {slug:'lindsay', role:'mentioned'}]
 *   meeting.attendees      = ['dave', 'jamie']
 *   → overlap = 1 (dave)
 *
 * Example (self-exclusion per M2):
 *   commitment.stakeholders = [{slug:'john-koht', role:'self'}]
 *   meeting.attendees      = ['john-koht', 'lindsay']
 *   → overlap = 0 (self excluded from numerator)
 *
 * Example (v1 fallback):
 *   commitment.personSlug = 'dave'   (no stakeholders[] field)
 *   meeting.attendees    = ['dave']
 *   → overlap = 1
 */
export declare function computeCounterpartyOverlap(commitment: CommitmentLike, meetingAttendeeSlugs: ReadonlyArray<string>): number;
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
/**
 * Function to mark linked tasks complete given a commitment id prefix.
 * Returns the list of tasks that were marked complete (empty if none found).
 * Injected by factory to avoid circular dep.
 */
export type CompleteTaskFromCommitmentFn = (commitmentIdPrefix: string) => Promise<{
    id: string;
    text: string;
}[]>;
/**
 * Function returning the subset of commitment-id prefixes that are
 * referenced by an OPEN task via `@from(commitment:<prefix>)`. Used by
 * save() to refuse pruning commitments that still have live task
 * references. Completed tasks with stale references are prune-OK and
 * intentionally not counted here.
 *
 * Batched signature (FU3): one call per save() reads task files once,
 * regardless of how many prune-candidates exist. Replaces the earlier
 * per-prefix `HasOpenTaskReferenceFn` so a sync() processing K
 * candidates doesn't multiply the file-read cost.
 *
 * Injected by factory to avoid circular dep.
 */
export type HasOpenTaskReferencesFn = (commitmentIdPrefixes: string[]) => Promise<Set<string>>;
export declare class CommitmentsService {
    private readonly storage;
    private readonly filePath;
    private createTaskFn?;
    private completeTaskFromCommitmentFn?;
    private hasOpenTaskReferencesFn?;
    constructor(storage: StorageAdapter, workspaceRoot: string);
    /**
     * Set the task creation function. Called by factory after TaskService is created.
     * Avoids circular dependency.
     */
    setCreateTaskFn(fn: CreateTaskFn): void;
    /**
     * Set the back-propagation function that marks linked tasks complete
     * when a commitment is resolved. Called by factory after TaskService
     * is created. Without this injection, resolve() still works but the
     * linked tasks in week.md / tasks.md remain unchecked — the orphan
     * class that motivated F1.
     */
    setCompleteTaskFromCommitmentFn(fn: CompleteTaskFromCommitmentFn): void;
    /**
     * Set the batched open-task-reference checker that save() consults
     * before auto-pruning resolved commitments. Without this injection,
     * save() falls back to pure age-based pruning (current behavior).
     */
    setHasOpenTaskReferencesFn(fn: HasOpenTaskReferencesFn): void;
    private load;
    /**
     * Write commitments to disk, applying pruning first.
     * ⚠️ Pruning uses `resolvedAt`, never `date`. Open items are never pruned.
     *
     * F2: when `hasOpenTaskReferencesFn` is injected, commitments still
     * referenced by an OPEN task in week.md / tasks.md are NOT pruned,
     * preventing the dangling-`@from(commitment:xxx)` orphan class. Tasks
     * already marked complete (with stale refs) are prune-OK.
     *
     * FU2: a commitment older than `PRUNE_HARD_CEILING_DAYS` is pruned
     * regardless of task references. Prevents unbounded commitments.json
     * growth from sticky-open tasks that hold otherwise-stale commitments
     * alive forever.
     *
     * FU3: prefix lookup runs ONCE per save() via the batched injection
     * signature, not once per prune-candidate.
     */
    private save;
    /**
     * Run `fn` while holding the exclusive file lock on commitments.json.
     *
     * Phase 10 plan §10a-pre + pre-mortem F5 mitigation. Use this to wrap any
     * read-modify-write that must be atomic across processes — e.g. the
     * Phase 10 cross-meeting dedup pass:
     *
     *   await commitments.withLock(async () => {
     *     const open = await commitments.listOpen();
     *     const next = applyDedupDecisions(open, candidates);
     *     await commitments.sync(next);
     *   });
     *
     * Properties:
     *  - **Cross-process safe** via `proper-lockfile` (uses a sidecar
     *    `.lock` directory; mkdir is atomic on POSIX + Windows).
     *  - **Stale-lock TTL** = 30s; the holder heartbeat refreshes the lock
     *    before that window, so a long-running winddown won't lose the
     *    lock to its own slowness.
     *  - **PID check**: a stale lock whose holder PID is still alive is
     *    NOT stolen — the contender retries until the holder releases.
     *  - **Re-entrant within instance**: nested `withLock` calls or inner
     *    `save()` calls on the SAME `CommitmentsService` instance reuse
     *    the outer lock (tracked via instance-local `holdsLock` flag).
     *    Cross-process / cross-instance contention still flows through
     *    proper-lockfile and the OS-level lock directory.
     *
     * The lock is released even if `fn` throws; the error propagates.
     */
    withLock<T>(fn: () => Promise<T>): Promise<T>;
    /** Instance-local flag: true when the current async task is inside an
     * acquired lock scope. Used to make `withLock`/`save()` re-entrant
     * within the same service instance without deadlocking on a recursive
     * lockfile acquire. */
    private holdsLock;
    /**
     * Internal lock runner shared by `save()` and `withLock()`. If the
     * instance already holds the lock (re-entrant case), runs `fn`
     * directly; otherwise acquires the proper-lockfile lock, runs, and
     * releases.
     */
    private runUnderLock;
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
     * Explicitly purge resolved/dropped commitments older than a configurable threshold.
     *
     * Uses the same `shouldPrune()` logic as `save()`'s auto-prune, but with a
     * caller-supplied threshold (defaults to PRUNE_DAYS = 30).
     *
     * Open/active commitments are never touched regardless of age.
     * Handles missing or empty commitments.json gracefully (returns { purged: 0 }).
     */
    purgeResolved(olderThanDays?: number): Promise<{
        purged: number;
    }>;
    /**
     * Check if a commitment exists by hash prefix.
     */
    exists(hashPrefix: string): Promise<boolean>;
    /**
     * Backfill `area` on commitments missing it.
     *
     * For each commitment where `area` is absent, calls the caller-supplied
     * resolver with the commitment's source filename. If the resolver returns
     * an area slug, the commitment is updated with `area` AND a
     * `areaSetBy: 'backfill'` provenance marker (so `resetBackfilledAreas`
     * can selectively undo).
     *
     * Returns a preview/apply report. When `apply` is false (default), no
     * writes occur — caller can inspect proposed changes safely.
     *
     * Hash invariance: area is metadata only and is NOT part of the dedup
     * hash (see `computeCommitmentHash`). Commitment IDs are preserved.
     */
    backfillArea(resolveArea: (source: string) => Promise<string | null>, options?: {
        apply?: boolean;
    }): Promise<{
        candidates: number;
        matched: number;
        proposals: Array<{
            id: string;
            source: string;
            area: string;
        }>;
        applied: boolean;
    }>;
    /**
     * Reset `area` to undefined for every commitment carrying the
     * `areaSetBy: 'backfill'` provenance marker.
     *
     * Does NOT touch commitments where area was set at creation (Path A
     * meeting approval, Path C `commitments create --area`) or by sync()
     * (Path B extract-time AC1/AC2) — those lack the marker.
     */
    resetBackfilledAreas(): Promise<{
        reset: number;
    }>;
}
//# sourceMappingURL=commitments.d.ts.map