/**
 * Phase 10b-min wiring — bridge between `arete meeting extract` and the
 * pure pipeline modules.
 *
 * The pipeline primitives in `commitment-dedup-pipeline.ts`,
 * `commitment-dedup-extract.ts`, `commitment-dedup-reverse-stamp.ts`,
 * and `dedup-decisions-log.ts` are settled. They were left un-wired in
 * Phase 10b-min Step 2 because the CLI integration depends on:
 *
 *   1. A `CommitmentsService` handle with `withLock` access.
 *   2. Same-day staged item loading from OTHER meetings (slug → path
 *      resolution + section parsing).
 *   3. Slug-keyed `meetingSlug → meetingPath` resolution for the
 *      reverse-stamp step.
 *
 * This module is the mechanical glue. It is intentionally pure-ish:
 *   - Storage adapter for filesystem reads (slug listing + body reads).
 *   - LLM call function injected (so tests can mock without spinning up
 *     `AIService`).
 *   - `CommitmentsService.withLock` invocation owned here so the CLI
 *     just gets a result + a partial frontmatter patch.
 *
 * NO production data writes happen here — the CLI threads the returned
 * `skipReasonPatch` + `statusPatch` into the existing `writeWithLock`
 * call site that already owns the meeting file write.
 *
 * Reverse-stamp writes go through `applyReverseStamp`'s own
 * `writeWithLock` (against the canonical's meeting file). Best-effort
 * by contract.
 *
 * Critical invariants:
 *   - NO LLM calls outside the injected `callConcurrent`.
 *   - commitments.json read happens inside `withLock` so a concurrent
 *     extract can't decide "no canonical exists" while we're about to
 *     write one. F5 mitigation.
 *   - Same-day window only (Q4 deferred to soak per plan v2).
 */
import { type ExtractDedupDecision, type ExtractedItemForExtractDedup } from './commitment-dedup-extract.js';
import type { ExistingCommitmentForDedup, LLMCallConcurrentFn } from './commitment-dedup-pipeline.js';
import { commitmentToDedupInput } from './commitment-dedup-pipeline.js';
import type { CommitmentsService } from './commitments.js';
import type { StorageAdapter } from '../storage/adapter.js';
/**
 * Inputs the CLI hands to `wireExtractDedup`.
 *
 * `currentMeetingPath` is the absolute path to the meeting being
 * extracted; `currentMeetingSlug` is the slug derived from its filename
 * (no `.md` suffix). `meetingDate` is YYYY-MM-DD from the file's
 * frontmatter (caller already parses this for other purposes).
 */
export type WireExtractDedupInputs = {
    /** Workspace root (absolute path). */
    workspaceRoot: string;
    /** Absolute path to the meetings directory (resources/meetings). */
    meetingsDir: string;
    /** Absolute path to the meeting being extracted. */
    currentMeetingPath: string;
    /** Slug of the meeting being extracted (filename minus `.md`). */
    currentMeetingSlug: string;
    /** Meeting date YYYY-MM-DD (from current meeting frontmatter). */
    meetingDate: string;
    /** Extracted items from current meeting's LLM pass. */
    extractedItems: ReadonlyArray<ExtractedItemForExtractDedup>;
};
/**
 * Result returned by `wireExtractDedup`.
 *
 * `skipReasonPatch` + `statusPatch` are merge fragments — the CLI's
 * existing `writeWithLock` mutator overlays them onto the frontmatter
 * patch. Keys NOT present in these maps are preserved by the
 * partial-merge contract (followup-2 F2).
 *
 * `decisions` is the raw output (for logging / observability).
 * `reverseStampResults` is the per-canonical write outcome (whether
 * stamped or abstained, with reason).
 */
