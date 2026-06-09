/**
 * Phase 10b-min — Reactive cross-meeting commitment dedup pipeline.
 *
 * Hybrid pre-filter + batched LLM cross-check at extract time. Same-day
 * window only in the initial ship (Q4 deferred to soak per plan v2 third
 * pass). Eng C4: person-slug overlap is the deterministic gate, NOT NER
 * entity extraction.
 *
 * Pipeline (per plan §"Semantic dedup pipeline"):
 *
 *   1. Normalize text + compute v2 hash (delegated to commitments-hash-v2).
 *   2. Text-hash exact match → return immediately as definite SAME.
 *   3. Hybrid pre-filter:
 *        a. Jaccard token similarity ≥ 0.6
 *        b. Person-slug overlap ≥ 1 (extracted from text + stakeholders[])
 *        c. Direction match
 *      Cap at top 5 by Jaccard score.
 *   4. Batched LLM cross-check (fast tier; one prompt for ALL candidate
 *      pairs — uses AIService.callConcurrent OR single-prompt-multi-pair
 *      via callConcurrent of length 1).
 *   5. Apply decisions: SAME → dupe, DIFFERENT → new canonical,
 *      UNCERTAIN → new canonical + "Possibly mergeable" flag.
 *
 * Pure module — no I/O, no filesystem, no service coupling. The LLM call
 * is injected as a function parameter (callConcurrentFn) so tests can mock
 * it deterministically. The caller (meeting-extraction wire-in, Step 2)
 * owns the lock acquisition + commitments.json read.
 *
 * Critical invariants:
 *   - NO production data writes from this module.
 *   - NO LLM calls without the caller-injected function.
 *   - All inputs read-only; outputs are new objects/decisions.
 */

import {
  normalizeCommitmentTextV2,
  computeCommitmentHashV2,
} from './commitments-hash-v2.js';
import type { Commitment, CommitmentDirection } from '../models/index.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The shape of a freshly-extracted staged item passed into the pipeline.
 *
 * The extract flow constructs one of these from an `ActionItem` (or
 * similar) before consulting the pipeline. The pipeline NEVER reads from
 * disk — it only inspects fields on this struct + the candidate list.
 */
export type ExtractedItemForDedup = {
  /** Stable item ID (ai_001 / de_001 / le_001 etc.) used in decisions log. */
  id: string;
  /** Raw text (NOT pre-normalized — pipeline runs normalizer itself). */
  text: string;
  /** Direction relative to workspace owner; pipeline filters on this. */
  direction: CommitmentDirection;
  /**
   * Person slugs explicitly attached to the staged item (owner +
   * counterparty when present). Pipeline unions these with `@<slug>`
   * tokens extracted from `text` to build the person-slug overlap set.
   */
  personSlugs: string[];
  /**
   * Meeting slug for the meeting being extracted. Used purely for log /
   * badge rendering — pipeline logic doesn't filter on it.
   */
  meetingSlug: string;
};

/**
 * A candidate from the existing commitment set (or same-day staged items)
 * that passed the hybrid pre-filter.
 */
export type DedupCandidate = {
  /** Canonical ID of the existing commitment / staged item. */
  id: string;
  /** Canonical text. */
  text: string;
  /** Same direction as the new item (filtered before this point). */
  direction: CommitmentDirection;
  /** Person slugs for overlap measurement. */
  personSlugs: string[];
  /** Meeting slug where this candidate lives (for `↪ canonical in <slug>` badge). */
  meetingSlug: string;
  /** Jaccard similarity of normalized text vs the new item's normalized text. */
  jaccard: number;
};

/**
 * A decision rendered by `findDedupCandidates` when an exact text-hash
 * match exists. Short-circuits the LLM cross-check.
 */
export type ExactMatchDecision = {
  kind: 'exact-match';
  canonical: DedupCandidate;
};

/**
 * The output of `findDedupCandidates`: either a definitive exact match
 * (skip LLM) or a list of fuzzy candidates to send to the LLM.
 */
export type FindCandidatesResult =
  | ExactMatchDecision
  | { kind: 'fuzzy'; candidates: DedupCandidate[] };

