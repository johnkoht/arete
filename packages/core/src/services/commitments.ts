/**
 * CommitmentsService — single source of truth for commitment data.
 *
 * Manages `.arete/commitments.json` via StorageAdapter — no direct fs calls.
 *
 * Hash computation mirrors computeActionItemHash() in person-signals.ts but is
 * intentionally kept as a local replica to avoid a service-layer circular dependency.
 * Both use: sha256(normalized text + personSlug + direction).
 */

import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { lock as lockfileLock, type LockOptions } from 'proper-lockfile';
import type { StorageAdapter } from '../storage/adapter.js';
import type {
  Commitment,
  CommitmentsFile,
  CommitmentDirection,
  CommitmentStatus,
} from '../models/index.js';
import type { PersonActionItem } from './person-signals.js';
import type { HealthIndicator } from './person-health.js';
import { jaccardSimilarity } from '../utils/similarity.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMITMENTS_FILE = '.arete/commitments.json';
const PRUNE_DAYS = 30;

/**
 * Hard ceiling — commitments older than this always prune regardless of
 * task references. Prevents sticky-open `[ ]` task lines from holding
 * stale commitments alive indefinitely. See FU2.
 */
const PRUNE_HARD_CEILING_DAYS = 90;

// ---------------------------------------------------------------------------
// Priority scoring
// ---------------------------------------------------------------------------

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

// Action verbs that indicate specific, actionable commitments
const ACTION_VERBS = [
  'send',
  'call',
  'email',
  'schedule',
  'review',
  'follow',
  'share',
  'update',
  'create',
  'prepare',
  'draft',
  'submit',
  'complete',
  'deliver',
  'setup',
  'set up',
  'organize',
  'finalize',
  'confirm',
  'book',
  'provide',
  'respond',
  'reach',
  'discuss',
  'meet',
  'write',
];

/**
 * Compute staleness score (0-100) based on days open.
 * 0 days = 0, 7 days = 50, 14+ days = 100.
 */
function computeStalenessScore(daysOpen: number): number {
  if (daysOpen <= 0) return 0;
  if (daysOpen >= 14) return 100;
  // Linear interpolation: 0→0, 7→50, 14→100
  if (daysOpen <= 7) {
    return Math.round((daysOpen / 7) * 50);
  }
  // 7 < days < 14: interpolate from 50 to 100
  return Math.round(50 + ((daysOpen - 7) / 7) * 50);
}

/**
 * Convert health indicator to score (0-100).
 * active=100, regular=66, cooling=33, dormant=0
 */
function healthIndicatorToScore(indicator: HealthIndicator): number {
  switch (indicator) {
    case 'active':
      return 100;
    case 'regular':
      return 66;
    case 'cooling':
      return 33;
    case 'dormant':
      return 0;
  }
}

/**
 * Compute direction score (0-100).
 * i_owe_them = 100 (higher priority), they_owe_me = 50
 */
function computeDirectionScore(direction: CommitmentDirection): number {
  return direction === 'i_owe_them' ? 100 : 50;
}

/**
 * Compute specificity score (0-100) based on text characteristics.
 * text.length >= 50 chars AND contains action verbs = 100, else 50
 */
function computeSpecificityScore(text: string): number {
  const normalized = text.toLowerCase();
  const hasActionVerb = ACTION_VERBS.some((verb) => normalized.includes(verb));
  const isLongEnough = text.length >= 50;
  return hasActionVerb && isLongEnough ? 100 : 50;
}

/**
 * Convert priority score to level.
 * High: ≥50, Medium: 25-49, Low: <25
 */
