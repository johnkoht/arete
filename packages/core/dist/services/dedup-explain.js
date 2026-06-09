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
const DECISION_TOKENS = new Set([
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
export function parseDedupLog(raw) {
    const out = [];
    for (const rawLine of raw.split(/\r?\n/)) {
        // NB: trim spaces only, not tabs — the I-6 provenance delimiter is a tab.
        const line = rawLine.replace(/^ +| +$/g, '').replace(/\r$/, '');
        if (!line)
            continue;
        // I-6: a MERGE line may carry a TAB-delimited provenance segment after
        // reasoning. Split on the FIRST tab: prefix = legacy space-format, segment
        // = `<dupe-source-meeting>\t<base64(dupe-text)>`.
        const tabIdx = line.indexOf('\t');
        const prefix = tabIdx === -1 ? line : line.slice(0, tabIdx);
        let dupeSourceMeeting;
        let dupeText;
        if (tabIdx !== -1) {
            const segParts = line.slice(tabIdx + 1).split('\t');
            if (segParts.length >= 2 && segParts[0] && segParts[1]) {
                dupeSourceMeeting = segParts[0];
                try {
                    dupeText = Buffer.from(segParts[1], 'base64').toString('utf8');
                }
                catch {
                    dupeSourceMeeting = undefined; // malformed segment → drop both
                }
            }
        }
        // Split off the first 7 columns; reasoning is the remainder of the prefix.
        const parts = prefix.split(/\s+/);
        if (parts.length < 7)
            continue;
        const [iso, decision, newId, canonicalId, jaccard, llmTier, llmDecision] = parts;
        if (!DECISION_TOKENS.has(decision))
            continue;
        const reasoning = parts.slice(7).join(' ');
        out.push({
            iso,
            decision: decision,
            newId,
            canonicalId,
            jaccard,
            llmTier: llmTier,
            llmDecision: llmDecision,
            reasoning,
            ...(dupeSourceMeeting != null && dupeText != null
                ? { dupeSourceMeeting, dupeText }
                : {}),
            raw: line,
        });
    }
    return out;
}
/**
 * I-6: rebuild the `{ dupeId, sourceMeeting, text }` mapping records for a
 * canonical from parsed dedup-decisions log entries.
 *
 * Returns one record per MERGE line that (a) matches `canonicalId` and (b)
 * carries a complete dupe→source provenance segment. The `dupeId` is the
 * line's `newId` (the absorbed dupe's id). Lines without provenance (older
 * merges, or non-MERGE decisions) are skipped — yielding fewer records, which
 * the unmerge resolver tolerates (it falls back to `ambiguous-dupe` for any
 * dupe it can't resolve, the current safe behavior).
 *
 * The return shape matches `DupeSourceMapping` (unmerge-directives.ts) by
 * field; it is typed structurally here to avoid a service-layer import cycle.
 * The unmerge wire-in (not yet built — see below) consumes this.
 *
 * NOTE: this lays the durable record + the rebuild seam. I-6 does not FULLY
 * close until the `[[unmerge]]` directive is actually executed in a winddown
 * run and passes the rebuilt mapping into `resolveUnmerge(..., { dupeMapping })`
 * — that wire-in is unbuilt (worklog Workstream 3 / Phase 11c).
 *
 * Exported for tests + the future unmerge wire-in.
 */
export function buildDupeSourceMapping(entries, canonicalId) {
    const out = [];
    const needle = canonicalId.toLowerCase().replace(/^canon_/, '');
    for (const e of entries) {
        if (e.decision !== 'MERGE')
            continue;
        if (e.dupeSourceMeeting == null || e.dupeText == null)
            continue;
        const cid = e.canonicalId.toLowerCase().replace(/^canon_/, '');
        if (!idsMatch(cid, needle))
            continue;
        out.push({
            dupeId: e.newId.toLowerCase(),
            sourceMeeting: e.dupeSourceMeeting,
            text: e.dupeText,
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
export function filterLogForCommitment(entries, commitmentId) {
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
function idsMatch(a, b) {
    if (!a || !b || a === '-' || b === '-')
        return false;
    return a.startsWith(b) || b.startsWith(a);
}
export function lookupCommitmentById(commitments, idOrPrefix) {
    const needle = idOrPrefix.trim().toLowerCase();
    if (!needle)
        return { kind: 'not-found' };
    // Exact full-hash match first.
    const exact = commitments.find((c) => c.id.toLowerCase() === needle);
    if (exact)
        return { kind: 'found', commitment: exact };
    // Prefix match.
    const matches = commitments.filter((c) => c.id.toLowerCase().startsWith(needle));
    if (matches.length === 0)
        return { kind: 'not-found' };
    if (matches.length > 1)
        return { kind: 'ambiguous', matches };
    return { kind: 'found', commitment: matches[0] };
}
// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------
const SHORT_ID_LEN = 8;
function shortId(id) {
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
export function formatExplainReport(commitment, logEntries) {
    const lines = [];
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
    const sources = commitment.source_meetings && commitment.source_meetings.length > 0
        ? commitment.source_meetings
        : commitment.source
            ? [commitment.source]
            : [];
    if (sources.length === 0) {
        lines.push('  (none recorded)');
    }
    else {
        for (let i = 0; i < sources.length; i += 1) {
            const slug = stripMeetingExt(sources[i]);
            const provenance = provenanceForSource(slug, relevant, i === 0);
            lines.push(`  - ${slug}${provenance}`);
        }
    }
    // ── Text variants with eviction state ────────────────────────────────────
    const variants = commitment.textVariants ?? [commitment.text];
    lines.push(`Text variants observed (${variants.length}/${COMMITMENT_TEXT_VARIANTS_MAX} capacity):`);
    for (const v of variants) {
        const marker = v === commitment.text ? '  ← canonical' : '';
        lines.push(`  - "${v}"${marker}`);
    }
    if (variants.length >= COMMITMENT_TEXT_VARIANTS_MAX) {
        lines.push(`  (at capacity — oldest variant evicted when the next new wording lands)`);
    }
    // ── Dedup decision log (raw provenance overlay) ──────────────────────────
    lines.push('');
    if (relevant.length === 0) {
        lines.push('Dedup decisions: (no log entries reference this commitment — it was either created before Phase 10 dedup or its merges predate the current log)');
    }
    else {
        lines.push(`Dedup decisions (${relevant.length} log entr${relevant.length === 1 ? 'y' : 'ies'}):`);
        for (const e of relevant) {
            lines.push(`  ${e.iso} ${e.decision} ${shortId(e.newId)} ← ${shortId(e.canonicalId.replace(/^canon_/, ''))} (jaccard ${e.jaccard}, ${e.llmTier}-tier ${e.llmDecision}${e.reasoning ? `, "${e.reasoning}"` : ''})`);
        }
    }
    return lines.join('\n');
}
/** Format stakeholders as `[@slug (role), ...]`, dual-shape aware. */
function formatStakeholders(commitment) {
    if (Array.isArray(commitment.stakeholders) &&
        commitment.stakeholders.length > 0) {
        return ('[' +
            commitment.stakeholders
                .map((s) => `@${s.slug} (${s.role})`)
                .join(', ') +
            ']');
    }
    if (commitment.personSlug) {
        // v1 row — render the single counterparty with an inferred role.
        const role = commitment.direction === 'they_owe_me' ? 'sender' : 'recipient';
        return `[@${commitment.personSlug} (${role})]`;
    }
    return '[none]';
}
/** Strip a `.md` extension + path from a source meeting reference. */
function stripMeetingExt(source) {
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
function provenanceForSource(slug, relevant, isFirst) {
    if (isFirst) {
        return '  (original; LLM-extracted)';
    }
    // Later sources arrived via a merge. Surface the first merge detail that
    // is not a pure text-hash hit, else a generic deduped marker.
    const merge = relevant.find((e) => e.decision === 'MERGE' || e.decision === 'UNCERTAIN');
    if (merge) {
        if (merge.llmDecision === '-') {
            return '  (deduped; exact text-hash match)';
        }
        return `  (deduped; jaccard ${merge.jaccard}; ${merge.llmTier}-tier ${merge.llmDecision})`;
    }
    return '  (deduped; see Dedup decisions below)';
}
//# sourceMappingURL=dedup-explain.js.map