/** LLM cross-check decision for a single candidate pair. */
export type LLMPairDecision = {
  /** Candidate ID (matches DedupCandidate.id). */
  candidateId: string;
  /** Pair verdict. */
  decision: 'SAME' | 'DIFFERENT' | 'UNCERTAIN';
  /** Free-form 1-sentence reasoning from the model. */
  reasoning: string;
};

/**
 * Final pipeline decision per AC2 / AC3 / AC4 / AC4a.
 *
 * - `definite-dupe`: text-hash exact match OR LLM SAME on the canonical.
 *   Caller marks the new item as a dupe, surfaces `↪ canonical in <slug>`.
 * - `new-canonical`: no candidates passed, or LLM DIFFERENT on all.
 *   Caller registers the new item as a fresh commitment.
 * - `possibly-mergeable`: LLM returned UNCERTAIN. Caller still registers
 *   as a NEW canonical (per AC4a) but flags for user review in next
 *   winddown.
 */
export type DedupOutcome =
  | {
      kind: 'definite-dupe';
      canonical: DedupCandidate;
      via: 'text-hash' | 'llm-same';
      reasoning?: string;
      jaccard?: number;
    }
  | {
      kind: 'new-canonical';
      candidatesEvaluated: DedupCandidate[];
      llmDecisions?: LLMPairDecision[];
    }
  | {
      kind: 'possibly-mergeable';
      bestCandidate: DedupCandidate;
      llmDecisions: LLMPairDecision[];
      reasoning: string;
    };

/**
 * Function signature for the LLM cross-check primitive. Matches
 * AIService.callConcurrent's surface shape so tests can inject a mock
 * without pulling in the full AIService class.
 *
 * The Step 2 wire-in calls this with a SINGLE prompt (length-1 array)
 * containing the full multi-pair batch — the prompt itself is the
 * batching boundary (one model call returns decisions for all candidate
 * pairs at once). callConcurrent is used for shape consistency with
 * other call sites, not for parallelism.
 */
export type LLMCallConcurrentFn = (
  prompts: { tier: 'fast' | 'standard' | 'frontier'; prompt: string }[],
) => Promise<string[]>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Jaccard floor for fuzzy candidacy (plan §"Hybrid pre-filter"). */
export const DEDUP_JACCARD_THRESHOLD = 0.6;

/** Cap on candidates passed to the LLM (plan: "top 5 by Jaccard score"). */
export const DEDUP_CANDIDATE_CAP = 5;

// ---------------------------------------------------------------------------
// Helpers — token / slug extraction
// ---------------------------------------------------------------------------

/**
 * Tokenize text for Jaccard. Reuses the same shape as
 * `entity.normalizeStanceTokens` (Phase 9 followup-6) — lowercase, strip
 * non-alphanumeric, drop ≤2-char tokens. We don't import the entity
 * version directly because commitment text already runs through the v2
 * normalizer (which strips arrows, slug mentions, intent prefixes) — so
 * we want to tokenize the OUTPUT of the v2 normalizer, not raw text.
 *
 * Exported for test introspection.
 */
