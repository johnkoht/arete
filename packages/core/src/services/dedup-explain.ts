/**
 * Phase 10b-aux Step 1 — `arete dedup --explain <commitment-id>` provenance.
 *
 * Pure module: parses `dev/diary/dedup-decisions.log` lines + a `Commitment`
 * into a human-readable provenance report (plan AC7). No filesystem, no
 * service coupling — the CLI reads the log + commitments.json and passes
 * strings in.
 *
 * Per plan §"Week-1 audit + recovery controls" AC7, the report surfaces:
 *   - Canonical text + stakeholders with roles
 *   - All source_meetings with dedup-event provenance (when merged, jaccard,
 *     LLM decision, reasoning) — pulled from the decisions log
 *   - textVariants list with eviction state (N/5 capacity)
 *
 * R10 note: `--explain` reads CURRENT state from the commitment for the
 * stakeholders / source_meetings / textVariants; the log is the
 * provenance overlay (observability, not source of truth). When the log
 * and the commitment disagree (e.g. an entry was later [[unmerge]]'d), the
 * commitment wins — we only annotate source_meetings that the log explains.
 */

import { COMMITMENT_TEXT_VARIANTS_MAX } from '../models/entities.js';
import type { Commitment } from '../models/index.js';
import type { DedupDecisionKind, DedupLLMTier } from './dedup-decisions-log.js';

// ---------------------------------------------------------------------------
// Log parsing
// ---------------------------------------------------------------------------

/**
 * One parsed line of `dedup-decisions.log`.
 *
 * Column layout shipped by 10b-min (`renderDedupDecisionLine`):
 *   <ISO> <decision> <new-id> <canonical-id> <jaccard> <llm-tier> <llm-decision> <reasoning...>
 *
 * `reasoning` is the free-form trailing remainder (may contain spaces).
 */
export type DedupLogEntry = {
  iso: string;
  decision: DedupDecisionKind;
  newId: string;
  canonicalId: string;
  /** Jaccard column verbatim ('-' when N/A). */
  jaccard: string;
  llmTier: DedupLLMTier;
  llmDecision: 'SAME' | 'DIFFERENT' | 'UNCERTAIN' | '-';
  reasoning: string;
  /** Raw line for fallthrough display. */
  raw: string;
};

const DECISION_TOKENS: ReadonlySet<string> = new Set([
  'MERGE',
  'NEW',
  'UNCERTAIN',
  'UNMERGE',
]);

/**
 * Parse the raw text of `dedup-decisions.log` into structured entries.
 *
 * Tolerant: malformed lines (wrong column count, unknown decision token)
 * are skipped silently — the log is best-effort observability, not a
 * strict schema. Blank lines are skipped.
 *
 * Exported for tests.
 */
export function parseDedupLog(raw: string): DedupLogEntry[] {
  const out: DedupLogEntry[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // Split off the first 7 columns; reasoning is the remainder.
    const parts = line.split(/\s+/);
    if (parts.length < 7) continue;
    const [iso, decision, newId, canonicalId, jaccard, llmTier, llmDecision] =
      parts;
    if (!DECISION_TOKENS.has(decision)) continue;
    const reasoning = parts.slice(7).join(' ');
    out.push({
      iso,
      decision: decision as DedupDecisionKind,
      newId,
      canonicalId,
      jaccard,
      llmTier: llmTier as DedupLLMTier,
      llmDecision: llmDecision as DedupLogEntry['llmDecision'],
      reasoning,
      raw: line,
    });
  }
  return out;
}

/**
 * Filter log entries relevant to a canonical commitment.
 *
 * A line is relevant when its `canonicalId` matches `commitmentId` (full
 * hash OR shared prefix in either direction), OR — for UNMERGE lines —
 * when the canonical is referenced as the split source. We match on prefix
 * so an 8-char CLI argument lines up with full hashes in the log and the
 * `canon_<prefix>` short forms the plan example uses.
 *
 * Exported for tests.
 */
export function filterLogForCommitment(
  entries: ReadonlyArray<DedupLogEntry>,
  commitmentId: string,
): DedupLogEntry[] {
  const needle = commitmentId.toLowerCase();
  return entries.filter((e) => {
    const cid = e.canonicalId.toLowerCase().replace(/^canon_/, '');
    return idsMatch(cid, needle);
  });
}

/**
 * Two IDs match when one is a prefix of the other (case-insensitive).
 * Empty / '-' never matches.
 */
function idsMatch(a: string, b: string): boolean {
  if (!a || !b || a === '-' || b === '-') return false;
  return a.startsWith(b) || b.startsWith(a);
}

// ---------------------------------------------------------------------------
// Commitment lookup
// ---------------------------------------------------------------------------

/**
 * Resolve a commitment from a list by full hash or short prefix (≥ 4 chars).
 *
 * Returns the single match, or:
 *   - `{ kind: 'not-found' }` when no commitment matches.
 *   - `{ kind: 'ambiguous', matches }` when a short prefix hits 2+ rows.
 *
 * Exported for tests + the CLI.
 */
export type CommitmentLookupResult =
  | { kind: 'found'; commitment: Commitment }
  | { kind: 'not-found' }
  | { kind: 'ambiguous'; matches: Commitment[] };

