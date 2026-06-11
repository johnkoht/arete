/**
 * reconcile-nominate — CHR W2: the mechanical R2 candidate-nomination
 * primitive for the reconcile-engine
 * (dev/work/plans/chef-holistic-reconcile/engine-spec.md § R2).
 *
 * Pure function over a ledger: emits CANDIDATE pairs only. Nomination is
 * NEVER a decision — the R3 judgment pass (agent, in-context) confirms or
 * rejects every candidate. The agent never does mechanical similarity
 * itself; this primitive never makes judgment calls.
 *
 * Reuses (repoints, does NOT replace) the mechanical core of
 * `meeting-reconciliation.ts`: `findDuplicates`, `matchRecentMemory`,
 * `matchCompletedTasks`, `scoreRelevance`, and the shared
 * normalize-then-Jaccard tokenizer. The legacy inline path
 * (`reconcileMeetingBatch`) stays fully intact until CHR W6.
 *
 * Threshold-unity scope (DELIBERATE — review F2): the 0.7 constant below
 * unifies CANDIDATE NOMINATION only. Judgment-band thresholds (Rule 4's
 * concrete ≥0.7 with its 0.5–0.7 Uncertain band; CommitmentsService.
 * reconcile()'s 0.6) are engine-spec parameters and are NOT this constant.
 * The 0.5 floor below exists precisely to FEED Rule 4's Uncertain band:
 * sub-band pairs are surfaced as `uncertain-band` candidates so judgment
 * can route them, never as collapse candidates.
 */
import { normalizeForJaccard, jaccardSimilarity } from '../utils/similarity.js';
import { findDuplicates, matchRecentMemory, matchCompletedTasks, scoreRelevance, } from './meeting-reconciliation.js';
/** Unified candidate-nomination Jaccard threshold (strict `>`, matching
 * `findDuplicates` / `matchRecentMemory` semantics). NOMINATION SCOPE ONLY. */
export const NOMINATION_JACCARD_THRESHOLD = 0.7;
/** Floor of the uncertain band (0.5 ≤ J ≤ 0.7). Pairs in the band are
 * nominated as `uncertain-band` — Uncertain-surface input for Rule 4's
 * fuzzy routing, never collapse candidates. */
export const UNCERTAIN_BAND_FLOOR = 0.5;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function refOf(e) {
    return {
        source_ref: e.source_ref,
        ...(e.item_id ? { item_id: e.item_id } : {}),
        ...(e.item_type ? { item_type: e.item_type } : {}),
        text: e.text,
    };
}
function isExtractionEntry(e) {
    return e.kind === 'extraction' && typeof e.text === 'string' && e.text.length > 0;
}
/** Convert lookback `MeetingExtractionBatch[]` (the W2 loader output —
 * `loadRecentMeetingBatch`, with its processed/approved status filter and
 * strict-=== excludePath guard) into ledger extraction entries so the
 * window-coverage invariant ("nomination sees ≥ what inline saw") holds. */
export function ledgerEntriesFromBatch(batch) {
    const entries = [];
    for (const { meetingPath, extraction } of batch) {
        for (const ai of extraction.actionItems) {
            entries.push({
                kind: 'extraction',
                source: 'meeting',
                source_ref: meetingPath,
                item_type: 'action',
                text: ai.description,
                ...(ai.ownerSlug ? { owner: ai.ownerSlug } : {}),
            });
        }
        for (const d of extraction.decisions) {
            entries.push({ kind: 'extraction', source: 'meeting', source_ref: meetingPath, item_type: 'decision', text: d });
        }
        for (const l of extraction.learnings) {
            entries.push({ kind: 'extraction', source: 'meeting', source_ref: meetingPath, item_type: 'learning', text: l });
        }
    }
    return entries;
}
// ---------------------------------------------------------------------------
// Main entry point — pure function
// ---------------------------------------------------------------------------
/**
 * Nominate reconciliation candidates over a merged ledger.
 *
 * Inputs are data only (no I/O): callers (the CLI command, tests, the
 * engine harness) load the ledger file, the lookback batch, and the
 * reconciliation context themselves.
 *
 * Entry order is significant: first occurrence wins canonical placement
 * in duplicate pairs, so callers MUST pass entries oldest-first (the CLI
 * sorts lookback batch entries by filename date prefix before merging).
 */