export function tokenizeForJaccard(normalizedText: string): Set<string> {
  return new Set(
    normalizedText
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

/**
 * Compute Jaccard similarity between two token sets.
 * Returns 0–1 where 1 is identical. Same formula as
 * `entity.stanceJaccardSimilarity` — reproduced here so the dedup module
 * doesn't introduce a circular import on entity.ts.
 *
 * Exported for test introspection.
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Extract `@<slug>` tokens from raw text.
 *
 * The hash-v2 normalizer strips these on the way to hashing; the dedup
 * pipeline wants them BACK for the person-slug overlap gate. We run a
 * dedicated regex over the raw text rather than re-deriving from a
 * pre-normalized form.
 *
 * Exported for test introspection.
 */
export function extractSlugMentions(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /@([a-z0-9-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const slug = m[1].toLowerCase();
    if (!seen.has(slug)) {
      seen.add(slug);
      out.push(slug);
    }
  }
  return out;
}

/**
 * Build the person-slug set for an item: union of `personSlugs` (from
 * the item's structural metadata) and `@<slug>` mentions parsed from
 * the raw text.
 *
 * Exported for test introspection.
 */
export function buildPersonSlugSet(
  text: string,
  personSlugs: ReadonlyArray<string>,
): Set<string> {
  const set = new Set<string>();
  for (const s of personSlugs) {
    if (s) set.add(s.toLowerCase());
  }
  for (const s of extractSlugMentions(text)) {
    set.add(s);
  }
  return set;
}

// ---------------------------------------------------------------------------
// findDedupCandidates
// ---------------------------------------------------------------------------

/**
 * Stable shape for "existing commitment" inputs. The Step 2 wire-in
 * adapts `Commitment` (from models/entities.ts) into this shape so the
 * pipeline doesn't pull `Commitment`'s full v1/v2 dual shape into its API.
 *
 * Same-day staged items from OTHER meetings adapt into this shape too
 * (the meeting slug carries the cross-meeting attribution).
 */
export type ExistingCommitmentForDedup = {
  id: string;
  text: string;
  direction: CommitmentDirection;
  personSlugs: string[];
  meetingSlug: string;
  /** ISO date (YYYY-MM-DD) — caller pre-filters by date when `sameDay=true`. */
  date: string;
};

/**
 * Find dedup candidates for `extractedItem` against `existingCommitments`.
 *
 * Steps (per plan §"Semantic dedup pipeline"):
 *
 *   1. Compute v2 hash of new item → scan existing for exact match.
 *      If found, return `{ kind: 'exact-match', canonical }` — the LLM
 *      cross-check is skipped (AC2).
 *
 *   2. Otherwise, build candidate set:
 *      - direction match (filter)
 *      - Jaccard ≥ DEDUP_JACCARD_THRESHOLD on normalized text
 *      - person-slug overlap ≥ 1 (intersection of slug sets)
 *      Cap to top DEDUP_CANDIDATE_CAP by Jaccard score (desc).
 *
 *   3. Return `{ kind: 'fuzzy', candidates }` — even if `candidates` is
 *      empty (caller treats empty as "new canonical, no LLM needed").
 *
 * @param extractedItem - New item from current meeting's extraction.
 * @param existingCommitments - Universe to dedup against. Caller is
 *   responsible for same-day filtering and for unioning commitments.json
 *   rows with same-day staged items from OTHER meetings.
 *
 * Note: `sameDay` parameter is documented but not enforced at this layer
 * — the caller pre-filters the input list. The parameter exists for API
 * stability (Q4 will widen to last-7d during soak; this signature won't
 * change when that happens).
 */
export function findDedupCandidates(
  extractedItem: ExtractedItemForDedup,
  existingCommitments: ReadonlyArray<ExistingCommitmentForDedup>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sameDay: boolean = true,
): FindCandidatesResult {
  // ── 1. Exact text-hash match (AC2) ──────────────────────────────────────
  const newHash = computeCommitmentHashV2(
    extractedItem.text,
    extractedItem.direction,
  );
  for (const ex of existingCommitments) {
    if (ex.direction !== extractedItem.direction) continue;
    const exHash = computeCommitmentHashV2(ex.text, ex.direction);
    if (exHash === newHash) {
      return {
        kind: 'exact-match',
        canonical: {
          id: ex.id,
          text: ex.text,
          direction: ex.direction,
          personSlugs: ex.personSlugs,
          meetingSlug: ex.meetingSlug,
          jaccard: 1.0,
        },
      };
    }
  }

  // ── 2. Hybrid pre-filter (AC3 / AC4) ─────────────────────────────────────
  const newNorm = normalizeCommitmentTextV2(extractedItem.text);
  const newTokens = tokenizeForJaccard(newNorm);
  const newSlugs = buildPersonSlugSet(extractedItem.text, extractedItem.personSlugs);

  const candidates: DedupCandidate[] = [];
  for (const ex of existingCommitments) {
    // Direction match (filter)
    if (ex.direction !== extractedItem.direction) continue;

    const exNorm = normalizeCommitmentTextV2(ex.text);
    const exTokens = tokenizeForJaccard(exNorm);
    const j = jaccardSimilarity(newTokens, exTokens);

    if (j < DEDUP_JACCARD_THRESHOLD) continue;

    const exSlugs = buildPersonSlugSet(ex.text, ex.personSlugs);
    // Intersection size — must be ≥1 (eng C4 deterministic gate)
    let overlap = 0;
    for (const s of newSlugs) {
      if (exSlugs.has(s)) {
        overlap += 1;
        break;
      }
    }
    if (overlap < 1) continue;

    candidates.push({
      id: ex.id,
      text: ex.text,
      direction: ex.direction,
      personSlugs: ex.personSlugs,
      meetingSlug: ex.meetingSlug,
      jaccard: j,
    });
  }

  // Cap at top N by Jaccard score (descending).
  candidates.sort((a, b) => b.jaccard - a.jaccard);
  const capped = candidates.slice(0, DEDUP_CANDIDATE_CAP);

  return { kind: 'fuzzy', candidates: capped };
}

// ---------------------------------------------------------------------------
// runLLMCrossCheck
// ---------------------------------------------------------------------------

/**
 * Build the prompt for the batched cross-check.
 *
 * Single prompt for ALL candidate pairs. The model's job: for each
 * numbered pair, return one line in the format:
 *
 *   <N>. <SAME|DIFFERENT|UNCERTAIN> | <one-sentence reasoning>
 *
 * Exported for test introspection (golden-set tests assert prompt
 * stability across LLM upgrades).
 */
export function buildCrossCheckPrompt(
  newItem: ExtractedItemForDedup,
  candidates: ReadonlyArray<DedupCandidate>,
): string {
  const lines: string[] = [];
  lines.push(
    'You are deciding whether commitments refer to the same intended action.',
  );
  lines.push('');
  lines.push(
    'Two commitments are SAME only when:',
  );
  lines.push('  - same actor (same direction relative to the workspace owner)');
  lines.push('  - same recipient/stakeholders (overlapping people)');
  lines.push('  - same artifact (the "what" — deck, plan, follow-up, etc.)');
  lines.push('  - same timing window (or unspecified on both)');
  lines.push('');
  lines.push(
    'Different recipients, different artifacts, or different timing = DIFFERENT.',
  );
  lines.push('When the action is plausible but evidence is ambiguous = UNCERTAIN.');
  lines.push('');
  lines.push(`NEW (from meeting <${newItem.meetingSlug}>): ${newItem.text}`);
  lines.push('');
  lines.push('CANDIDATES:');
  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i];
    lines.push(
      `${i + 1}. (from meeting <${c.meetingSlug}>) ${c.text}`,
    );
  }
  lines.push('');
  lines.push(
    'For each candidate, respond with EXACTLY one line in the format:',
  );
  lines.push('  <N>. <SAME|DIFFERENT|UNCERTAIN> | <one-sentence reasoning>');
  lines.push('');
  lines.push('Respond with only the numbered lines, nothing else.');
  return lines.join('\n');
}

/**
 * Parse the LLM's response into per-candidate decisions.
 *
 * Tolerant parser:
 *   - Skips blank lines, header lines, prose preamble.
 *   - Accepts `<N>. <VERDICT>` OR `<N>) <VERDICT>` OR plain `<N>: <VERDICT>`.
 *   - Verdict matching is case-insensitive (`same` / `Same` / `SAME` accepted).
 *   - Reasoning after `|` is optional; defaults to empty string.
 *   - If a candidate has no parseable line, defaults to UNCERTAIN with
 *     reasoning "no parseable LLM response" — fails safe (the new item
 *     becomes a fresh canonical + gets flagged for review).
 *
 * Exported for test introspection.
 */
export function parseCrossCheckResponse(
  response: string,
  candidates: ReadonlyArray<DedupCandidate>,
): LLMPairDecision[] {
  const decisions: LLMPairDecision[] = [];
  const seen = new Map<number, LLMPairDecision>();

  for (const rawLine of response.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // Match: leading number + delimiter + verdict + optional |-reasoning
    const m = line.match(
      /^(\d+)[.)\]:]\s*(SAME|DIFFERENT|UNCERTAIN)\b\s*(?:[|\-—]\s*(.*))?$/i,
    );
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isNaN(n) || n < 1 || n > candidates.length) continue;
    const verdict = m[2].toUpperCase() as LLMPairDecision['decision'];
    const reasoning = (m[3] ?? '').trim();
    seen.set(n, {
      candidateId: candidates[n - 1].id,
      decision: verdict,
      reasoning,
    });
  }

  for (let i = 0; i < candidates.length; i += 1) {
    const dec = seen.get(i + 1);
    if (dec) {
      decisions.push(dec);
    } else {
      decisions.push({
        candidateId: candidates[i].id,
        decision: 'UNCERTAIN',
        reasoning: 'no parseable LLM response',
      });
    }
  }
  return decisions;
}

