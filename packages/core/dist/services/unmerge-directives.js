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
import { computeCommitmentHashV2 } from './commitments-hash-v2.js';
// Capture groups:
//   1 = canonical id (hash prefix or full)
//   2 = dupe id (hash prefix or full)
// Arrow accepts unicode ← or ASCII <- ; whitespace tolerant.
const UNMERGE_PATTERN = /\[\[unmerge:\s*([a-z0-9_-]+)\s*(?:←|<-)\s*([a-z0-9_-]+)\s*\]\]/gi;
/**
 * Parse all `[[unmerge: <canonical> ← <dupe>]]` directives from winddown
 * view content. One entry per occurrence; duplicates preserved.
 */
export function parseUnmergeDirectives(content) {
    const results = [];
    UNMERGE_PATTERN.lastIndex = 0;
    let match;
    while ((match = UNMERGE_PATTERN.exec(content)) !== null) {
        const [raw, canonicalId, dupeId] = match;
        results.push({
            canonicalId: canonicalId.toLowerCase(),
            dupeId: dupeId.toLowerCase(),
            raw,
        });
    }
    return results;
}
const SHORT = 8;
const shortId = (id) => (id.length > SHORT ? id.slice(0, SHORT) : id);
function idMatches(full, needle) {
    const a = full.toLowerCase();
    const b = needle.toLowerCase().replace(/^canon_/, '');
    if (!a || !b)
        return false;
    return a === b || a.startsWith(b) || b.startsWith(a);
}
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
export function resolveUnmerge(commitments, directive, opts = {}) {
    const canonical = commitments.find((c) => idMatches(c.id, directive.canonicalId));
    if (!canonical) {
        return {
            status: 'no-canonical',
            message: `[[unmerge: ${directive.canonicalId} ← ${directive.dupeId}]] — no commitment matches canonical id "${directive.canonicalId}". It may have already been unmerged or resolved.`,
        };
    }
    const sources = canonical.source_meetings ?? (canonical.source ? [canonical.source] : []);
    // A canonical with a single source has nothing merged into it.
    if (sources.length <= 1) {
        return {
            status: 'nothing-to-split',
            message: `[[unmerge: ${directive.canonicalId} ← ${directive.dupeId}]] — canonical "${shortId(canonical.id)}" has no merged source to split out (only its original meeting remains).`,
        };
    }
    // Choose the source meeting to peel off.
    let splitMeeting;
    if (opts.dupeMeetingSlug && sources.includes(opts.dupeMeetingSlug)) {
        splitMeeting = opts.dupeMeetingSlug;
    }
    else {
        // Default: the LAST source (most-recently merged). Never peel the
        // first source — that's the canonical's own original meeting.
        splitMeeting = sources[sources.length - 1];
    }
    // Recover the original wording for the split-out commitment (Q7).
    const variants = canonical.textVariants ?? [canonical.text];
    const nonCanonical = variants.filter((v) => v !== canonical.text);
    // Prefer the LAST non-canonical variant (freshest under oldest-first eviction).
    const splitText = nonCanonical.length > 0 ? nonCanonical[nonCanonical.length - 1] : canonical.text;
    // Build the updated canonical: remove the split source + variant.
    const remainingSources = sources.filter((s) => s !== splitMeeting);
    const remainingVariants = variants.filter((v) => v !== splitText);
    const updatedCanonical = {
        ...canonical,
        source_meetings: remainingSources,
        // Keep at least the canonical text as a variant.
        textVariants: remainingVariants.length > 0 ? remainingVariants : [canonical.text],
    };
    // Keep v1 `source` pointing at the first remaining source for read-path
    // compatibility.
    if (remainingSources.length > 0) {
        updatedCanonical.source = remainingSources[0];
    }
    // Mint the split-out commitment with the ORIGINAL text + a fresh hash.
    const newId = opts.newId ?? computeCommitmentHashV2(splitText, canonical.direction);
    const splitOut = {
        ...canonical,
        id: newId,
        text: splitText,
        source: splitMeeting,
        source_meetings: [splitMeeting],
        textVariants: [splitText],
        // A freshly-split commitment is open again (its own obligation).
        status: 'open',
        resolvedAt: null,
    };
    const nextCommitments = commitments.map((c) => c.id === canonical.id ? updatedCanonical : c);
    nextCommitments.push(splitOut);
    const logPayload = {
        decision: 'UNMERGE',
        newId: shortId(splitOut.id),
        canonicalId: shortId(canonical.id),
        jaccard: '-',
        llmTier: '-',
        llmDecision: '-',
        reasoning: `user-initiated [[unmerge]] split "${splitMeeting}" back out (text "${splitText}")`,
    };
    return {
        status: 'resolved',
        commitments: nextCommitments,
        splitOut,
        canonical: updatedCanonical,
        logPayload,
    };
}
//# sourceMappingURL=unmerge-directives.js.map