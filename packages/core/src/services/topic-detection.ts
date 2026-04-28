/**
 * Lexical topic detection — pre-pass before meeting extraction.
 *
 * Pure synchronous function. No I/O, no clock reads, no storage access,
 * no async. Deterministic given inputs.
 *
 * Used by Thread B of the wiki-leaning-meeting-extraction plan to detect
 * which existing topics a transcript is likely about, so the extractor
 * can lean on those topic pages + topic-tagged L2 items and emit only
 * deltas.
 *
 * Design summary (see `dev/work/plans/wiki-leaning-meeting-extraction/plan.md`
 * §Thread B and the pre-mortem R2):
 *  - Tokenize the transcript once via `normalizeForJaccard`.
 *  - For each identity (canonical slug + each alias), tokenize the slug
 *    via `tokenizeSlug` and score against the transcript token set.
 *  - Keep one final score per identity = max across canonical + aliases
 *    (aliases are alternative spellings, not separate matches).
 *  - Threshold: ≥2 distinct multi-char NON-STOP slug tokens present
 *    AND coverage ≥ 0.5 (where coverage = non-stop hits ÷ total
 *    non-stop multi-char slug tokens). Stop tokens never count toward
 *    the hit count or coverage numerator.
 *  - Cap at 3 results at rollout (Decision #6 in plan). Sort by score
 *    desc; ties broken by `lastRefreshed` desc; canonical-asc as final
 *    fallback for full determinism.
 *
 * The escape hatch from this lexical approach is an LLM-based detector
 * — same signature, same return shape — so callers don't need to
 * change. See plan Decision #5.
 */

import { normalizeForJaccard } from '../utils/similarity.js';
import { tokenizeSlug, type TopicIdentity } from './topic-memory.js';

/**
 * Generic words that appear in many slugs and many transcripts. They
 * MUST NOT contribute to a score on their own — we want at least two
 * non-stop tokens to agree before claiming a topic match.
 *
 * Keep this list short and high-signal. Tunable based on telemetry from
 * `arete meeting extract --dry-run-topics` (Task 9).
 */
export const STOP_TOKENS = new Set<string>([
  'planning',
  'review',
  'sync',
  'discussion',
  'meeting',
  'update',
  'status',
  'team',
  'weekly',
  'daily',
]);

/** Minimum non-stop slug-token length kept for scoring. */
const MIN_TOKEN_LENGTH = 2;

/** Minimum non-stop hits required (rule 1). */
const MIN_NON_STOP_HITS = 2;

/** Minimum coverage ratio required (rule 2). */
const MIN_COVERAGE = 0.5;

/** Default cap at rollout per plan Decision #6. */
const DEFAULT_MAX_RESULTS = 3;

export interface DetectTopicsOptions {
  /** Cap on number of returned slugs. Default 3 (rollout cap, Decision #6). */
  maxResults?: number;
}

/**
 * Score a single surface (canonical slug or alias) against the
 * transcript token set. Returns the coverage ratio when the threshold
 * passes; 0 otherwise. Coverage is used as the score so that "more of
 * the slug present" wins ties between two identities that pass the
 * threshold.
 *
 * Threshold rules (both must hold):
 *  1. ≥ MIN_NON_STOP_HITS distinct multi-char NON-STOP slug tokens are
 *     present in the transcript token set.
 *  2. coverage ≥ MIN_COVERAGE, where coverage =
 *     (non-stop slug tokens present) / (total non-stop multi-char
 *     slug tokens in this surface).
 *
 * Pure stop-token surfaces (`weekly-sync` → all tokens stop) score 0:
 * the denominator is 0, coverage is 0, and the hit count is 0 anyway.
 */
function scoreSurface(surface: string, transcriptTokens: Set<string>): number {
  const slugTokens = tokenizeSlug(surface);

  // Apply the multi-char filter BEFORE counting hits (AC D). Single-char
  // tokens from punctuation artifacts shouldn't count toward the
  // threshold.
  const multiCharTokens = slugTokens.filter((t) => t.length >= MIN_TOKEN_LENGTH);

  // Partition into non-stop vs stop.
  const nonStopTokens = multiCharTokens.filter((t) => !STOP_TOKENS.has(t));

  // Pure stop-token surface — cannot score (rejects the "weekly-sync"
  // case in AC K3 explicitly: no non-stop tokens means denominator is
  // 0 and we never reach the threshold).
  if (nonStopTokens.length === 0) return 0;

  // Distinct non-stop hits (Set so repeated tokens count once).
  const distinctNonStop = new Set(nonStopTokens);
  let hits = 0;
  for (const t of distinctNonStop) {
    if (transcriptTokens.has(t)) hits++;
  }

  if (hits < MIN_NON_STOP_HITS) return 0;

  const coverage = hits / distinctNonStop.size;
  if (coverage < MIN_COVERAGE) return 0;

  return coverage;
}

/**
 * Detect which existing topics a transcript likely discusses.
 *
 * Pure & synchronous. Returns canonical slugs (not aliases) sorted by
 * score desc, with `lastRefreshed` desc as the recency tiebreaker and
 * canonical-asc as the final deterministic fallback.
 */
export function detectTopicsLexical(
  transcript: string,
  identities: TopicIdentity[],
  options?: DetectTopicsOptions,
): string[] {
  const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS;

  // Tokenize the transcript once (AC C).
  const transcriptTokens = new Set(normalizeForJaccard(transcript));
  if (transcriptTokens.size === 0) return [];

  // Score each identity by taking the max across canonical + aliases
  // (AC F). A slug must hit on at least one non-stop token to score —
  // enforced inside `scoreSurface` (AC G).
  const scored: Array<{ canonical: string; score: number; lastRefreshed: string | undefined }> = [];

  for (const identity of identities) {
    const surfaces = [identity.canonical, ...identity.aliases];
    let bestScore = 0;
    for (const surface of surfaces) {
      const s = scoreSurface(surface, transcriptTokens);
      if (s > bestScore) bestScore = s;
    }
    if (bestScore > 0) {
      scored.push({
        canonical: identity.canonical,
        score: bestScore,
        lastRefreshed: identity.lastRefreshed,
      });
    }
  }

  // Sort: score desc → lastRefreshed desc → canonical asc.
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    // Recency tiebreaker. Missing dates sort last.
    const aDate = a.lastRefreshed ?? '';
    const bDate = b.lastRefreshed ?? '';
    if (aDate !== bDate) return aDate < bDate ? 1 : -1;
    // Canonical-asc as the final deterministic fallback.
    return a.canonical < b.canonical ? -1 : a.canonical > b.canonical ? 1 : 0;
  });

  return scored.slice(0, maxResults).map((s) => s.canonical);
}