/**
 * Run the batched LLM cross-check.
 *
 * Single prompt for all candidate pairs at the `fast` tier (per plan
 * §"LLM cross-check" + eng Q1 — promote to `standard` only if golden-set
 * precision drops below 0.85 per AC3a).
 *
 * - Empty candidate list → returns empty decision list (no LLM call).
 * - LLM throw → returns UNCERTAIN for every candidate (fail-safe; caller
 *   registers as new canonical + flags for review).
 *
 * @param newItem - Freshly extracted item.
 * @param candidates - Output of `findDedupCandidates` (fuzzy branch).
 * @param callConcurrent - LLM injection point; in production wired to
 *   `AIService.callConcurrent`.
 * @param tier - LLM tier; defaults to 'fast' per AC3a / eng Q1.
 */
export async function runLLMCrossCheck(
  newItem: ExtractedItemForDedup,
  candidates: ReadonlyArray<DedupCandidate>,
  callConcurrent: LLMCallConcurrentFn,
  tier: 'fast' | 'standard' | 'frontier' = 'fast',
): Promise<LLMPairDecision[]> {
  if (candidates.length === 0) return [];
  const prompt = buildCrossCheckPrompt(newItem, candidates);
  let response: string;
  try {
    const results = await callConcurrent([{ tier, prompt }]);
    response = results[0] ?? '';
  } catch {
    // Fail-safe: mark all as UNCERTAIN so caller doesn't auto-merge on
    // a network/provider hiccup. Pre-mortem F1 mitigation point — never
    // silently auto-merge on parse failure.
    return candidates.map((c) => ({
      candidateId: c.id,
      decision: 'UNCERTAIN' as const,
      reasoning: 'LLM call failed; defaulted to UNCERTAIN',
    }));
  }
  return parseCrossCheckResponse(response, candidates);
}

