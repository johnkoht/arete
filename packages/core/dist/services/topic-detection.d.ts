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
import { type TopicIdentity } from './topic-memory.js';
/**
 * Generic words that appear in many slugs and many transcripts. They
 * MUST NOT contribute to a score on their own — we want at least two
 * non-stop tokens to agree before claiming a topic match.
 *
 * Keep this list short and high-signal. Tunable based on telemetry from
 * `arete meeting extract --dry-run-topics` (Task 9).
 */
export declare const STOP_TOKENS: Set<string>;
export interface DetectTopicsOptions {
    /** Cap on number of returned slugs. Default 3 (rollout cap, Decision #6). */
    maxResults?: number;
}
/**
 * Detect which existing topics a transcript likely discusses.
 *
 * Pure & synchronous. Returns canonical slugs (not aliases) sorted by
 * score desc, with `lastRefreshed` desc as the recency tiebreaker and
 * canonical-asc as the final deterministic fallback.
 */
export declare function detectTopicsLexical(transcript: string, identities: TopicIdentity[], options?: DetectTopicsOptions): string[];
//# sourceMappingURL=topic-detection.d.ts.map