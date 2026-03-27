/**
 * CommitmentsService — single source of truth for commitment data.
 *
 * Manages `.arete/commitments.json` via StorageAdapter — no direct fs calls.
 *
 * Hash computation mirrors computeActionItemHash() in person-signals.ts but is
 * intentionally kept as a local replica to avoid a service-layer circular dependency.
 * Both use: sha256(normalized text + personSlug + direction).
 */

import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { StorageAdapter } from '../storage/adapter.js';
import type {
  Commitment,
  CommitmentsFile,
  CommitmentDirection,
  CommitmentStatus,
} from '../models/index.js';
import type { PersonActionItem } from './person-signals.js';
import type { HealthIndicator } from './person-health.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMITMENTS_FILE = '.arete/commitments.json';
const PRUNE_DAYS = 30;

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
 */
function computeCommitmentHash(
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
function shouldPrune(commitment: Commitment, referenceDate: Date = new Date()): boolean {
  if (commitment.resolvedAt === null) return false;
  if (commitment.status !== 'resolved' && commitment.status !== 'dropped') return false;

  const resolvedAt = new Date(commitment.resolvedAt);
  if (Number.isNaN(resolvedAt.getTime())) return false;

  const diffMs = referenceDate.getTime() - resolvedAt.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > PRUNE_DAYS;
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

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

const JACCARD_THRESHOLD = 0.6;

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

// ---------------------------------------------------------------------------
// CommitmentsService
// ---------------------------------------------------------------------------

export class CommitmentsService {
  private readonly filePath: string;
  private createTaskFn?: CreateTaskFn;

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
   */
  private async save(commitments: Commitment[]): Promise<void> {
    const pruned = commitments.filter((c) => !shouldPrune(c));
    const file: CommitmentsFile = { commitments: pruned };
    await this.storage.write(this.filePath, JSON.stringify(file, null, 2));
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
        const confidence = jaccard(completedWords, commitmentWords);

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
   * Check if a commitment exists by hash prefix.
   */
  async exists(hashPrefix: string): Promise<boolean> {
    const all = await this.load();
    return all.some((c) => c.id === hashPrefix || c.id.startsWith(hashPrefix));
  }
}