// ---------------------------------------------------------------------------
// applyDedupDecisions
// ---------------------------------------------------------------------------

/**
 * Combine `findDedupCandidates` + `runLLMCrossCheck` outputs into a
 * single `DedupOutcome` (per plan §"LLM cross-check" parse table).
 *
 * Precedence (when multiple candidates are evaluated):
 *   - First SAME wins → definite-dupe (caller dedupes to that canonical).
 *   - If no SAME but any UNCERTAIN → possibly-mergeable (with best Jaccard
 *     candidate as the suggested merge target).
 *   - Else → new-canonical (all DIFFERENT, or no candidates at all).
 *
 * @param newItem - The freshly extracted item.
 * @param candidates - Candidates evaluated by the LLM (may be empty).
 * @param decisions - LLM decisions per candidate (may be empty when
 *   candidates is empty).
 */
export function applyDedupDecisions(
  newItem: ExtractedItemForDedup,
  candidates: ReadonlyArray<DedupCandidate>,
  decisions: ReadonlyArray<LLMPairDecision>,
): DedupOutcome {
  // No candidates → straight to new-canonical.
  if (candidates.length === 0) {
    return { kind: 'new-canonical', candidatesEvaluated: [] };
  }

  // Index candidates by ID for fast decision-merge.
  const byId = new Map<string, DedupCandidate>();
  for (const c of candidates) byId.set(c.id, c);

  // Precedence 1: any SAME → definite-dupe at the highest-Jaccard SAME.
  const sames = decisions.filter((d) => d.decision === 'SAME');
  if (sames.length > 0) {
    // Pick the SAME whose candidate has the highest Jaccard score.
    let best: { dec: LLMPairDecision; cand: DedupCandidate } | null = null;
    for (const d of sames) {
      const c = byId.get(d.candidateId);
      if (!c) continue;
      if (!best || c.jaccard > best.cand.jaccard) {
        best = { dec: d, cand: c };
      }
    }
    if (best) {
      return {
        kind: 'definite-dupe',
        canonical: best.cand,
        via: 'llm-same',
        reasoning: best.dec.reasoning,
        jaccard: best.cand.jaccard,
      };
    }
  }

  // Precedence 2: any UNCERTAIN → possibly-mergeable at best Jaccard.
  const uncertains = decisions.filter((d) => d.decision === 'UNCERTAIN');
  if (uncertains.length > 0) {
    let best: { dec: LLMPairDecision; cand: DedupCandidate } | null = null;
    for (const d of uncertains) {
      const c = byId.get(d.candidateId);
      if (!c) continue;
      if (!best || c.jaccard > best.cand.jaccard) {
        best = { dec: d, cand: c };
      }
    }
    if (best) {
      return {
        kind: 'possibly-mergeable',
        bestCandidate: best.cand,
        llmDecisions: [...decisions],
        reasoning: best.dec.reasoning,
      };
    }
  }

  // Precedence 3: all DIFFERENT → new-canonical.
  return {
    kind: 'new-canonical',
    candidatesEvaluated: [...candidates],
    llmDecisions: [...decisions],
  };
}