export function nominateCandidates(entries, context) {
    const extractionEntries = entries.filter(isExtractionEntry);
    // Flattened-item view for the reused mechanical functions. Parallel
    // arrays: items[i] ↔ extractionEntries[i].
    const items = extractionEntries.map((e) => ({
        original: e.text,
        type: e.item_type ?? 'action',
        meetingPath: e.source_ref,
        text: e.text,
        ...(e.owner ? { owner: e.owner } : {}),
    }));
    const entryByItem = new Map();
    items.forEach((it, i) => entryByItem.set(it, extractionEntries[i]));
    const candidates = [];
    // 1. Duplicate nomination — REUSED findDuplicates (strict > 0.7,
    //    same-type only, different-owners-never).
    const groups = findDuplicates(items, NOMINATION_JACCARD_THRESHOLD);
    const inDuplicatePair = new Set();
    for (const g of groups) {
        const canonicalEntry = entryByItem.get(g.canonical);
        for (const dup of g.duplicates) {
            const dupEntry = entryByItem.get(dup);
            candidates.push({
                kind: 'duplicate',
                canonical: refOf(canonicalEntry),
                duplicate: refOf(dupEntry),
                similarity: jaccardSimilarity(normalizeForJaccard(g.canonical.text), normalizeForJaccard(dup.text)),
            });
            inDuplicatePair.add(pairKey(canonicalEntry, dupEntry));
        }
    }
    // 2. Uncertain-band nomination (0.5 ≤ J ≤ 0.7) — same comparability
    //    rules as findDuplicates (same type, owner guard), feeding Rule 4's
    //    fuzzy routing. Never a collapse candidate.
    let uncertainBandPairs = 0;
    for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
            const a = items[i];
            const b = items[j];
            if (a.type !== b.type)
                continue;
            if (a.owner && b.owner && a.owner !== b.owner)
                continue;
            const ea = extractionEntries[i];
            const eb = extractionEntries[j];
            if (inDuplicatePair.has(pairKey(ea, eb)))
                continue;
            const sim = jaccardSimilarity(normalizeForJaccard(a.text), normalizeForJaccard(b.text));
            if (sim >= UNCERTAIN_BAND_FLOOR && sim <= NOMINATION_JACCARD_THRESHOLD) {
                candidates.push({ kind: 'uncertain-band', a: refOf(ea), b: refOf(eb), similarity: sim });
                uncertainBandPairs++;
            }
        }
    }
    // 3. Claim verification input — continuation_of / supersedes are model
    //    CLAIMS to verify in R3, nominated unconditionally (D3).
    let claims = 0;
    for (const e of extractionEntries) {
        if (e.continuation_of) {
            candidates.push({ kind: 'claimed', claim: 'continuation_of', entry: refOf(e), target: e.continuation_of });
            claims++;
        }
        if (e.supersedes) {
            candidates.push({ kind: 'claimed', claim: 'supersedes', entry: refOf(e), target: e.supersedes });
            claims++;
        }
    }
    // 4. Memory match — REUSED matchRecentMemory (> 0.7, first match wins).
    const memoryMatches = matchRecentMemory(items, context.recentCommittedItems);
    for (const m of memoryMatches) {
        candidates.push({
            kind: 'memory',
            entry: refOf(extractionEntries[m.itemIndex]),
            memorySource: m.source,
            matchedText: m.text,
        });
    }
    // 5. Completed-task match — REUSED matchCompletedTasks. NOTE: its 0.6
    //    threshold is a DELIBERATE judgment-band parameter (engine-spec § 3),
    //    not the nomination constant — do not "unify" it.
    const completedMatches = matchCompletedTasks(items, context.completedTasks);
    for (const m of completedMatches) {
        candidates.push({
            kind: 'completed',
            entry: refOf(extractionEntries[m.itemIndex]),
            completedOn: m.completedOn,
            matchedTask: m.matchedTask,
        });
    }
    // 6. Relevance annotation — REUSED scoreRelevance (sidecar-tier input).
    const relevance = items.map((it, i) => {
        const r = scoreRelevance(it, context);
        return { entry: refOf(extractionEntries[i]), score: r.score, tier: r.tier };
    });
    // Degraded-mode detection (engine-spec § 6): legacy-shaped extraction
    // entries carry no tier field.
    const degraded = extractionEntries.length > 0 && extractionEntries.every((e) => e.tier === undefined);
    return {
        candidates,
        relevance,
        degraded,
        stats: {
            entries: entries.length,
            extractionEntries: extractionEntries.length,
            duplicatePairs: groups.reduce((n, g) => n + g.duplicates.length, 0),
            uncertainBandPairs,
            claims,
            memoryMatches: memoryMatches.length,
            completedMatches: completedMatches.length,
        },
    };
}
function pairKey(a, b) {
    const ka = `${a.source_ref}#${a.item_id ?? a.text}`;
    const kb = `${b.source_ref}#${b.item_id ?? b.text}`;
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}
//# sourceMappingURL=reconcile-nominate.js.map