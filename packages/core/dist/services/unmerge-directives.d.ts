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
 *   2. Find the dupe's ORIGINAL extracted text in the canonical's
 *      `textVariants[]` (Q7: split out with original wording, NOT the
 *      canonical's text — preserves provenance integrity).
 *   3. Build a NEW independent commitment carrying that text, the dupe's
 *      source meeting, and a fresh hash.
 *   4. Remove the dupe's source meeting + text variant from the canonical.
 *   5. Emit an UNMERGE log payload (caller writes it best-effort).
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
};
/**
 * Resolve a single `[[unmerge]]` directive against a commitment list.
 *
 * Pure transform: returns a NEW commitment array (does not mutate input).
 *
 * Q7 (resolved): the split-out commitment carries the ORIGINAL extracted
 * wording. We recover it from the canonical's `textVariants[]` — the
 * non-canonical variant whose source we are splitting. When the canonical
 * has exactly one non-canonical variant we use it; when there are several
 * we pick the LAST (most-recently-merged, oldest-first eviction means the
 * tail is the freshest) unless `dupeText` hints a specific match. If no
 * non-canonical variant exists, we fall back to the canonical text.
 *
 * @param commitments   Current commitment list (read-only).
 * @param directive     Parsed directive.
 * @param opts.dupeMeetingSlug  Optional: the source meeting to peel off
 *   the canonical (when known from the "Deduped today" entry). When
 *   omitted, the LAST source meeting (most-recently merged) is split off.
 * @param opts.newId    Id for the new commitment. Defaults to a derived
 *   hash; callers that mint ids should pass one for stability.
 */
export declare function resolveUnmerge(commitments: ReadonlyArray<Commitment>, directive: UnmergeDirective, opts?: {
    dupeMeetingSlug?: string;
    newId?: string;
}): UnmergeResolution;
//# sourceMappingURL=unmerge-directives.d.ts.map