/**
 * Phase 10b-min — Step 2: Extract-time orchestration of the dedup pipeline.
 *
 * `runExtractDedup(...)` is the bridge between `arete meeting extract` and
 * the pure `commitment-dedup-pipeline` module. It owns:
 *
 *   - Lock acquisition on commitments.json (Phase 10a-pre withLock).
 *   - Loading existing commitments + same-day staged items from OTHER
 *     meetings (NOT last-7d in initial ship — Q4 deferred to soak).
 *   - Adapting each extracted ActionItem into the pipeline's input shape.
 *   - Invoking the pipeline once per item.
 *   - Returning a per-item decision map so the caller (CLI) can:
 *       - decorate staged sections with `↪ canonical in <slug>` badges,
 *       - emit `staged_item_skip_reason[id]` entries with setBy=`chef`,
 *         reason=`dupe_of_<canonical-id>`,
 *       - append dedup-decisions.log lines (Step 6),
 *       - reverse-stamp the canonical's meeting (Step 5).
 *
 * NO production data writes happen here directly — the caller writes
 * frontmatter / dist files / decisions log. This module purely
 * orchestrates the read + decision phase.
 *
 * Critical invariants:
 *   - LLM invocation goes through the caller-injected callConcurrent.
 *   - commitments.json read happens inside `withLock(...)` so a
 *     concurrent extract can't decide "no canonical exists" while we're
 *     about to write one. F5 mitigation.
 *   - Same-day window enforcement is done HERE (filter on `date`).
 */
import { runDedupPipeline, commitmentToDedupInput, } from './commitment-dedup-pipeline.js';
// ---------------------------------------------------------------------------
// runExtractDedup
// ---------------------------------------------------------------------------
/**
 * Filter `Commitment[]` to same-day rows + adapt into pipeline input
 * shape. Filter is on the `date` field (meeting date when the commitment
 * was first surfaced) — matches the "same-day window" semantics in plan
 * v2 third pass (Q4 deferred to soak).
 *
 * Open-only filter: a `resolved` or `dropped` commitment shouldn't
 * collide with a fresh extract (the user already closed it; let the new
 * one stand and surface as a re-open in winddown).
 *
 * Exported for the wire-in to share one filter.
 */
export function filterSameDayOpenCommitments(commitments, meetingDate) {
    const out = [];
    for (const c of commitments) {
        if (c.status !== 'open')
            continue;
        // Compare prefix YYYY-MM-DD only (commitment.date is YYYY-MM-DD).
        if (c.date.slice(0, 10) !== meetingDate.slice(0, 10))
            continue;
        out.push(commitmentToDedupInput(c));
    }
    return out;
}
/**
 * Orchestrate the dedup pipeline for a batch of extracted items.
 *
 * For each input item, runs the full pipeline and accumulates a
 * decision record. Caller invokes this exactly ONCE per `arete meeting
 * extract`. Inside, the LLM is invoked per-item (so K items × 1 LLM
 * call each). Per-pair batching is already baked into runDedupPipeline
 * — the LLM gets one prompt covering all candidates for a given item.
 *
 * F5 mitigation: the CALLER must wrap this invocation in
 * `commitments.withLock(async () => { ... })` so the
 * read-commitments-then-decide window is atomic against concurrent
 * extracts. This module does NOT call withLock itself because:
 *   1. It doesn't have a CommitmentsService handle.
 *   2. The CLI's lock scope is wider (includes the subsequent
 *      commitments.sync write).
 *
 * F1 mitigation: callConcurrent is invoked once per item, NOT once per
 * candidate pair (the pipeline batches candidates into a single prompt).
 * Serial K items × ~600ms (fast tier) ≈ K × 600ms total — for K=10
 * staged items, ≈6s. AC13 budget is ≤5s extra. If the caller wants
 * tighter, it can use Promise.all on multiple `runExtractDedup` calls
 * — but that's a CLI-layer concern, not this module's.
 *
 * @param extractedItems - Adapted ActionItems from the current meeting.
 * @param inputs - Commitments + same-day staged items + meeting metadata.
 * @param callConcurrent - LLM injection point.
 * @param options - Tier override (default 'fast'); abort-on-first-error
 *   (default false — collect all results even on partial failure).
 */
export async function runExtractDedup(extractedItems, inputs, callConcurrent, options = {}) {
    const tier = options.tier ?? 'fast';
    // Build the same-day open commitment pool ONCE per extract (eng MC6:
    // "read meetings dir once, bucket by attendee"). Same principle:
    // commitments.json read happens once; we filter to same-day open here.
    const sameDayCommitments = filterSameDayOpenCommitments(inputs.existingCommitments, inputs.meetingDate);
    // Union same-day open commitments + same-day staged items in OTHER
    // meetings. Per plan §"reactive dedup, same-day window only":
    //   "cross-references against commitments.json + same-day staged items
    //    in OTHER meetings (NOT last 7d in initial ship)"
    const existingPool = [
        ...sameDayCommitments,
        ...inputs.sameDayStagedItems,
    ];
    const decisions = [];
    for (const item of extractedItems) {
        const adapted = {
            id: item.itemId,
            text: item.text,
            direction: item.direction,
            personSlugs: item.personSlugs,
            meetingSlug: inputs.meetingSlug,
        };
        const { outcome, candidates, decisions: llmDecisions } = await runDedupPipeline(adapted, existingPool, callConcurrent, { tier, sameDay: true });
        decisions.push({
            itemId: item.itemId,
            itemText: item.text,
            direction: item.direction,
            outcome,
            candidates,
            llmDecisions,
        });
    }
    return decisions;
}
// ---------------------------------------------------------------------------
// Helpers — staged-section badge decoration
// ---------------------------------------------------------------------------
/**
 * Inject `↪ canonical in <slug>` badges into a rendered staged section
 * for items that the pipeline marked as `definite-dupe`. Also surfaces
 * `↪ possibly merges with <slug>` for `possibly-mergeable` (AC4a UI
 * surface).
 *
 * The current staged section format (from formatFilteredStagedSections):
 *   `- ai_001: Talk to Dave about staffing`
 *
 * After decoration:
 *   `- ai_001: Talk to Dave about staffing  ↪ canonical in <slug>`
 *
 * Idempotent against re-extraction: if a line already carries `↪`, it's
 * stripped + re-applied based on the current decision (so the badge
 * stays in sync with the latest pipeline verdict).
 *
 * @param stagedSections - The rendered markdown from
 *   `formatFilteredStagedSections`.
 * @param decisions - All per-item decisions from `runExtractDedup`.
 */
