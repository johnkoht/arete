/**
 * Phase 10e — Background dedup hygiene engine.
 *
 * Pure orchestration layer for the manual `arete dedup` verb. Reuses the
 * shipped reactive hybrid pipeline (`commitment-dedup-pipeline.ts`) and
 * applies it RETROACTIVELY to existing data within an arbitrary time
 * window (`--since`), as opposed to reactive dedup which only sees the
 * current extract vs. same-day prior commitments.
 *
 * Scopes (per plan §"10e" + AC10 / AC10a):
 *   - `commitments`: pairwise dedup within commitments.json
 *   - `decisions`:   pairwise dedup within memory/items/decisions.md
 *   - `learnings`:   pairwise dedup within memory/items/learnings.md
 *   - `topics`:      flag topic pages with overlapping aliases / body
 *
 * The module is PURE — it does NOT write to disk. Callers (CLI) decide
 * whether to apply or surface for review based on the `--dry-run` /
 * `--apply` flag. Tests exercise this module against synthetic in-memory
 * fixtures; no LLM, no production writes.
 *
 * Reuse + idempotency contract:
 *   - For commitments scope: groups are computed via the hybrid pipeline's
 *     `findDedupCandidates` + (when an LLM is provided) `runLLMCrossCheck`.
 *     Re-running `--apply` on already-merged data produces ZERO new groups
 *     because the canonical commitments' text_hash + textVariants now cover
 *     the prior surface forms (the v2 normalizer + hash absorbs them).
 *   - For decisions / learnings: Jaccard token similarity over the section
 *     body, gated by title/topic overlap. Same idempotency story — once
 *     duplicates are merged into a single section, the Jaccard pass on
 *     subsequent runs finds no pairs at the threshold.
 *   - For topics: alias-overlap + body-Jaccard. Conservative — surfaces
 *     pairs that overlap, leaves merging to the user (no auto-merge of
 *     topic pages in v2; the human owns the wiki).
 *
 * Mutual exclusion with reactive dedup:
 *   The CLI wrapper acquires `services.commitments.withLock(...)` before
 *   invoking the apply path. This engine is lock-agnostic — it returns
 *   a result + a diff bundle, and the caller chooses whether to write
 *   inside or outside the lock. The contract is documented per-scope in
 *   the apply helpers below.
 */
import { findDedupCandidates, runLLMCrossCheck, applyDedupDecisions, commitmentToDedupInput, tokenizeForJaccard, jaccardSimilarity, } from './commitment-dedup-pipeline.js';
import { normalizeCommitmentTextV2 } from './commitments-hash-v2.js';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/**
 * Jaccard floor for surfacing pairs of memory-file sections (decisions /
 * learnings). Lower than the dedup-pipeline's 0.6 because memory sections
 * tend to have more boilerplate than commitment text, and we want the
 * background pass to surface for review rather than auto-merge. Pairs
 * above this floor but below the LLM-confirmed bar appear in
 * `candidates[]`.
 */
export const BACKGROUND_DEDUP_MEMORY_JACCARD_FLOOR = 0.55;
/**
 * Jaccard floor for grouping topic pages as overlapping. Topic pages
 * are wider in scope than memory sections (whole-area summaries), so
 * the floor is lower. Surface-only — topic pages are never auto-merged.
 */
export const BACKGROUND_DEDUP_TOPICS_JACCARD_FLOOR = 0.4;
// ---------------------------------------------------------------------------
// runBackgroundDedup — top-level entry point
// ---------------------------------------------------------------------------
/**
 * Run the background dedup pass for the given scope.
 *
 * Returns a `BackgroundDedupResult` describing the proposed groups +
 * candidates + a markdown diff. The caller decides whether to write
 * the diff and / or apply the merges based on the verb's CLI flags.
 *
 * Idempotency: when called twice in a row with the same inputs, the
 * result is identical (pure function). The CLI wrapper's `--apply`
 * step is what mutates state; this engine is read-only.
 */
