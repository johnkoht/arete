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
function computeStalenessScore(daysOpen) {
    if (daysOpen <= 0)
        return 0;
    if (daysOpen >= 14)
        return 100;
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
function healthIndicatorToScore(indicator) {
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
function computeDirectionScore(direction) {
    return direction === 'i_owe_them' ? 100 : 50;
}
/**
 * Compute specificity score (0-100) based on text characteristics.
 * text.length >= 50 chars AND contains action verbs = 100, else 50
 */
function computeSpecificityScore(text) {
    const normalized = text.toLowerCase();
    const hasActionVerb = ACTION_VERBS.some((verb) => normalized.includes(verb));
    const isLongEnough = text.length >= 50;
    return hasActionVerb && isLongEnough ? 100 : 50;
}
/**
 * Convert priority score to level.
 * High: ≥50, Medium: 25-49, Low: <25
 */
function scoreToLevel(score) {
    if (score >= 50)
        return 'high';
    if (score >= 25)
        return 'medium';
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
export function computeCommitmentPriority(input) {
    const stalenessScore = computeStalenessScore(input.daysOpen);
    const healthScore = healthIndicatorToScore(input.healthIndicator);
    const directionScore = computeDirectionScore(input.direction);
    const specificityScore = computeSpecificityScore(input.text);
    const score = Math.round(stalenessScore * 0.3 + healthScore * 0.25 + directionScore * 0.25 + specificityScore * 0.2);
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
export function computeCommitmentHash(text, personSlug, direction) {
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
function shouldPrune(commitment, referenceDate = new Date(), thresholdDays = PRUNE_DAYS) {
    if (commitment.resolvedAt === null)
        return false;
    if (commitment.status !== 'resolved' && commitment.status !== 'dropped')
        return false;
    const resolvedAt = new Date(commitment.resolvedAt);
    if (Number.isNaN(resolvedAt.getTime()))
        return false;
    const diffMs = referenceDate.getTime() - resolvedAt.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays > thresholdDays;
}
// ---------------------------------------------------------------------------
// Jaccard similarity for reconcile()
// ---------------------------------------------------------------------------
function normalize(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, '')
        .split(/\s+/)
        .filter(Boolean);
}
// jaccardSimilarity imported from ../utils/similarity.js
const JACCARD_THRESHOLD = 0.6;
// ---------------------------------------------------------------------------
// CommitmentsService
// ---------------------------------------------------------------------------
export class CommitmentsService {
    storage;
    filePath;
    createTaskFn;
    completeTaskFromCommitmentFn;
    hasOpenTaskReferencesFn;
    constructor(storage, workspaceRoot) {
        this.storage = storage;
        this.filePath = join(workspaceRoot, COMMITMENTS_FILE);
    }
    /**
     * Set the task creation function. Called by factory after TaskService is created.
     * Avoids circular dependency.
     */
    setCreateTaskFn(fn) {
        this.createTaskFn = fn;
    }
    /**
     * Set the back-propagation function that marks linked tasks complete
     * when a commitment is resolved. Called by factory after TaskService
     * is created. Without this injection, resolve() still works but the
     * linked tasks in week.md / tasks.md remain unchecked — the orphan
     * class that motivated F1.
     */
    setCompleteTaskFromCommitmentFn(fn) {
        this.completeTaskFromCommitmentFn = fn;
    }
    /**
     * Set the batched open-task-reference checker that save() consults
     * before auto-pruning resolved commitments. Without this injection,
     * save() falls back to pure age-based pruning (current behavior).
     */
    setHasOpenTaskReferencesFn(fn) {
        this.hasOpenTaskReferencesFn = fn;
    }
    // -------------------------------------------------------------------------
    // Private I/O
    // -------------------------------------------------------------------------
    async load() {
        const content = await this.storage.read(this.filePath);
        if (content === null)
            return [];
        try {
            const parsed = JSON.parse(content);
            return Array.isArray(parsed.commitments) ? parsed.commitments : [];
        }
        catch {
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
    async save(commitments) {
        const ageCandidates = commitments.filter((c) => shouldPrune(c));
        let prunable;
        if (this.hasOpenTaskReferencesFn && ageCandidates.length > 0) {
            // Hard-ceiling override: anything older than the ceiling always
            // prunes regardless of task references.
            const now = new Date();
            const ceilingForced = new Set(ageCandidates
                .filter((c) => shouldPrune(c, now, PRUNE_HARD_CEILING_DAYS))
                .map((c) => c.id));
            const checkable = ageCandidates.filter((c) => !ceilingForced.has(c.id));
            const checkPrefixes = checkable.map((c) => c.id.slice(0, 8));
            const referencedPrefixes = checkPrefixes.length > 0
                ? await this.hasOpenTaskReferencesFn(checkPrefixes)
                : new Set();
            prunable = new Set([
                ...ceilingForced,
                ...checkable
                    .filter((c) => !referencedPrefixes.has(c.id.slice(0, 8)))
                    .map((c) => c.id),
            ]);
        }
        else {
            prunable = new Set(ageCandidates.map((c) => c.id));
        }
        const pruned = commitments.filter((c) => !prunable.has(c.id));
        const file = { commitments: pruned };
        await this.storage.write(this.filePath, JSON.stringify(file, null, 2));
    }
    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------
    /**
     * List open commitments, optionally filtered by direction, person slugs, and/or area.
     */
    async listOpen(opts) {
        const all = await this.load();
        return all.filter((c) => {
            if (c.status !== 'open')
                return false;
            if (opts?.direction && c.direction !== opts.direction)
                return false;
            if (opts?.personSlugs && opts.personSlugs.length > 0) {
                if (!opts.personSlugs.includes(c.personSlug))
                    return false;
            }
            if (opts?.area && c.area !== opts.area)
                return false;
            return true;
        });
    }
    /**
     * Convenience: open commitments for a single person.
     * Delegates to listOpen().
     */
    async listForPerson(personSlug) {
        return this.listOpen({ personSlugs: [personSlug] });
    }
    /**
     * Mark a commitment as resolved or dropped.
     *
     * Accepts an 8-char prefix OR a full 64-char hash.
     * Errors if 0 matches; errors if 2+ matches (ambiguous prefix).
     */
    async resolve(id, status = 'resolved') {
        const all = await this.load();
        const matches = all.filter((c) => c.id === id || c.id.startsWith(id));
        if (matches.length === 0) {
            throw new Error(`No commitment found matching id prefix "${id}"`);
        }
        if (matches.length > 1) {
            const ids = matches.map((c) => c.id.slice(0, 8)).join(', ');
            throw new Error(`Ambiguous prefix "${id}" matches ${matches.length} commitments: ${ids}`);
        }
        const target = matches[0];
        const resolvedAt = new Date().toISOString();
        const updated = { ...target, status, resolvedAt };
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
            }
            catch {
                // Silent — back-prop is best-effort, mirrors tasks.ts:507-517.
            }
        }
        return updated;
    }
    /**
     * Batch resolve a list of ids using the same prefix matching as resolve().
     * Returns all resolved commitments.
     */
    async bulkResolve(ids, status = 'resolved') {
        const results = [];
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
    async sync(freshItems, nameMap) {
        const all = await this.load();
        const existingById = new Map(all.map((c) => [c.id, c]));
        const toAdd = [];
        for (const [personSlug, items] of freshItems) {
            for (const item of items) {
                // Compute commitment hash (mirrors computeActionItemHash)
                const hash = computeCommitmentHash(item.text, personSlug, item.direction);
                // Skip if we've already seen this hash (preserve existing status)
                if (existingById.has(hash))
                    continue;
                const commitment = {
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
    async reconcile(completedItems) {
        if (completedItems.length === 0)
            return [];
        const open = await this.listOpen();
        if (open.length === 0)
            return [];
        const results = [];
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
    async create(text, personSlug, personName, direction, options) {
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
        const commitment = {
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
        }
        catch (error) {
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
    async purgeResolved(olderThanDays = PRUNE_DAYS) {
        const all = await this.load();
        if (all.length === 0)
            return { purged: 0 };
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
    async exists(hashPrefix) {
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
    async backfillArea(resolveArea, options = {}) {
        const all = await this.load();
        const candidates = all.filter((c) => !c.area);
        const proposals = [];
        const updatedById = new Map();
        for (const c of candidates) {
            if (!c.source || c.source === 'manual')
                continue;
            const area = await resolveArea(c.source);
            if (!area)
                continue;
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
    async resetBackfilledAreas() {
        const all = await this.load();
        let reset = 0;
        const next = all.map((c) => {
            if (c.areaSetBy === 'backfill') {
                reset += 1;
                const { area: _area, areaSetBy: _by, ...rest } = c;
                return rest;
            }
            return c;
        });
        if (reset > 0)
            await this.save(next);
        return { reset };
    }
}
//# sourceMappingURL=commitments.js.map