export function lookupCommitmentById(
  commitments: ReadonlyArray<Commitment>,
  idOrPrefix: string,
): CommitmentLookupResult {
  const needle = idOrPrefix.trim().toLowerCase();
  if (!needle) return { kind: 'not-found' };

  // Exact full-hash match first.
  const exact = commitments.find((c) => c.id.toLowerCase() === needle);
  if (exact) return { kind: 'found', commitment: exact };

  // Prefix match.
  const matches = commitments.filter((c) =>
    c.id.toLowerCase().startsWith(needle),
  );
  if (matches.length === 0) return { kind: 'not-found' };
  if (matches.length > 1) return { kind: 'ambiguous', matches };
  return { kind: 'found', commitment: matches[0] };
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

const SHORT_ID_LEN = 8;

function shortId(id: string): string {
  return id.length > SHORT_ID_LEN ? id.slice(0, SHORT_ID_LEN) : id;
}

/**
 * Render the human-readable `--explain` provenance report (plan AC7 shape).
 *
 * @param commitment  The resolved canonical commitment.
 * @param logEntries  ALL parsed log entries (pre-filter); this function
 *                    filters to the ones explaining THIS commitment.
 *
 * Exported for tests.
 */
export function formatExplainReport(
  commitment: Commitment,
  logEntries: ReadonlyArray<DedupLogEntry>,
): string {
  const lines: string[] = [];
  const relevant = filterLogForCommitment(logEntries, commitment.id);

  lines.push(`Commitment: ${commitment.id}`);
  lines.push(`Canonical text: "${commitment.text}"`);

  // ── Stakeholders (prefer v2 stakeholders[]; fall back to v1 personSlug) ──
  const stakeholders = formatStakeholders(commitment);
  lines.push(`Stakeholders: ${stakeholders}`);
  lines.push(`Direction: ${commitment.direction}`);
  lines.push(`Status: ${commitment.status}`);

  // ── Source meetings with dedup-event provenance ──────────────────────────
  lines.push('Source meetings:');
  const sources =
    commitment.source_meetings && commitment.source_meetings.length > 0
      ? commitment.source_meetings
      : commitment.source
        ? [commitment.source]
        : [];
  if (sources.length === 0) {
    lines.push('  (none recorded)');
  } else {
    for (let i = 0; i < sources.length; i += 1) {
      const slug = stripMeetingExt(sources[i]);
      const provenance = provenanceForSource(slug, relevant, i === 0);
      lines.push(`  - ${slug}${provenance}`);
    }
  }

  // ── Text variants with eviction state ────────────────────────────────────
  const variants = commitment.textVariants ?? [commitment.text];
  lines.push(
    `Text variants observed (${variants.length}/${COMMITMENT_TEXT_VARIANTS_MAX} capacity):`,
  );
  for (const v of variants) {
    const marker = v === commitment.text ? '  ← canonical' : '';
    lines.push(`  - "${v}"${marker}`);
  }
  if (variants.length >= COMMITMENT_TEXT_VARIANTS_MAX) {
    lines.push(
      `  (at capacity — oldest variant evicted when the next new wording lands)`,
    );
  }

  // ── Dedup decision log (raw provenance overlay) ──────────────────────────
  lines.push('');
  if (relevant.length === 0) {
    lines.push(
      'Dedup decisions: (no log entries reference this commitment — it was either created before Phase 10 dedup or its merges predate the current log)',
    );
  } else {
    lines.push(`Dedup decisions (${relevant.length} log entr${relevant.length === 1 ? 'y' : 'ies'}):`);
    for (const e of relevant) {
      lines.push(
        `  ${e.iso} ${e.decision} ${shortId(e.newId)} ← ${shortId(
          e.canonicalId.replace(/^canon_/, ''),
        )} (jaccard ${e.jaccard}, ${e.llmTier}-tier ${e.llmDecision}${
          e.reasoning ? `, "${e.reasoning}"` : ''
        })`,
      );
    }
  }

  return lines.join('\n');
}

/** Format stakeholders as `[@slug (role), ...]`, dual-shape aware. */
function formatStakeholders(commitment: Commitment): string {
  if (
    Array.isArray(commitment.stakeholders) &&
    commitment.stakeholders.length > 0
  ) {
    return (
      '[' +
      commitment.stakeholders
        .map((s) => `@${s.slug} (${s.role})`)
        .join(', ') +
      ']'
    );
  }
  if (commitment.personSlug) {
    // v1 row — render the single counterparty with an inferred role.
    const role =
      commitment.direction === 'they_owe_me' ? 'sender' : 'recipient';
    return `[@${commitment.personSlug} (${role})]`;
  }
  return '[none]';
}

/** Strip a `.md` extension + path from a source meeting reference. */
function stripMeetingExt(source: string): string {
  const base = source.split(/[/\\]/).pop() ?? source;
  return base.replace(/\.md$/, '');
}

/**
 * Build the trailing provenance annotation for one source meeting line.
 *
 * The first source is the original (LLM-extracted). Later sources are
 * annotated from the log when a MERGE/UNCERTAIN line's `newId` traces back
 * to this meeting — but the log keys on item-id not meeting-slug, so we
 * surface the matching MERGE detail generically by index when we cannot
 * map slug→id precisely (the log does not carry meeting slugs). We fall
 * back to the canonical "(deduped; see Dedup decisions below)" hint.
 */
function provenanceForSource(
  slug: string,
  relevant: ReadonlyArray<DedupLogEntry>,
  isFirst: boolean,
): string {
  if (isFirst) {
    return '  (original; LLM-extracted)';
  }
  // Later sources arrived via a merge. Surface the first merge detail that
  // is not a pure text-hash hit, else a generic deduped marker.
  const merge = relevant.find(
    (e) => e.decision === 'MERGE' || e.decision === 'UNCERTAIN',
  );
  if (merge) {
    if (merge.llmDecision === '-') {
      return '  (deduped; exact text-hash match)';
    }
    return `  (deduped; jaccard ${merge.jaccard}; ${merge.llmTier}-tier ${merge.llmDecision})`;
  }
  return '  (deduped; see Dedup decisions below)';
}
