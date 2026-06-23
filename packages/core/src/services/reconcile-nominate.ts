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
import type { ReconciliationContext } from '../models/entities.js';
import {
  findDuplicates,
  matchRecentMemory,
  matchCompletedTasks,
  scoreRelevance,
} from './meeting-reconciliation.js';

/** Unified candidate-nomination Jaccard threshold (strict `>`, matching
 * `findDuplicates` / `matchRecentMemory` semantics). NOMINATION SCOPE ONLY. */
export const NOMINATION_JACCARD_THRESHOLD = 0.7;

/** Floor of the uncertain band (0.5 ≤ J ≤ 0.7). Pairs in the band are
 * nominated as `uncertain-band` — Uncertain-surface input for Rule 4's
 * fuzzy routing, never collapse candidates. */
export const UNCERTAIN_BAND_FLOOR = 0.5;

// ---------------------------------------------------------------------------
// Ledger types (engine-spec § 1)
// ---------------------------------------------------------------------------

/** One entry of the merged day/week ledger. Extraction entries carry the
 * single-pass fields; gather-loop entries carry the PATTERNS.md loop shape.
 * All fields beyond `kind`/`source_ref`/`text` are optional so
 * legacy-shaped input (degraded-mode contract, engine-spec § 6) parses. */
export type ReconcileLedgerEntry = {
  kind: string;
  source?: string;
  /** Meeting path for extraction entries; channel/thread ref otherwise. */
  source_ref: string;
  item_id?: string;
  item_type?: 'action' | 'decision' | 'learning';
  timestamp?: string;
  text: string;
  /** Owner slug for action items (different owners never co-nominate). */
  owner?: string;
  counterparty?: string;
  tier?: 'blocker' | 'high' | 'normal';
  uncertain?: boolean;
  uncertainty_reason?: string;
  direction?: string;
  continuation_of?: string;
  supersedes?: string;
  status?: string;
  evidence_pointer?: string;
};

export type ReconcileLedger = {
  horizon?: 'day' | 'week';
  window?: { target?: string; lookback_days?: number };
  entries: ReconcileLedgerEntry[];
};

/** Pointer back into the ledger for a nominated entry. */
export type NominationRef = {
  source_ref: string;
  item_id?: string;
  item_type?: string;
  text: string;
};

export type NominationCandidate =
  | {
      kind: 'duplicate';
      /** First occurrence in ledger order (oldest-first input ⇒ oldest). */
      canonical: NominationRef;
      duplicate: NominationRef;
      similarity: number;
    }
  | {
      kind: 'uncertain-band';
      a: NominationRef;
      b: NominationRef;
      similarity: number;
    }
  | {
      kind: 'claimed';
      claim: 'continuation_of' | 'supersedes';
      entry: NominationRef;
      /** The raw model claim (item id or text) — a claim to VERIFY (D3). */
      target: string;
    }
  | {
      kind: 'memory';
      entry: NominationRef;
      memorySource: string;
      matchedText: string;
    }
  | {
      kind: 'completed';
      entry: NominationRef;
      completedOn: string;
      matchedTask: string;
    };

export type NominationResult = {
  candidates: NominationCandidate[];
  /** Relevance annotation per extraction entry (sidecar-tier input). */
  relevance: Array<{
    entry: NominationRef;
    score: number;
    tier: 'high' | 'normal' | 'low';
  }>;
  /** True when extraction entries are legacy-shaped (no tier field) —
   * degraded-mode contract: judgment treats tier as 'normal'. */
  degraded: boolean;
  stats: {
    entries: number;
    extractionEntries: number;
    duplicatePairs: number;
    uncertainBandPairs: number;
    claims: number;
    memoryMatches: number;
    completedMatches: number;
  };
};

// FlattenedItem is internal to meeting-reconciliation; recover it
// structurally so we reuse the functions without widening their exports.
type FlattenedItem = Parameters<typeof findDuplicates>[0][number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function refOf(e: ReconcileLedgerEntry): NominationRef {
  return {
    source_ref: e.source_ref,
    ...(e.item_id ? { item_id: e.item_id } : {}),
    ...(e.item_type ? { item_type: e.item_type } : {}),
    text: e.text,
  };
}

function isExtractionEntry(e: ReconcileLedgerEntry): boolean {
  return e.kind === 'extraction' && typeof e.text === 'string' && e.text.length > 0;
}

/** Convert lookback `MeetingExtractionBatch[]` (the W2 loader output —
 * `loadRecentMeetingBatch`, with its processed/approved status filter and
 * strict-=== excludePath guard) into ledger extraction entries so the
 * window-coverage invariant ("nomination sees ≥ what inline saw") holds. */
export function ledgerEntriesFromBatch(
  batch: Array<{
    meetingPath: string;
    extraction: {
      actionItems: Array<{ description: string; ownerSlug?: string }>;
      decisions: string[];
      learnings: string[];
    };
  }>,
): ReconcileLedgerEntry[] {
  const entries: ReconcileLedgerEntry[] = [];
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
export function nominateCandidates(
  entries: ReconcileLedgerEntry[],
  context: ReconciliationContext,
): NominationResult {
  const extractionEntries = entries.filter(isExtractionEntry);

  // Flattened-item view for the reused mechanical functions. Parallel
  // arrays: items[i] ↔ extractionEntries[i].
  const items: FlattenedItem[] = extractionEntries.map((e) => ({
    original: e.text,
    type: e.item_type ?? 'action',
    meetingPath: e.source_ref,
    text: e.text,
    ...(e.owner ? { owner: e.owner } : {}),
  }));
  const entryByItem = new Map<FlattenedItem, ReconcileLedgerEntry>();
  items.forEach((it, i) => entryByItem.set(it, extractionEntries[i]));

  const candidates: NominationCandidate[] = [];

  // 1. Duplicate nomination — REUSED findDuplicates (strict > 0.7,
  //    same-type only, different-owners-never).
  const groups = findDuplicates(items, NOMINATION_JACCARD_THRESHOLD);
  const inDuplicatePair = new Set<string>();
  for (const g of groups) {
    const canonicalEntry = entryByItem.get(g.canonical)!;
    for (const dup of g.duplicates) {
      const dupEntry = entryByItem.get(dup)!;
      candidates.push({
        kind: 'duplicate',
        canonical: refOf(canonicalEntry),
        duplicate: refOf(dupEntry),
        similarity: jaccardSimilarity(
          normalizeForJaccard(g.canonical.text),
          normalizeForJaccard(dup.text),
        ),
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
      if (a.type !== b.type) continue;
      if (a.owner && b.owner && a.owner !== b.owner) continue;
      const ea = extractionEntries[i];
      const eb = extractionEntries[j];
      if (inDuplicatePair.has(pairKey(ea, eb))) continue;
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
  const degraded =
    extractionEntries.length > 0 && extractionEntries.every((e) => e.tier === undefined);

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

function pairKey(a: ReconcileLedgerEntry, b: ReconcileLedgerEntry): string {
  const ka = `${a.source_ref}#${a.item_id ?? a.text}`;
  const kb = `${b.source_ref}#${b.item_id ?? b.text}`;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}