export function decorateStagedSectionsWithDupeBadges(stagedSections, decisions) {
    // Build a lookup: itemId → badge string (definite-dupe or possibly-merge).
    const badges = new Map();
    for (const d of decisions) {
        if (d.outcome.kind === 'definite-dupe') {
            const slug = d.outcome.canonical.meetingSlug || '(unknown)';
            badges.set(d.itemId, `↪ canonical in ${slug}`);
        }
        else if (d.outcome.kind === 'possibly-mergeable') {
            const slug = d.outcome.bestCandidate.meetingSlug || '(unknown)';
            badges.set(d.itemId, `↪ possibly merges with ${slug}`);
        }
    }
    // ALWAYS sweep lines, even when `badges` is empty — a re-extract may
    // need to STRIP a stale badge from a prior decision. The regex below
    // intentionally captures (and discards) any pre-existing ` ↪ ...`
    // suffix so the output is deterministic.
    const lines = stagedSections.split('\n');
    const out = [];
    for (const line of lines) {
        const m = line.match(/^(\s*-\s+)((?:ai|de|le)_\d+):\s+(.+?)(\s+↪\s+.*)?$/);
        if (!m) {
            out.push(line);
            continue;
        }
        const [, prefix, itemId, text] = m;
        const badge = badges.get(itemId);
        if (badge !== undefined) {
            out.push(`${prefix}${itemId}: ${text}  ${badge}`);
        }
        else {
            // No decision OR decision is new-canonical — preserve text (strip
            // any stale badge from a prior extract).
            out.push(`${prefix}${itemId}: ${text}`);
        }
    }
    return out.join('\n');
}
// ---------------------------------------------------------------------------
// Helpers — skip_reason payload for dupe items
// ---------------------------------------------------------------------------
/**
 * Build the `staged_item_skip_reason` entries for items marked as
 * `definite-dupe`. Caller merges these into the existing skip_reason
 * map written to frontmatter.
 *
 * Per plan §"Apply flow honors dupe status":
 *   - dupe items skip commitment write (canonical already wrote)
 *   - `staged_item_skip_reason[id]` carries `reason = "dupe_of_<canonical-id>"`
 *   - setBy = 'chef' (this is a definitive cross-meeting dedup decision)
 *
 * `possibly-mergeable` items do NOT get a skip_reason — they register as
 * new canonicals per AC4a. The "Possibly mergeable" surface is the
 * winddown's job, not the extract's.
 *
 * @param decisions - All per-item decisions.
 * @param nowIso - ISO timestamp (caller provides for testability).
 */
export function buildDupeSkipReasonEntries(decisions, nowIso) {
    const out = {};
    for (const d of decisions) {
        if (d.outcome.kind !== 'definite-dupe')
            continue;
        const canonicalId = d.outcome.canonical.id;
        const slug = d.outcome.canonical.meetingSlug || '(unknown)';
        const via = d.outcome.via;
        out[d.itemId] = {
            reason: `dupe_of_${canonicalId}`,
            evidence: `cross-meeting dedup ${via} (canonical in ${slug})`,
            setBy: 'chef',
            setAt: nowIso,
            // Issue C: the matched canonical's TEXT is the linkable target the
            // checklist renders as `— skip: already captured as [[<text>]]`, so
            // the user can verify the dupe is genuinely stored. Falls back to the
            // reason string in the renderer when absent.
            ...(d.outcome.canonical.text ? { matchedRef: d.outcome.canonical.text } : {}),
        };
    }
    return out;
}
// ---------------------------------------------------------------------------
// Helpers — staged status map for dupe items (skip on apply)
// ---------------------------------------------------------------------------
/**
 * Build the `staged_item_status` entries for items marked as `definite-dupe`.
 *
 * Sets them to `'skipped'` so `commitApprovedItems` filter drops them
 * (which renders into the "## Skipped on Apply" audit section thanks to
 * Phase 10 followup-2). Phase 10b-min stays consistent with that
 * contract — no new status value, no new sibling field. Just
 * `staged_item_status[id] = 'skipped'` + `skip_reason[id] = dupe_of_...`.
 */
export function buildDupeStatusEntries(decisions) {
    const out = {};
    for (const d of decisions) {
        if (d.outcome.kind === 'definite-dupe') {
            out[d.itemId] = 'skipped';
        }
    }
    return out;
}
//# sourceMappingURL=commitment-dedup-extract.js.map