export type WireExtractDedupResult = {
    decisions: ExtractDedupDecision[];
    skipReasonPatch: Record<string, {
        reason: string;
        evidence: string;
        setBy: 'chef';
        setAt: string;
        /** Issue C: linkable matched-canonical text for the `[[…]]` skip render. */
        matchedRef?: string;
    }>;
    statusPatch: Record<string, 'skipped'>;
    reverseStampResults: Array<{
        canonicalMeetingPath: string;
        written: boolean;
        abstainReason?: string;
    }>;
};
/** Options that the CLI passes through (tier / dry-run / etc.). */
export type WireExtractDedupOptions = {
    /** LLM tier for the cross-check; defaults to 'fast'. */
    tier?: 'fast' | 'standard' | 'frontier';
    /** When true, skip the reverse-stamp + audit-log writes. */
    dryRun?: boolean;
};
/**
 * Load same-day staged items from OTHER meetings (excluding the
 * currently-extracting meeting). Reads only files whose filename
 * starts with the current `meetingDate` prefix.
 *
 * Each file is parsed for staged sections + sibling status maps.
 * Items whose status is `'skipped'` are dropped (they were already
 * skipped on a prior extract; treating them as candidates would
 * resurface skipped canonicals).
 *
 * The returned items are keyed by `<slug>::<itemId>` to preserve
 * cross-meeting attribution. The slug carries into the badge surface
 * via `meetingSlug` on the candidate.
 *
 * Exported for tests.
 */
export declare function loadSameDayStagedItems(storage: StorageAdapter, meetingsDir: string, meetingDate: string, excludeSlug: string): Promise<ExistingCommitmentForDedup[]>;
/**
 * Resolve a meeting slug to its absolute path under `meetingsDir`.
 *
 * Convention: `<slug>.md` directly under the meetings directory.
 * Returns `null` if the file doesn't exist (caller decides what to do).
 *
 * Exported for tests.
 */
export declare function resolveMeetingSlugToPath(storage: StorageAdapter, meetingsDir: string, slug: string): Promise<string | null>;
/**
 * Wire the dedup pipeline into the extract flow.
 *
 * Steps:
 *   1. Acquire `commitments.withLock(...)`.
 *   2. Load same-day open commitments + same-day staged items from
 *      OTHER meetings (excluding current).
 *   3. Run the orchestrator → per-item decisions.
 *   4. Build skip_reason + status patches for definite-dupes.
 *   5. Release the lock.
 *   6. (Outside lock) Reverse-stamp each dupe's canonical meeting (best
 *      effort). Skipped in dry-run.
 *   7. (Outside lock) Append audit log lines (best effort). Skipped in
 *      dry-run.
 *
 * The CLI's existing `writeWithLock` call writes the staged sections +
 * frontmatter; it merges in `skipReasonPatch` + `statusPatch` returned
 * here.
 *
 * @param services - CLI services bundle (we need `storage`, `commitments`).
 * @param inputs - Meeting metadata + extracted items.
 * @param callConcurrent - LLM injection point.
 * @param options - Tier override + dry-run flag.
 */
export declare function wireExtractDedup(services: {
    storage: StorageAdapter;
    commitments: CommitmentsService;
}, inputs: WireExtractDedupInputs, callConcurrent: LLMCallConcurrentFn, options?: WireExtractDedupOptions): Promise<WireExtractDedupResult>;
/**
 * Adapt the CLI's `processed.filteredItems` (action items only) into the
 * orchestrator's input shape. The pipeline only dedups action items;
 * decisions and learnings have their own (existing) dedup paths.
 *
 * `processed.stagedItemOwner` is the per-item owner map; the adapter
 * uses owner + counterparty slugs as the seed for the person-slug
 * overlap gate. The `@<slug>` tokens in the item text are also picked
 * up by the pipeline's `buildPersonSlugSet`, so partial coverage is
 * OK at this layer.
 *
 * Exported for the CLI + tests.
 */
export declare function adaptFilteredItemsForDedup(filteredItems: ReadonlyArray<{
    id: string;
    text: string;
    type: 'action' | 'decision' | 'learning';
    ownerMeta?: {
        ownerSlug?: string;
        direction?: string;
        counterpartySlug?: string;
    };
}>): ExtractedItemForExtractDedup[];
export { commitmentToDedupInput };
//# sourceMappingURL=extract-dedup-wiring.d.ts.map