export async function runBackgroundDedup(inputs) {
    switch (inputs.scope) {
        case 'commitments':
            return runCommitmentsScope(inputs);
        case 'decisions':
        case 'learnings':
            return runMemorySectionsScope(inputs);
        case 'topics':
            return runTopicsScope(inputs);
        default: {
            // Exhaustiveness check — TypeScript catches missing branches.
            const _exhaustive = inputs.scope;
            throw new Error(`Unknown scope: ${_exhaustive}`);
        }
    }
}
// ---------------------------------------------------------------------------
// Scope: commitments
// ---------------------------------------------------------------------------
/**
 * Pairwise dedup within `commitments.json`. Reuses the reactive hybrid
 * pipeline by treating every commitment as a "new item" against the
 * set of commitments earlier in the chronological order. Idempotent
 * because the v2 hash + normalizer absorb most surface variations.
 *
 * Same-day window NOT enforced here — the verb's purpose is precisely
 * to catch cross-day dupes that the reactive pipeline misses (Q4 cross-
 * day extension is deferred per plan v2 third pass).
 */
async function runCommitmentsScope(inputs) {
    if (!inputs.commitments) {
        throw new Error("scope='commitments' requires `commitments` input");
    }
    // Filter by --since (commitment.date >= inputs.since)
    const filtered = inputs.commitments.filter((c) => {
        if (c.status !== 'open')
            return false;
        if (inputs.since && c.date.slice(0, 10) < inputs.since)
            return false;
        return true;
    });
    // Chronological order: earliest first. This makes the first row in a
    // group the canonical, matching reactive dedup's "first surfaced wins"
    // semantics.
    const ordered = [...filtered].sort((a, b) => {
        const ad = a.createdAt || a.date;
        const bd = b.createdAt || b.date;
        return ad.localeCompare(bd);
    });
    const groups = new Map();
    const candidates = [];
    const merged = new Set(); // ids already absorbed into a group
    let uncertainCount = 0;
    for (let i = 0; i < ordered.length; i += 1) {
        const subject = ordered[i];
        if (merged.has(subject.id))
            continue;
        // Build the candidate pool from items EARLIER in time, AND not yet
        // merged into a group. We always pair forward: subject vs each later
        // candidate (so a later row is judged against an earlier one).
        const laterRows = ordered.slice(i + 1).filter((c) => !merged.has(c.id));
        if (laterRows.length === 0)
            continue;
        const canonicalDedupInput = commitmentToDedupInput(subject);
        const canonicalAsExisting = canonicalDedupInput;
        for (const later of laterRows) {
            if (merged.has(later.id))
                continue;
            const adapted = {
                id: later.id,
                text: later.text,
                direction: later.direction,
                personSlugs: commitmentToDedupInput(later).personSlugs,
                meetingSlug: commitmentToDedupInput(later).meetingSlug,
            };
            const found = findDedupCandidates(adapted, [canonicalAsExisting], false);
            if (found.kind === 'exact-match') {
                const group = ensureGroup(groups, subject.id, subject.text);
                group.duplicates.push({
                    key: later.id,
                    text: later.text,
                    jaccard: 1.0,
                });
                merged.add(later.id);
                continue;
            }
            // Fuzzy candidate set against a single subject — 0 or 1 entry.
            if (found.candidates.length === 0)
                continue;
            // We have a fuzzy match (Jaccard ≥0.6, person-slug overlap ≥1,
            // direction matches). Optionally consult LLM for SAME / DIFFERENT.
            let llmDecisions = [];
            if (inputs.callConcurrent) {
                llmDecisions = await runLLMCrossCheck(adapted, found.candidates, inputs.callConcurrent, inputs.tier ?? 'fast');
            }
            if (inputs.callConcurrent && llmDecisions.length > 0) {
                const outcome = applyDedupDecisions(adapted, found.candidates, llmDecisions);
                if (outcome.kind === 'definite-dupe') {
                    const group = ensureGroup(groups, subject.id, subject.text);
                    group.duplicates.push({
                        key: later.id,
                        text: later.text,
                        jaccard: outcome.jaccard ?? found.candidates[0].jaccard,
                        llmDecision: 'SAME',
                        reasoning: outcome.reasoning,
                    });
                    merged.add(later.id);
                }
                else if (outcome.kind === 'possibly-mergeable') {
                    uncertainCount += 1;
                    candidates.push({
                        leftKey: subject.id,
                        leftText: subject.text,
                        rightKey: later.id,
                        rightText: later.text,
                        jaccard: found.candidates[0].jaccard,
                        reasoning: outcome.reasoning,
                    });
                }
                // outcome.kind === 'new-canonical' → DIFFERENT verdict, skip.
            }
            else {
                // No LLM available — surface pair for review without auto-merging.
                // This preserves the "never silently merge" invariant.
                uncertainCount += 1;
                candidates.push({
                    leftKey: subject.id,
                    leftText: subject.text,
                    rightKey: later.id,
                    rightText: later.text,
                    jaccard: found.candidates[0].jaccard,
                });
            }
        }
    }
    const groupsArr = [...groups.values()];
    const summary = {
        scope: 'commitments',
        totalIn: filtered.length,
        groups: groupsArr.length,
        duplicates: groupsArr.reduce((n, g) => n + g.duplicates.length, 0),
        uncertain: uncertainCount,
    };
    const diff = formatBackgroundDedupDiff({
        summary,
        groups: groupsArr,
        candidates,
        dryRun: inputs.dryRun,
        since: inputs.since,
    });
    return { summary, groups: groupsArr, candidates, diff };
}
// ---------------------------------------------------------------------------
// Scope: decisions + learnings (memory sections)
// ---------------------------------------------------------------------------
/**
 * Pairwise dedup within a memory file (decisions.md or learnings.md).
 *
 * Pipeline:
 *   1. Filter by `--since` on section.date.
 *   2. For every ordered (earlier, later) pair where topics overlap (or
 *      both lack topics), compute Jaccard over the normalized body.
 *   3. Pairs with Jaccard ≥ floor → surface as candidates. (LLM SAME
 *      could be added here in the future; for v2, memory dedup is
 *      surface-only to preserve the user's editorial intent.)
 *
 * Conservative — never auto-merges sections. The CLI's `--apply` path
 * for these scopes writes the diff and leaves the merge as a user
 * action (per plan v2 §"Non-goals" — memory dedup is editorial, not
 * mechanical).
 */
