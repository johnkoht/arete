/**
 * Phase 10b-aux Step 2 — `[[unmerge]]` directive parser + resolver.
 *
 * Follows the phase-10-followup-2 `[[unskip]]` / `[[confirm-skip]]`
 * precedent (chef-skip-directives.ts): a tolerant regex parser plus a
 * resolver. That followup noted "this followup's parser IS the project's
 * directive infrastructure" — `[[unmerge]]` is a parallel parser of the
 * same shape rather than a generalization, because its payload (two ids
 * joined by `←`) differs from the skip directives' single id.
 *
 * Directive format (plan AC8 / AC8a):
 *
 *   [[unmerge: <canonical-id> ← <dupe-id>]]
 *
 * The arrow may be the unicode `←` or the ASCII `<-`. IDs are commitment
 * hash prefixes (≥4 chars) or full hashes; whitespace around the arrow is
 * optional.
 *
 * Resolver semantics (plan §"Week-1 audit + recovery controls" + Q7):
 *   1. Find the canonical commitment by id/prefix.
 *   2. Select WHICH dupe to peel using `directive.dupeId` (HIGH-1): prefer a
 *      caller-supplied dupe→source mapping (from the dedup-decisions log),
 *      else an explicit meeting slug, else the unambiguous non-canonical
 *      source on a 2-source canonical. On a 3+ source canonical with no
 *      mapping, REFUSE (`ambiguous-dupe`) rather than peel the wrong one.
 *   3. Find the dupe's ORIGINAL extracted text in the canonical's
 *      `textVariants[]` (Q7: split out with original wording, NOT the
 *      canonical's text — preserves provenance integrity).
 *   4. Build a NEW independent commitment carrying that text, the dupe's
 *      source meeting, and a fresh hash.
 *   5. Remove the dupe's source meeting + text variant from the canonical.
 *   6. Emit an UNMERGE log payload (caller writes it best-effort).
 *
 * Pure module: NO filesystem, NO LLM, NO service coupling. The caller
 * (winddown wire-in) loads commitments.json under lock, applies the
 * returned mutation, and writes the log line.
 */
import type { Commitment } from '../models/index.js';
import type { DedupDecisionLogPayload } from './dedup-decisions-log.js';
export interface UnmergeDirective {
    /** Canonical commitment id (full hash or prefix) the dupe is split FROM. */
    canonicalId: string;
    /**
     * Dupe id (full hash or prefix). When a dupe was absorbed via dedup it
     * may no longer have its own commitment row — the id here is the staged-
     * item id OR the absorbed commitment id recorded in the log; the
     * resolver matches it against the canonical's source meetings /
     * textVariants by best-effort.
     */
    dupeId: string;
    /** Raw matched text for audit. */
    raw: string;
}
/**
 * Parse all `[[unmerge: <canonical> ← <dupe>]]` directives from winddown
 * view content. One entry per occurrence; duplicates preserved.
 */
export declare function parseUnmergeDirectives(content: string): UnmergeDirective[];
export type UnmergeResolution = {
    status: 'resolved';
    /** New commitment list with the dupe split back out. */
    commitments: Commitment[];
    /** The freshly-minted independent commitment. */
    splitOut: Commitment;
    /** The updated canonical (source meeting + variant removed). */
    canonical: Commitment;
    /** Log payload the caller writes best-effort. */
    logPayload: DedupDecisionLogPayload;
} | {
    status: 'no-canonical';
    message: string;
} | {
    status: 'nothing-to-split';
    message: string;
} | {
    /**
     * The directive named a `dupeId` that cannot be resolved to a specific
     * source meeting / text variant on a multi-dupe canonical. We REFUSE to
     * split rather than peel the wrong dupe (HIGH-1). See the
     * "dupeId resolution limitation" note above resolveUnmerge.
     */
    status: 'ambiguous-dupe';
    message: string;
};
/**
 * A resolved mapping from an absorbed dupe id → the specific source meeting
 * and original text it contributed to the canonical. The caller (winddown
 * wire-in) builds this from the dedup-decisions log + staged-item records,
 * which are the ONLY places the dupe→source association is persisted.
 *
 * See "dupeId resolution limitation" below for why this must come from the
 * caller rather than being derivable from the Commitment row alone.
 */
export interface DupeSourceMapping {
    /** The absorbed dupe id (full hash or prefix), lowercased. */
    dupeId: string;
    /** The source meeting slug the dupe contributed to `source_meetings[]`. */
    sourceMeeting: string;
    /** The dupe's original extracted text (its entry in `textVariants[]`). */
    text: string;
}
/**
 * Resolve a single `[[unmerge]]` directive against a commitment list.
 *
 * Pure transform: returns a NEW commitment array (does not mutate input).
 *
 * Q7 (resolved): the split-out commitment carries the ORIGINAL extracted
 * wording. We recover it from the canonical's `textVariants[]` — the
 * non-canonical variant whose source we are splitting.
 *
 * --- dupeId resolution (HIGH-1 fix) -------------------------------------
 * The directive names WHICH dupe to split (`directive.dupeId`). To split the
 * correct one we must map that id → a specific `source_meetings[]` entry +
 * `textVariants[]` entry. The Commitment row does NOT persist this mapping:
 * `applyCommitmentsDedup` (background-dedup.ts) unions absorbed dupes into a
 * `Set<string>` of source meetings (then sorts alphabetically) and appends
 * texts to `textVariants[]` — the originating dupe id is discarded after the
 * merge. The only durable record of "dupe X came from meeting Y with text Z"
 * lives in the dedup-decisions log + staged-item provenance.
 *
 * Resolution order:
 *   1. If the caller supplies `opts.dupeMapping` and the entry matching
 *      `directive.dupeId` points at a source meeting still on the canonical,
 *      peel exactly that source + that text. (Correct for 3+ source
 *      canonicals.)
 *   2. Else if `opts.dupeMeetingSlug` names a current source, peel that.
 *   3. Else if the canonical has exactly TWO sources, the non-canonical one
 *      is unambiguous — peel it (the 2-source case the old code handled by
 *      coincidence is still correct).
 *   4. Else (3+ sources, no mapping) REFUSE with `ambiguous-dupe` rather than
 *      silently peeling the wrong dupe.
 *
 * @param commitments   Current commitment list (read-only).
 * @param directive     Parsed directive.
 * @param opts.dupeMapping  Optional dupe→source/text records resolved from the
 *   dedup-decisions log. Enables correct splits on 3+ source canonicals.
 * @param opts.dupeMeetingSlug  Optional explicit source meeting to peel.
 * @param opts.newId    Id for the new commitment. Defaults to a derived hash.
 */
export declare function resolveUnmerge(commitments: ReadonlyArray<Commitment>, directive: UnmergeDirective, opts?: {
    dupeMapping?: ReadonlyArray<DupeSourceMapping>;
    dupeMeetingSlug?: string;
    newId?: string;
}): UnmergeResolution;
//# sourceMappingURL=unmerge-directives.d.ts.map