// ---------------------------------------------------------------------------
// Top-level convenience runner (used by Step 2 wire-in)
// ---------------------------------------------------------------------------

/**
 * Run the full pipeline against `existingCommitments` for a single item.
 *
 * Convenience wrapper around the three primitives above. Returns the
 * final DedupOutcome plus the candidates list (for telemetry / log
 * rendering by the caller).
 *
 * Step 2 wire-in semantics:
 *   - Caller (meeting-extraction) acquires `commitments.withLock(...)`
 *     BEFORE calling this function.
 *   - Caller reads commitments.json + same-day staged items inside the
 *     lock.
 *   - Caller invokes this once per extracted item.
 *   - Caller emits the dedup-decisions.log line + sets the badge in the
 *     staged section after each outcome.
 */
export async function runDedupPipeline(
  extractedItem: ExtractedItemForDedup,
  existingCommitments: ReadonlyArray<ExistingCommitmentForDedup>,
  callConcurrent: LLMCallConcurrentFn,
  options: { tier?: 'fast' | 'standard' | 'frontier'; sameDay?: boolean } = {},
): Promise<{ outcome: DedupOutcome; candidates: DedupCandidate[]; decisions: LLMPairDecision[] }> {
  const sameDay = options.sameDay ?? true;
  const found = findDedupCandidates(extractedItem, existingCommitments, sameDay);

  if (found.kind === 'exact-match') {
    return {
      outcome: {
        kind: 'definite-dupe',
        canonical: found.canonical,
        via: 'text-hash',
        jaccard: 1.0,
      },
      candidates: [found.canonical],
      decisions: [],
    };
  }

  const candidates = found.candidates;
  const tier = options.tier ?? 'fast';
  const decisions = await runLLMCrossCheck(
    extractedItem,
    candidates,
    callConcurrent,
    tier,
  );
  const outcome = applyDedupDecisions(extractedItem, candidates, decisions);
  return { outcome, candidates, decisions };
}

// ---------------------------------------------------------------------------
// Helpers — adapter for Commitment → ExistingCommitmentForDedup
// ---------------------------------------------------------------------------

/**
 * Adapter from the on-disk `Commitment` shape to the pipeline's stable
 * input shape. Hides the v1/v2 dual-shape detail from the pipeline.
 *
 * - personSlugs: prefer `stakeholders[]` when present (v2); else
 *   `[personSlug]` (v1). Self-roles excluded (downstream gate would
 *   otherwise match owner-only against itself).
 * - meetingSlug: prefer first entry of `source_meetings[]` (v2);
 *   else `source` (v1) parsed to a basename.
 *
 * Exported for tests + the Step 2 wire-in to share one adapter.
 */
export function commitmentToDedupInput(c: Commitment): ExistingCommitmentForDedup {
  const personSlugs: string[] = [];
  if (Array.isArray(c.stakeholders) && c.stakeholders.length > 0) {
    for (const sh of c.stakeholders) {
      if (sh.role === 'self') continue;
      if (sh.slug) personSlugs.push(sh.slug.toLowerCase());
    }
  } else if (c.personSlug) {
    personSlugs.push(c.personSlug.toLowerCase());
  }

  let meetingSlug = '';
  if (Array.isArray(c.source_meetings) && c.source_meetings.length > 0) {
    meetingSlug = c.source_meetings[0];
  } else if (c.source) {
    // Source field may be a full path or filename; extract basename without ext.
    const base = c.source.split(/[/\\]/).pop() ?? c.source;
    meetingSlug = base.replace(/\.md$/, '');
  }

  return {
    id: c.id,
    text: c.text,
    direction: c.direction,
    personSlugs,
    meetingSlug,
    date: c.date,
  };
}