async function runMemorySectionsScope(inputs) {
    if (!inputs.sections) {
        throw new Error(`scope='${inputs.scope}' requires \`sections\` input`);
    }
    const filtered = inputs.sections.filter((s) => {
        if (inputs.since && s.date && s.date.slice(0, 10) < inputs.since) {
            return false;
        }
        return true;
    });
    // Chronological order (older sections become canonicals).
    const ordered = [...filtered].sort((a, b) => {
        const ad = a.date ?? '';
        const bd = b.date ?? '';
        return ad.localeCompare(bd);
    });
    const candidates = [];
    const groups = new Map();
    const merged = new Set();
    for (let i = 0; i < ordered.length; i += 1) {
        const left = ordered[i];
        if (merged.has(left.title))
            continue;
        const leftNorm = normalizeMemoryText(left.body);
        const leftTokens = tokenizeForJaccard(leftNorm);
        if (leftTokens.size === 0)
            continue;
        const leftTopics = new Set(left.topics ?? []);
        for (let j = i + 1; j < ordered.length; j += 1) {
            const right = ordered[j];
            if (merged.has(right.title))
                continue;
            // Topic overlap gate: when BOTH sections declare topics, require
            // at least one shared topic; when either lacks topics, skip the
            // gate (don't penalize sparse legacy sections).
            const rightTopics = new Set(right.topics ?? []);
            if (leftTopics.size > 0 && rightTopics.size > 0) {
                let overlap = false;
                for (const t of leftTopics) {
                    if (rightTopics.has(t)) {
                        overlap = true;
                        break;
                    }
                }
                if (!overlap)
                    continue;
            }
            // Title-or-body Jaccard. Title match is a strong signal but body
            // similarity carries the decision.
            const rightNorm = normalizeMemoryText(right.body);
            const rightTokens = tokenizeForJaccard(rightNorm);
            if (rightTokens.size === 0)
                continue;
            const j_score = jaccardSimilarity(leftTokens, rightTokens);
            // Exact title match → high confidence; treat as merge group.
            // Title equality is itself a strong dedup signal for memory
            // sections (the writer keyed off the same concept). Body Jaccard
            // need only clear a low floor (0.1) to rule out coincidental
            // title collisions on unrelated bodies.
            const exactTitle = normalizeTitle(left.title) === normalizeTitle(right.title);
            if (exactTitle && j_score >= 0.1) {
                const group = ensureGroup(groups, left.title, left.body.slice(0, 200));
                group.duplicates.push({
                    key: right.title,
                    text: right.body.slice(0, 200),
                    jaccard: j_score,
                });
                merged.add(right.title);
            }
            else if (j_score >= BACKGROUND_DEDUP_MEMORY_JACCARD_FLOOR) {
                candidates.push({
                    leftKey: left.title,
                    leftText: left.body.slice(0, 200),
                    rightKey: right.title,
                    rightText: right.body.slice(0, 200),
                    jaccard: j_score,
                });
            }
        }
    }
    const groupsArr = [...groups.values()];
    const summary = {
        scope: inputs.scope,
        totalIn: filtered.length,
        groups: groupsArr.length,
        duplicates: groupsArr.reduce((n, g) => n + g.duplicates.length, 0),
        uncertain: candidates.length,
    };
    const diff = formatBackgroundDedupDiff({
        summary,
        groups: groupsArr,
        candidates,
        dryRun: inputs.dryRun,
        since: inputs.since,
    });
    return { summary, groups: groupsArr, candidates, diff };
}
// ---------------------------------------------------------------------------
// Scope: topics
// ---------------------------------------------------------------------------
/**
 * Surface topic pages that overlap by aliases or body Jaccard. NEVER
 * auto-merges — user owns the topic wiki editorially. The diff is
 * advisory.
 *
 * Pipeline:
 *   1. Compute alias union per page (canonical + declared aliases).
 *   2. For every pair: if alias sets intersect → high-confidence surface.
 *      Else compute Jaccard over body; if ≥ floor → low-confidence surface.
 */
