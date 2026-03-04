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
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const COMMITMENTS_FILE = '.arete/commitments.json';
const PRUNE_DAYS = 30;
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/**
 * Content-normalized dedup hash: sha256(normalized text + personSlug + direction).
 *
 * Must produce the same hash as computeActionItemHash() in person-signals.ts —
 * same algorithm, separate implementation to avoid circular deps.
 */
function computeCommitmentHash(text, personSlug, direction) {
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
function shouldPrune(commitment, referenceDate = new Date()) {
    if (commitment.resolvedAt === null)
        return false;
    if (commitment.status !== 'resolved' && commitment.status !== 'dropped')
        return false;
    const resolvedAt = new Date(commitment.resolvedAt);
    if (Number.isNaN(resolvedAt.getTime()))
        return false;
    const diffMs = referenceDate.getTime() - resolvedAt.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays > PRUNE_DAYS;
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
function jaccard(a, b) {
    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = [...setA].filter((w) => setB.has(w)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
}
const JACCARD_THRESHOLD = 0.6;
// ---------------------------------------------------------------------------
// CommitmentsService
// ---------------------------------------------------------------------------
export class CommitmentsService {
    storage;
    filePath;
    constructor(storage, workspaceRoot) {
        this.storage = storage;
        this.filePath = join(workspaceRoot, COMMITMENTS_FILE);
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
     */
    async save(commitments) {
        const pruned = commitments.filter((c) => !shouldPrune(c));
        const file = { commitments: pruned };
        await this.storage.write(this.filePath, JSON.stringify(file, null, 2));
    }
    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------
    /**
     * List open commitments, optionally filtered by direction and/or person slugs.
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
                    status: 'open',
                    resolvedAt: null,
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
}
//# sourceMappingURL=commitments.js.map