function scoreToLevel(score: number): PriorityLevel {
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

/**
 * Compute priority score for a commitment.
 *
 * Formula: priority = (staleness * 30) + (health * 25) + (direction * 25) + (specificity * 20)
 * All component scores are 0-100, so the final score is 0-100.
 *
 * @param input - Commitment attributes needed for scoring
 * @returns Priority score (0-100) and level (high/medium/low)
 */
export function computeCommitmentPriority(input: CommitmentPriorityInput): CommitmentPriorityResult {
  const stalenessScore = computeStalenessScore(input.daysOpen);
  const healthScore = healthIndicatorToScore(input.healthIndicator);
  const directionScore = computeDirectionScore(input.direction);
  const specificityScore = computeSpecificityScore(input.text);

  const score = Math.round(
    stalenessScore * 0.3 + healthScore * 0.25 + directionScore * 0.25 + specificityScore * 0.2
  );

  return {
    score,
    level: scoreToLevel(score),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
// NOTE: The `personSlug` in the hash means the same commitment text creates
// different hashes for "ours" vs "theirs" direction. Cross-person dedup in
// EntityService.refreshPersonMemory() suppresses owner self-reminder copies
// when a bilateral entry already exists under the counterparty's slug.
export function computeCommitmentHash(
  text: string,
  personSlug: string,
  direction: CommitmentDirection,
): string {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
  return createHash('sha256')
    .update(`${normalized}${personSlug}${direction}`)
    .digest('hex');
}

/**
 * Returns true if the commitment should be pruned.
 *
 * ⚠️ CRITICAL: Pruning uses `resolvedAt`, NOT `date`.
 * - Open items (resolvedAt: null) are NEVER pruned.
 * - A commitment from months ago resolved yesterday must NOT be pruned.
 */
function shouldPrune(
  commitment: Commitment,
  referenceDate: Date = new Date(),
  thresholdDays: number = PRUNE_DAYS,
): boolean {
  if (commitment.resolvedAt === null) return false;
  if (commitment.status !== 'resolved' && commitment.status !== 'dropped') return false;

  const resolvedAt = new Date(commitment.resolvedAt);
  if (Number.isNaN(resolvedAt.getTime())) return false;

  const diffMs = referenceDate.getTime() - resolvedAt.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > thresholdDays;
}

// ---------------------------------------------------------------------------
// Jaccard similarity for reconcile()
// ---------------------------------------------------------------------------

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

// jaccardSimilarity imported from ../utils/similarity.js

const JACCARD_THRESHOLD = 0.6;

// ---------------------------------------------------------------------------
// Counterparty overlap (Phase 8 R4 rewrite — phase-10a-pre)
//
// Phase 8 Rule 4 (`/daily-winddown`) gates commitment-collapse on whether the
// fresh capture and the open commitment share counterparties. Pre-Phase 10
// the data model had a single `personSlug` field and the rule reduced to
// slug-equality. Phase 10 introduces `stakeholders[]` with `role` field
// (recipient | sender | mentioned | self); the rule generalizes to
// SET-OVERLAP across non-self stakeholders.
//
// Per Phase 10 plan AC0a (dual-shape read during dry-run window) and
// pre-mortem F5/M2: this helper must
//   1. Read `stakeholders[]` if present (post-10a, v2 shape)
//   2. Fall back to `personSlug` if `stakeholders` is undefined (v1 shape)
//   3. EXCLUDE role='self' stakeholders from overlap candidates (M2 fix —
//      a self-reminder commitment must NOT match a recurring meeting
//      attendee just because the owner is on the attendee list)
//
// The helper is type-permissive (accepts a CommitmentLike shape) so both
// v1 and v2 Commitment values can be passed without union casts. Callers
// pass either a real Commitment or a hand-built object whose shape
// matches; the helper handles both transparently.
// ---------------------------------------------------------------------------

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
  stakeholders?: ReadonlyArray<{ slug: string; role?: string }>;
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
export function getCommitmentCounterpartySlugs(c: CommitmentLike): string[] {
  if (c.stakeholders && c.stakeholders.length > 0) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of c.stakeholders) {
      // M2 mitigation: self-reminders must not bleed into overlap.
      if (s.role === 'self') continue;
      if (!s.slug || seen.has(s.slug)) continue;
      seen.add(s.slug);
      out.push(s.slug);
    }
    return out;
  }
  if (c.personSlug) return [c.personSlug];
  return [];
}

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
export function computeCounterpartyOverlap(
  commitment: CommitmentLike,
  meetingAttendeeSlugs: ReadonlyArray<string>,
): number {
  const slugs = getCommitmentCounterpartySlugs(commitment);
  if (slugs.length === 0 || meetingAttendeeSlugs.length === 0) return 0;
  const attendeeSet = new Set(meetingAttendeeSlugs);
  let overlap = 0;
  for (const slug of slugs) {
    if (attendeeSet.has(slug)) overlap += 1;
  }
  return overlap;
}

// ---------------------------------------------------------------------------
// Types for create()
// ---------------------------------------------------------------------------

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
export type CreateTaskFn = (
  text: string,
  metadata: {
    area?: string;
    person?: string;
    from?: { type: 'commitment' | 'meeting'; id: string };
  },
) => Promise<{ id: string; text: string }>;

/**
 * Function to mark linked tasks complete given a commitment id prefix.
 * Returns the list of tasks that were marked complete (empty if none found).
 * Injected by factory to avoid circular dep.
 */
export type CompleteTaskFromCommitmentFn = (
  commitmentIdPrefix: string,
) => Promise<{ id: string; text: string }[]>;

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
export type HasOpenTaskReferencesFn = (
  commitmentIdPrefixes: string[],
) => Promise<Set<string>>;

// ---------------------------------------------------------------------------
// File-locking helpers (phase-10a-pre F5 mitigation, R12)
// ---------------------------------------------------------------------------

/**
 * Lock acquisition timeout — proper-lockfile considers a lock STALE after
 * this many ms WITHOUT a heartbeat refresh from the holder. PID check runs
 * before steal so a live holder's lock is never harvested out from under
 * them. 30s aligns with the Phase 10 plan §"R12 mitigation" specification.
 */
const LOCK_STALE_MS = 30_000;

/**
 * Retry budget for lock acquisition. The lockfile contention pattern in
 * extract/winddown is brief (sub-second saves); a few short retries cover
 * the common case without making concurrent operations hang.
 */
const LOCK_RETRIES = {
  retries: 10,
  factor: 1.5,
  minTimeout: 50,
  maxTimeout: 1_000,
  randomize: true,
};

const LOCK_OPTIONS: LockOptions = {
  stale: LOCK_STALE_MS,
  // Skip realpath to support test workspaces with symlinked tmp dirs.
  realpath: false,
  // Don't crash the process if the lock is compromised mid-flight; surface
  // as the operation's own error.
  onCompromised: (err: Error) => {
    throw new Error(`commitments.json lock was compromised: ${err.message}`);
  },
  retries: LOCK_RETRIES,
};

/**
 * Ensure a file exists at `path` so `proper-lockfile` has a target to lock.
 *
 * `proper-lockfile.lock()` requires the target file to exist (it derives
 * `<path>.lock` as the sentinel directory and asserts the parent file is
 * present). For a fresh workspace where commitments.json hasn't been
 * written yet, we touch an empty {"commitments":[]} file first.
 *
 * Returns `true` if the lock target exists / was bootstrapped (lock is
 * usable). Returns `false` if the parent directory can't be created
 * (e.g. unit tests with a mock storage backed by a virtual path like
 * `/workspace/...` — we don't have permission to create `/workspace`
 * on a real fs). In that case the caller skips the lock and falls back
 * to the prior in-process behavior; this is safe because mock-backed
 * tests run in a single process where the JS event loop already
 * serializes operations.
 */
async function ensureLockTarget(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    // File doesn't exist — try to bootstrap it.
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, '{"commitments":[]}\n', 'utf8');
      return true;
    } catch {
      // Can't bootstrap (e.g., virtual/mock path). Lock is unavailable;
      // caller falls back to no-op locking.
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// CommitmentsService
// ---------------------------------------------------------------------------

export class CommitmentsService {
  private readonly filePath: string;
  private createTaskFn?: CreateTaskFn;
  private completeTaskFromCommitmentFn?: CompleteTaskFromCommitmentFn;
  private hasOpenTaskReferencesFn?: HasOpenTaskReferencesFn;

  constructor(
    private readonly storage: StorageAdapter,
    workspaceRoot: string,
  ) {
    this.filePath = join(workspaceRoot, COMMITMENTS_FILE);
  }

  /**
   * Set the task creation function. Called by factory after TaskService is created.
   * Avoids circular dependency.
   */
  setCreateTaskFn(fn: CreateTaskFn): void {
    this.createTaskFn = fn;
  }

  /**
   * Set the back-propagation function that marks linked tasks complete
   * when a commitment is resolved. Called by factory after TaskService
   * is created. Without this injection, resolve() still works but the
   * linked tasks in week.md / tasks.md remain unchecked — the orphan
   * class that motivated F1.
   */
  setCompleteTaskFromCommitmentFn(fn: CompleteTaskFromCommitmentFn): void {
    this.completeTaskFromCommitmentFn = fn;
  }

  /**
   * Set the batched open-task-reference checker that save() consults
   * before auto-pruning resolved commitments. Without this injection,
   * save() falls back to pure age-based pruning (current behavior).
   */
  setHasOpenTaskReferencesFn(fn: HasOpenTaskReferencesFn): void {
    this.hasOpenTaskReferencesFn = fn;
  }

  // -------------------------------------------------------------------------
  // Private I/O
  // -------------------------------------------------------------------------

  private async load(): Promise<Commitment[]> {
    const content = await this.storage.read(this.filePath);
    if (content === null) return [];
    try {
      const parsed = JSON.parse(content) as CommitmentsFile;
      return Array.isArray(parsed.commitments) ? parsed.commitments : [];
    } catch {
      return [];
    }
  }

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
  private async save(commitments: Commitment[]): Promise<void> {
    // File lock (phase-10a-pre, F5/R12 mitigation): serialize concurrent
    // writes so two extracts running in parallel can't last-writer-wins
    // each other. Held only for the duration of THIS save's pruning +
    // write — sub-second under load.
    //
    // Re-entrant: when invoked from inside a `withLock(fn)` callback,
    // `holdsLock` is true and save() skips its own lock acquisition (the
    // outer scope already holds it). This lets callers compose atomic
    // read-modify-write without deadlocking on their own save().
    await this.runUnderLock(async () => {
      const ageCandidates = commitments.filter((c) => shouldPrune(c));
      let prunable: Set<string>;
      if (this.hasOpenTaskReferencesFn && ageCandidates.length > 0) {
        // Hard-ceiling override: anything older than the ceiling always
        // prunes regardless of task references.
        const now = new Date();
        const ceilingForced = new Set(
          ageCandidates
            .filter((c) => shouldPrune(c, now, PRUNE_HARD_CEILING_DAYS))
            .map((c) => c.id),
        );
        const checkable = ageCandidates.filter((c) => !ceilingForced.has(c.id));
        const checkPrefixes = checkable.map((c) => c.id.slice(0, 8));
        const referencedPrefixes = checkPrefixes.length > 0
          ? await this.hasOpenTaskReferencesFn(checkPrefixes)
          : new Set<string>();
        prunable = new Set([
          ...ceilingForced,
          ...checkable
            .filter((c) => !referencedPrefixes.has(c.id.slice(0, 8)))
            .map((c) => c.id),
        ]);
      } else {
        prunable = new Set(ageCandidates.map((c) => c.id));
      }
      const pruned = commitments.filter((c) => !prunable.has(c.id));
      const file: CommitmentsFile = { commitments: pruned };
      await this.storage.write(this.filePath, JSON.stringify(file, null, 2));
    });
  }

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
  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    return this.runUnderLock(fn);
  }

  /** Instance-local flag: true when the current async task is inside an
   * acquired lock scope. Used to make `withLock`/`save()` re-entrant
   * within the same service instance without deadlocking on a recursive
   * lockfile acquire. */
  private holdsLock = false;

  /**
   * Internal lock runner shared by `save()` and `withLock()`. If the
   * instance already holds the lock (re-entrant case), runs `fn`
   * directly; otherwise acquires the proper-lockfile lock, runs, and
   * releases.
   */
  private async runUnderLock<T>(fn: () => Promise<T>): Promise<T> {
    if (this.holdsLock) {
      // Already inside an outer lock scope on this instance — skip
      // re-acquisition to avoid self-deadlock.
      return fn();
    }
    const lockable = await ensureLockTarget(this.filePath);
    if (!lockable) {
      // Mock/virtual path that can't be bootstrapped on disk. Skip the
      // lock and run fn directly — the test harness's mock storage
      // adapter already runs in-process where JS event-loop serialization
      // suffices.
      this.holdsLock = true;
      try {
        return await fn();
      } finally {
        this.holdsLock = false;
      }
    }
    const release = await lockfileLock(this.filePath, LOCK_OPTIONS);
    this.holdsLock = true;
    try {
      return await fn();
    } finally {
      this.holdsLock = false;
      try {
        await release();
      } catch {
        // Releasing a compromised/stolen lock surfaces here. Don't shadow
        // the operation's own error — swallow the release miss and trust
        // proper-lockfile's stale-lock TTL to recover.
      }
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * List open commitments, optionally filtered by direction, person slugs, and/or area.
   */
  async listOpen(opts?: {
    direction?: CommitmentDirection;
    personSlugs?: string[];
    area?: string;
  }): Promise<Commitment[]> {
    const all = await this.load();
    return all.filter((c) => {
      if (c.status !== 'open') return false;
      if (opts?.direction && c.direction !== opts.direction) return false;
      if (opts?.personSlugs && opts.personSlugs.length > 0) {
        if (!opts.personSlugs.includes(c.personSlug)) return false;
      }
      if (opts?.area && c.area !== opts.area) return false;
      return true;
    });
  }

  /**
   * Convenience: open commitments for a single person.
   * Delegates to listOpen().
   */
  async listForPerson(personSlug: string): Promise<Commitment[]> {
    return this.listOpen({ personSlugs: [personSlug] });
  }

  /**
   * Mark a commitment as resolved or dropped.
   *
   * Accepts an 8-char prefix OR a full 64-char hash.
   * Errors if 0 matches; errors if 2+ matches (ambiguous prefix).
   */
  async resolve(
    id: string,
    status: Extract<CommitmentStatus, 'resolved' | 'dropped'> = 'resolved',
  ): Promise<Commitment> {
    const all = await this.load();
    const matches = all.filter((c) => c.id === id || c.id.startsWith(id));

    if (matches.length === 0) {
      throw new Error(`No commitment found matching id prefix "${id}"`);
    }
    if (matches.length > 1) {
      const ids = matches.map((c) => c.id.slice(0, 8)).join(', ');
      throw new Error(
        `Ambiguous prefix "${id}" matches ${matches.length} commitments: ${ids}`,
      );
    }

    const target = matches[0];
    const resolvedAt = new Date().toISOString();
    const updated: Commitment = { ...target, status, resolvedAt };

    const next = all.map((c) => (c.id === target.id ? updated : c));
    await this.save(next);

    // F1: back-propagate to linked task(s) in week.md / tasks.md so
    // resolution shows up on the user's working surface, not just in
    // commitments.json. Silent on failure — task may have been
    // hand-completed already, or the workspace may not have a task
    // linked to this commitment. The commitment write above is the
    // source of truth either way.
    if (this.completeTaskFromCommitmentFn) {
      try {
        await this.completeTaskFromCommitmentFn(target.id.slice(0, 8));
      } catch {
        // Silent — back-prop is best-effort, mirrors tasks.ts:507-517.
      }
    }

    return updated;
  }

  /**
   * Batch resolve a list of ids using the same prefix matching as resolve().
   * Returns all resolved commitments.
   */
  async bulkResolve(
    ids: string[],
    status: Extract<CommitmentStatus, 'resolved' | 'dropped'> = 'resolved',
  ): Promise<Commitment[]> {
    const results: Commitment[] = [];
    for (const id of ids) {
      const resolved = await this.resolve(id, status);
      results.push(resolved);
    }
    return results;
  }

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
  async sync(
    freshItems: Map<string, PersonActionItem[]>,
    nameMap?: Map<string, string>,
  ): Promise<void> {
    const all = await this.load();
    const existingById = new Map<string, Commitment>(all.map((c) => [c.id, c]));

    const toAdd: Commitment[] = [];

    for (const [personSlug, items] of freshItems) {
      for (const item of items) {
        // Compute commitment hash (mirrors computeActionItemHash)
        const hash = computeCommitmentHash(item.text, personSlug, item.direction);

        // Skip if we've already seen this hash (preserve existing status)
        if (existingById.has(hash)) continue;

        const commitment: Commitment = {
          id: hash,
          text: item.text,
          direction: item.direction,
          personSlug,
          personName: nameMap?.get(personSlug) ?? personSlug,
          source: item.source,
          date: item.date,
          createdAt: new Date().toISOString(),
          status: 'open',
          resolvedAt: null,
          // Copy goalSlug if present on the action item
          ...(item.goalSlug ? { goalSlug: item.goalSlug } : {}),
          // Copy area if present on the action item (metadata only — NOT part of dedup hash)
          ...(item.area ? { area: item.area } : {}),
        };
        toAdd.push(commitment);
        existingById.set(hash, commitment);
      }
    }

    if (toAdd.length === 0) {
      // No new items — still write to apply pruning
      await this.save(all);
      return;
    }

    await this.save([...all, ...toAdd]);
  }

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
  async reconcile(
    completedItems: { text: string; source: string }[],
  ): Promise<
    {
      commitment: Commitment;
      completedItem: { text: string; source: string };
      confidence: number;
    }[]
  > {
    if (completedItems.length === 0) return [];

    const open = await this.listOpen();
    if (open.length === 0) return [];

    const results: {
      commitment: Commitment;
      completedItem: { text: string; source: string };
      confidence: number;
    }[] = [];

    for (const completedItem of completedItems) {
      const completedWords = normalize(completedItem.text);

      for (const commitment of open) {
        const commitmentWords = normalize(commitment.text);
        const confidence = jaccardSimilarity(completedWords, commitmentWords);

        if (confidence >= JACCARD_THRESHOLD) {
          results.push({ commitment, completedItem, confidence });
        }
      }
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);
    return results;
  }

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
  async create(
    text: string,
    personSlug: string,
    personName: string,
    direction: CommitmentDirection,
    options?: CreateCommitmentOptions,
  ): Promise<CreateCommitmentResult> {
    // Compute hash for dedup
    const hash = computeCommitmentHash(text, personSlug, direction);

    // Check for existing commitment (idempotent)
    const all = await this.load();
    const existing = all.find((c) => c.id === hash);
    if (existing) {
      // Return existing commitment, no task created (duplicate sync)
      return { commitment: existing };
    }

    // Build commitment object
    const dateStr = options?.date ? options.date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const commitment: Commitment = {
      id: hash,
      text,
      direction,
      personSlug,
      personName,
      source: options?.source ?? 'manual',
      date: dateStr,
      createdAt: new Date().toISOString(),
      status: 'open',
      resolvedAt: null,
      ...(options?.goalSlug ? { goalSlug: options.goalSlug } : {}),
      ...(options?.area ? { area: options.area } : {}),
    };

    // Save commitment first
    await this.save([...all, commitment]);

    // Determine if task should be created
    // Default: true for i_owe_them, false for they_owe_me
    const shouldCreateTask = options?.createTask ?? (direction === 'i_owe_them');

    if (!shouldCreateTask || !this.createTaskFn) {
      return { commitment };
    }

    // Try to create linked task
    try {
      const taskResult = await this.createTaskFn(text, {
        area: options?.area,
        person: personSlug,
        from: { type: 'commitment', id: hash.slice(0, 8) },
      });

      return {
        commitment,
        task: {
          id: taskResult.id,
          text: taskResult.text,
          destination: 'inbox',
        },
      };
    } catch (error) {
      // Rollback: remove the commitment we just created
      const updated = all.filter((c) => c.id !== hash);
      await this.save(updated);
      throw error;
    }
  }

  /**
   * Explicitly purge resolved/dropped commitments older than a configurable threshold.
   *
   * Uses the same `shouldPrune()` logic as `save()`'s auto-prune, but with a
   * caller-supplied threshold (defaults to PRUNE_DAYS = 30).
   *
   * Open/active commitments are never touched regardless of age.
   * Handles missing or empty commitments.json gracefully (returns { purged: 0 }).
   */
  async purgeResolved(olderThanDays: number = PRUNE_DAYS): Promise<{ purged: number }> {
    const all = await this.load();
    if (all.length === 0) return { purged: 0 };

    const now = new Date();
    const kept = all.filter((c) => !shouldPrune(c, now, olderThanDays));
    const purged = all.length - kept.length;

    // save() applies its own auto-prune (PRUNE_DAYS), which is fine —
    // anything we already filtered out won't be there to prune again.
    await this.save(kept);
    return { purged };
  }

  /**
   * Check if a commitment exists by hash prefix.
   */
  async exists(hashPrefix: string): Promise<boolean> {
    const all = await this.load();
    return all.some((c) => c.id === hashPrefix || c.id.startsWith(hashPrefix));
  }

  // -------------------------------------------------------------------------
  // Backfill (phase-8-followup-8 AC3)
  // -------------------------------------------------------------------------

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
  async backfillArea(
    resolveArea: (source: string) => Promise<string | null>,
    options: { apply?: boolean } = {},
  ): Promise<{
    candidates: number;
    matched: number;
    proposals: Array<{ id: string; source: string; area: string }>;
    applied: boolean;
  }> {
    const all = await this.load();
    const candidates = all.filter((c) => !c.area);

    const proposals: Array<{ id: string; source: string; area: string }> = [];
    const updatedById = new Map<string, Commitment>();
    for (const c of candidates) {
      if (!c.source || c.source === 'manual') continue;
      const area = await resolveArea(c.source);
      if (!area) continue;
      proposals.push({ id: c.id, source: c.source, area });
      updatedById.set(c.id, { ...c, area, areaSetBy: 'backfill' });
    }

    if (options.apply && updatedById.size > 0) {
      const next = all.map((c) => updatedById.get(c.id) ?? c);
      await this.save(next);
    }

    return {
      candidates: candidates.length,
      matched: proposals.length,
      proposals,
      applied: Boolean(options.apply && updatedById.size > 0),
    };
  }

  /**
   * Reset `area` to undefined for every commitment carrying the
   * `areaSetBy: 'backfill'` provenance marker.
   *
   * Does NOT touch commitments where area was set at creation (Path A
   * meeting approval, Path C `commitments create --area`) or by sync()
   * (Path B extract-time AC1/AC2) — those lack the marker.
   */
  async resetBackfilledAreas(): Promise<{ reset: number }> {
    const all = await this.load();
    let reset = 0;
    const next = all.map((c) => {
      if (c.areaSetBy === 'backfill') {
        reset += 1;
        const { area: _area, areaSetBy: _by, ...rest } = c;
        return rest as Commitment;
      }
      return c;
    });
    if (reset > 0) await this.save(next);
    return { reset };
  }
}