async function runTopicsScope(inputs) {
    if (!inputs.topics) {
        throw new Error("scope='topics' requires `topics` input");
    }
    // Filter by --since on last_refreshed.
    const filtered = inputs.topics.filter((t) => {
        if (inputs.since &&
            t.lastRefreshed &&
            t.lastRefreshed.slice(0, 10) < inputs.since) {
            return false;
        }
        return true;
    });
    // Build alias surfaces for each page (canonical + aliases, lowercased).
    const surfaces = filtered.map((t) => {
        const s = new Set();
        s.add(t.topicSlug.toLowerCase());
        for (const a of t.aliases)
            s.add(a.toLowerCase());
        return s;
    });
    const candidates = [];
    for (let i = 0; i < filtered.length; i += 1) {
        const left = filtered[i];
        const leftSurfaces = surfaces[i];
        const leftTokens = tokenizeForJaccard(normalizeMemoryText(left.body));
        for (let j = i + 1; j < filtered.length; j += 1) {
            const right = filtered[j];
            const rightSurfaces = surfaces[j];
            // Alias intersection — strong signal.
            let aliasOverlap = false;
            for (const s of leftSurfaces) {
                if (rightSurfaces.has(s)) {
                    aliasOverlap = true;
                    break;
                }
            }
            const rightTokens = tokenizeForJaccard(normalizeMemoryText(right.body));
            const j_score = leftTokens.size > 0 && rightTokens.size > 0
                ? jaccardSimilarity(leftTokens, rightTokens)
                : 0;
            if (aliasOverlap) {
                candidates.push({
                    leftKey: left.topicSlug,
                    leftText: left.body.slice(0, 200),
                    rightKey: right.topicSlug,
                    rightText: right.body.slice(0, 200),
                    jaccard: j_score,
                    reasoning: 'alias overlap',
                });
            }
            else if (j_score >= BACKGROUND_DEDUP_TOPICS_JACCARD_FLOOR) {
                candidates.push({
                    leftKey: left.topicSlug,
                    leftText: left.body.slice(0, 200),
                    rightKey: right.topicSlug,
                    rightText: right.body.slice(0, 200),
                    jaccard: j_score,
                });
            }
        }
    }
    // Topics never auto-group — always surface for review.
    const groups = [];
    const summary = {
        scope: 'topics',
        totalIn: filtered.length,
        groups: 0,
        duplicates: 0,
        uncertain: candidates.length,
    };
    const diff = formatBackgroundDedupDiff({
        summary,
        groups,
        candidates,
        dryRun: inputs.dryRun,
        since: inputs.since,
    });
    return { summary, groups, candidates, diff };
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ensureGroup(groups, canonicalKey, canonicalText) {
    const existing = groups.get(canonicalKey);
    if (existing)
        return existing;
    const fresh = {
        canonicalKey,
        canonicalText,
        duplicates: [],
    };
    groups.set(canonicalKey, fresh);
    return fresh;
}
/**
 * Normalize memory / topic body text for Jaccard comparison.
 *
 * Reuses the v2 commitment normalizer's lemmatization + arrow-strip
 * rules but applies them to a longer free-form text. The shared
 * tokenizer (`tokenizeForJaccard`) then drops short tokens.
 */
function normalizeMemoryText(body) {
    return normalizeCommitmentTextV2(body);
}
/**
 * Lightweight title normalization: lowercase, collapse whitespace,
 * strip trailing punctuation. NOT the v2 commitment normalizer — we
 * want title equality to be tighter than body similarity.
 */
function normalizeTitle(title) {
    return title
        .toLowerCase()
        .replace(/[.,;:!?]+$/, '')
        .replace(/\s+/g, ' ')
        .trim();
}
// ---------------------------------------------------------------------------
// Diff formatter
// ---------------------------------------------------------------------------
/**
 * Render a markdown diff describing the proposed dedup operation.
 * Stable output for stable inputs; suitable for committing as an audit
 * artifact under `dev/work/plans/.../dedup-diff-<scope>-<date>.md`.
 */
export function formatBackgroundDedupDiff(args) {
    const lines = [];
    const mode = args.dryRun ? 'dry-run' : 'apply';
    lines.push(`# Background dedup diff — scope=${args.summary.scope} (${mode})`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`- Scope: ${args.summary.scope}`);
    lines.push(`- Mode: ${mode}`);
    if (args.since)
        lines.push(`- Since: ${args.since}`);
    lines.push(`- Items considered: ${args.summary.totalIn}`);
    lines.push(`- Groups: ${args.summary.groups}`);
    lines.push(`- Duplicates to merge: ${args.summary.duplicates}`);
    lines.push(`- Pairs surfaced for review: ${args.summary.uncertain}`);
    lines.push('');
    if (args.groups.length > 0) {
        lines.push('## Confirmed groups');
        lines.push('');
        for (const g of args.groups) {
            lines.push(`### Canonical: ${truncate(g.canonicalKey, 64)}`);
            lines.push(`- Text: ${truncate(g.canonicalText, 200)}`);
            lines.push(`- Duplicates (${g.duplicates.length}):`);
            for (const d of g.duplicates) {
                const llm = d.llmDecision ? ` [LLM ${d.llmDecision}]` : '';
                const reasoning = d.reasoning ? ` — ${d.reasoning}` : '';
                lines.push(`  - ${truncate(d.key, 64)} (jaccard ${d.jaccard.toFixed(2)})${llm}${reasoning}`);
                lines.push(`    Text: ${truncate(d.text, 200)}`);
            }
            lines.push('');
        }
    }
    else {
        lines.push('## Confirmed groups');
        lines.push('');
        lines.push('_None — no confident duplicate groups found._');
        lines.push('');
    }
    if (args.candidates.length > 0) {
        lines.push('## Pairs surfaced for review');
        lines.push('');
        for (const p of args.candidates) {
            const reasoning = p.reasoning ? ` — ${p.reasoning}` : '';
            lines.push(`- ${truncate(p.leftKey, 48)} ⇄ ${truncate(p.rightKey, 48)} (jaccard ${p.jaccard.toFixed(2)})${reasoning}`);
            lines.push(`  - Left:  ${truncate(p.leftText, 200)}`);
            lines.push(`  - Right: ${truncate(p.rightText, 200)}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}
function truncate(s, n) {
    if (s.length <= n)
        return s;
    return `${s.slice(0, n - 1)}…`;
}
// ---------------------------------------------------------------------------
// Apply helpers — commitments scope
// ---------------------------------------------------------------------------
/**
 * Apply a commitments-scope dedup result to a commitments array,
 * returning the new array. PURE — does not write to disk. Caller is
 * responsible for wrapping the read/write cycle in
 * `services.commitments.withLock(...)` to prevent races with reactive
 * dedup running in `arete meeting extract`.
 *
 * Merge semantics (per AC2 / AC5):
 *   - Duplicates absorb into the canonical's `source_meetings[]` and
 *     `textVariants[]` (cap 5, oldest-first eviction).
 *   - Duplicates are removed from the output array.
 *   - Canonical's `status` stays unchanged. If any duplicate was
 *     `resolved` and the canonical is `open` (rare — we filter to open
 *     only), the canonical is left open; the resolution is treated as
 *     a duplicate-of-open and dropped (matches reactive semantics).
 *   - `id` of the canonical is preserved.
 *
 * Idempotency: re-running this with the same `result` produces the
 * same output array (duplicates are already absent on the second pass).
 */
export function applyCommitmentsDedup(commitments, result) {
    const byId = new Map();
    for (const c of commitments)
        byId.set(c.id, c);
    // Build a map of duplicate-id → canonical-id for fast lookup.
    const dupeToCanonical = new Map();
    const canonicalSourceMeetings = new Map();
    const canonicalTextVariants = new Map();
    for (const group of result.groups) {
        const canonical = byId.get(group.canonicalKey);
        if (!canonical)
            continue;
        const sm = new Set(canonical.source_meetings ?? []);
        if (canonical.source)
            sm.add(canonical.source);
        const tv = [...(canonical.textVariants ?? [canonical.text])];
        for (const dup of group.duplicates) {
            dupeToCanonical.set(dup.key, group.canonicalKey);
            const dupCommitment = byId.get(dup.key);
            if (!dupCommitment)
                continue;
            // Union source_meetings.
            if (dupCommitment.source_meetings) {
                for (const s of dupCommitment.source_meetings)
                    sm.add(s);
            }
            if (dupCommitment.source)
                sm.add(dupCommitment.source);
            // Append textVariant(s): start with the canonical text variant
            // (`dupCommitment.text`), then union any extra variants the
            // duplicate row carries. Each entry deduped against the existing
            // list to keep the variant set tight.
            if (!tv.includes(dupCommitment.text))
                tv.push(dupCommitment.text);
            if (dupCommitment.textVariants) {
                for (const v of dupCommitment.textVariants) {
                    if (!tv.includes(v))
                        tv.push(v);
                }
            }
        }
        // Cap textVariants at 5 (oldest-first eviction = drop from the front).
        while (tv.length > 5)
            tv.shift();
        canonicalSourceMeetings.set(group.canonicalKey, sm);
        canonicalTextVariants.set(group.canonicalKey, tv);
    }
    const out = [];
    for (const c of commitments) {
        if (dupeToCanonical.has(c.id))
            continue; // duplicate — skip
        const sm = canonicalSourceMeetings.get(c.id);
        const tv = canonicalTextVariants.get(c.id);
        if (sm || tv) {
            out.push({
                ...c,
                source_meetings: sm ? [...sm].sort() : c.source_meetings,
                textVariants: tv ?? c.textVariants,
            });
        }
        else {
            out.push(c);
        }
    }
    return out;
}
/**
 * I-6: collect the dupe→source provenance for each absorbed duplicate in a
 * commitments-scope dedup result, as MERGE log payloads ready to append to the
 * dedup-decisions log.
 *
 * `applyCommitmentsDedup` (above) is a pure transform that UNIONS each dupe's
 * `source_meetings` / `text` into the canonical and then discards the per-dupe
 * association — making "dupe X came from meeting Y with text Z" unrecoverable
 * from the resulting Commitment row. This helper captures that association from
 * the SAME inputs (the dupe's own commitment row, looked up by group key) at
 * merge time so it can be persisted durably.
 *
 * Each returned payload is a MERGE line whose `newId` is the dupe id, whose
 * `canonicalId` is the group canonical, and which carries `dupeSourceMeeting` +
 * `dupeText`. The unmerge wire-in (not yet built) rebuilds `DupeSourceMapping[]`
 * from these via `buildDupeSourceMapping` (dedup-explain.ts) so a 3+-source
 * `[[unmerge]]` peels the correct source instead of refusing with
 * `ambiguous-dupe`.
 *
 * A dupe's source meeting is `dupCommitment.source` if set, else the first of
 * its `source_meetings[]`. A dupe with no resolvable source is skipped (no
 * half-records — an incomplete mapping is useless to the resolver).
 *
 * Pure: no I/O. The CLI `--apply` path writes the returned payloads to the log.
 */
export function collectDupeProvenance(commitments, result) {
    const byId = new Map();
    for (const c of commitments)
        byId.set(c.id, c);
    const payloads = [];
    for (const group of result.groups) {
        if (!byId.has(group.canonicalKey))
            continue;
        for (const dup of group.duplicates) {
            const dupCommitment = byId.get(dup.key);
            if (!dupCommitment)
                continue;
            const sourceMeeting = dupCommitment.source ?? dupCommitment.source_meetings?.[0];
            if (!sourceMeeting)
                continue; // no resolvable source → skip (no half-record)
            payloads.push({
                decision: 'MERGE',
                newId: dup.key,
                canonicalId: group.canonicalKey,
                jaccard: dup.jaccard,
                llmTier: dup.llmDecision ? 'fast' : '-',
                llmDecision: dup.llmDecision ?? '-',
                reasoning: dup.reasoning ??
                    (dup.llmDecision === 'SAME' ? 'background-dedup merge' : 'text-hash exact match'),
                dupeSourceMeeting: sourceMeeting,
                dupeText: dupCommitment.text,
            });
        }
    }
    return payloads;
}
//# sourceMappingURL=background-dedup.js.map