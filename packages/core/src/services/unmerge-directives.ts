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

import { computeCommitmentHashV2 } from './commitments-hash-v2.js';
import { COMMITMENT_TEXT_VARIANTS_MAX } from '../models/entities.js';
import type { Commitment } from '../models/index.js';
import type { DedupDecisionLogPayload } from './dedup-decisions-log.js';

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

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

// Capture groups:
//   1 = canonical id (hash prefix or full)
//   2 = dupe id (hash prefix or full)
// Arrow accepts unicode ← or ASCII <- ; whitespace tolerant.
const UNMERGE_PATTERN =
  /\[\[unmerge:\s*([a-z0-9_-]+)\s*(?:←|<-)\s*([a-z0-9_-]+)\s*\]\]/gi;

/**
 * Parse all `[[unmerge: <canonical> ← <dupe>]]` directives from winddown
 * view content. One entry per occurrence; duplicates preserved.
 */
export function parseUnmergeDirectives(content: string): UnmergeDirective[] {
  const results: UnmergeDirective[] = [];
  UNMERGE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
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

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

export type UnmergeResolution =
  | {
      status: 'resolved';
      /** New commitment list with the dupe split back out. */
      commitments: Commitment[];
      /** The freshly-minted independent commitment. */
      splitOut: Commitment;
      /** The updated canonical (source meeting + variant removed). */
      canonical: Commitment;
      /** Log payload the caller writes best-effort. */
      logPayload: DedupDecisionLogPayload;
    }
  | {
      status: 'no-canonical';
      message: string;
    }
  | {
      status: 'nothing-to-split';
      message: string;
    }
  | {
      /**
       * The directive named a `dupeId` that cannot be resolved to a specific
       * source meeting / text variant on a multi-dupe canonical. We REFUSE to
       * split rather than peel the wrong dupe (HIGH-1). See the
       * "dupeId resolution limitation" note above resolveUnmerge.
       */
      status: 'ambiguous-dupe';
      message: string;
    };

const SHORT = 8;
const shortId = (id: string): string => (id.length > SHORT ? id.slice(0, SHORT) : id);

function idMatches(full: string, needle: string): boolean {
  const a = full.toLowerCase();
  const b = needle.toLowerCase().replace(/^canon_/, '');
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

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
export function resolveUnmerge(
  commitments: ReadonlyArray<Commitment>,
  directive: UnmergeDirective,
  opts: {
    dupeMapping?: ReadonlyArray<DupeSourceMapping>;
    dupeMeetingSlug?: string;
    newId?: string;
  } = {},
): UnmergeResolution {
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

  const variants = canonical.textVariants ?? [canonical.text];

  // Choose the source meeting + text to peel off, honoring dupeId (HIGH-1).
  let splitMeeting: string | undefined;
  let splitText: string | undefined;

  // (1) Caller-supplied dupe→source mapping (from dedup-decisions log).
  const mapped = opts.dupeMapping?.find((m) => idMatches(m.dupeId, directive.dupeId));
  if (mapped && sources.includes(mapped.sourceMeeting)) {
    splitMeeting = mapped.sourceMeeting;
    // The mapped text IS the dupe's original wording (recorded at merge time).
    splitText = mapped.text;
  }

  // (2) Explicit meeting slug override.
  if (!splitMeeting && opts.dupeMeetingSlug && sources.includes(opts.dupeMeetingSlug)) {
    splitMeeting = opts.dupeMeetingSlug;
  }

  // (3) Exactly two sources → the non-canonical one is unambiguous.
  if (!splitMeeting && sources.length === 2) {
    const firstSource = canonical.source ?? sources[0];
    splitMeeting = sources.find((s) => s !== firstSource) ?? sources[sources.length - 1];
  }

  // (4) 3+ sources with no mapping → REFUSE rather than peel the wrong dupe.
  if (!splitMeeting) {
    return {
      status: 'ambiguous-dupe',
      message:
        `[[unmerge: ${directive.canonicalId} ← ${directive.dupeId}]] — canonical "${shortId(canonical.id)}" absorbed ${sources.length} sources and no dupe→source mapping resolves "${directive.dupeId}" to a specific one. ` +
        `Refusing to split (would peel the wrong dupe). The dupe→source association is not stored on the commitment; supply it from the dedup-decisions log, or use \`arete commitments reopen\` / re-extract the specific meeting.`,
    };
  }

  // Recover the original wording for the split-out commitment (Q7) if the
  // mapping did not already pin it.
  if (splitText === undefined) {
    const nonCanonical = variants.filter((v) => v !== canonical.text);
    // Prefer the LAST non-canonical variant (freshest under oldest-first eviction).
    splitText =
      nonCanonical.length > 0 ? nonCanonical[nonCanonical.length - 1] : canonical.text;
  }

  // Build the updated canonical: remove the split source + variant.
  const remainingSources = sources.filter((s) => s !== splitMeeting);
  const remainingVariants = variants.filter((v) => v !== splitText);
  const updatedCanonical: Commitment = {
    ...canonical,
    source_meetings: remainingSources,
    // Keep at least the canonical text as a variant.
    textVariants:
      remainingVariants.length > 0 ? remainingVariants : [canonical.text],
  };
  // Keep v1 `source` pointing at the first remaining source for read-path
  // compatibility.
  if (remainingSources.length > 0) {
    updatedCanonical.source = remainingSources[0];
  }

  // Mint the split-out commitment with the ORIGINAL text + a fresh hash.
  const newId =
    opts.newId ?? computeCommitmentHashV2(splitText, canonical.direction);
  const splitOut: Commitment = {
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

  const nextCommitments = commitments.map((c) =>
    c.id === canonical.id ? updatedCanonical : c,
  );
  nextCommitments.push(splitOut);

  const logPayload: DedupDecisionLogPayload = {
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
