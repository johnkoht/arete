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

import { join } from 'node:path';

import {
  runExtractDedup,
  buildDupeSkipReasonEntries,
  buildDupeStatusEntries,
  type ExtractDedupDecision,
  type ExtractedItemForExtractDedup,
} from './commitment-dedup-extract.js';
import { applyReverseStamp } from './commitment-dedup-reverse-stamp.js';
import { appendDedupDecisionLogBatch } from './dedup-decisions-log.js';
import type {
  ExistingCommitmentForDedup,
  LLMCallConcurrentFn,
} from './commitment-dedup-pipeline.js';
import { commitmentToDedupInput } from './commitment-dedup-pipeline.js';
import type { CommitmentsService } from './commitments.js';
import type { StorageAdapter } from '../storage/adapter.js';
import type { CommitmentDirection } from '../models/index.js';
import {
  parseStagedSections,
  parseStagedItemStatus,
  parseStagedItemOwner,
} from '../integrations/staged-items.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Same-day staged item loader
// ---------------------------------------------------------------------------

/**
 * Pattern for `YYYY-MM-DD` prefix on a meeting filename.
 */
const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})/;

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
export async function loadSameDayStagedItems(
  storage: StorageAdapter,
  meetingsDir: string,
  meetingDate: string,
  excludeSlug: string,
): Promise<ExistingCommitmentForDedup[]> {
  const out: ExistingCommitmentForDedup[] = [];
  const datePrefix = meetingDate.slice(0, 10);

  // List `.md` files under meetingsDir. Caller is responsible for the
  // directory existing; `storage.list` returns absolute paths.
  let files: string[];
  try {
    files = await storage.list(meetingsDir, { extensions: ['.md'] });
  } catch {
    // Best-effort: if meetingsDir is missing or unreadable, no candidates.
    return out;
  }

  for (const filePath of files) {
    const filename = filePath.split('/').pop() ?? '';
    // Date-prefix filter (cheap before any read).
    const m = filename.match(DATE_PREFIX_RE);
    if (!m) continue;
    if (m[1] !== datePrefix) continue;

    // Slug derivation: filename minus `.md`.
    const slug = filename.replace(/\.md$/, '');
    if (slug === excludeSlug) continue;

    const content = await storage.read(filePath);
    if (content === null) continue;

    // Parse staged sections from body + status / owner from frontmatter.
    // parseStagedSections takes the body; the status / owner parsers
    // accept the raw content (they re-extract frontmatter).
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    const body = fmMatch ? fmMatch[2] : content;

    const sections = parseStagedSections(body);
    const statusMap = parseStagedItemStatus(content);
    const ownerMap = parseStagedItemOwner(content);

    // We only care about action items for the commitment dedup pipeline.
    // Decisions and learnings have their own dedup paths.
    for (const item of sections.actionItems) {
      // Drop items the user / chef already skipped — they shouldn't
      // resurface as canonicals.
      if (statusMap[item.id] === 'skipped') continue;

      const ownerMeta = ownerMap[item.id];
      const rawDirection = ownerMeta?.direction ?? item.direction;
      if (!rawDirection) continue;
      // D7 (single-pass): `direction: none` items never participate in the
      // commitment domain — not as commitments, not as dedup canonicals.
      if (rawDirection !== 'i_owe_them' && rawDirection !== 'they_owe_me') continue;
      const direction: CommitmentDirection = rawDirection;

      const personSlugs: string[] = [];
      const ownerSlug = ownerMeta?.ownerSlug ?? item.ownerSlug;
      const counterpartySlug =
        ownerMeta?.counterpartySlug ?? item.counterpartySlug;
      if (ownerSlug) personSlugs.push(ownerSlug.toLowerCase());
      if (counterpartySlug) personSlugs.push(counterpartySlug.toLowerCase());

      out.push({
        id: `${slug}::${item.id}`,
        text: item.text,
        direction,
        personSlugs,
        meetingSlug: slug,
        date: datePrefix,
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Slug → path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a meeting slug to its absolute path under `meetingsDir`.
 *
 * Convention: `<slug>.md` directly under the meetings directory.
 * Returns `null` if the file doesn't exist (caller decides what to do).
 *
 * Exported for tests.
 */
export async function resolveMeetingSlugToPath(
  storage: StorageAdapter,
  meetingsDir: string,
  slug: string,
): Promise<string | null> {
  const candidate = join(meetingsDir, `${slug}.md`);
  const exists = await storage.exists(candidate);
  return exists ? candidate : null;
}

// ---------------------------------------------------------------------------
// Public API: wireExtractDedup
// ---------------------------------------------------------------------------

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
export async function wireExtractDedup(
  services: {
    storage: StorageAdapter;
    commitments: CommitmentsService;
  },
  inputs: WireExtractDedupInputs,
  callConcurrent: LLMCallConcurrentFn,
  options: WireExtractDedupOptions = {},
): Promise<WireExtractDedupResult> {
  const tier = options.tier ?? 'fast';

  // ── 1-4. Read + decide under the commitments lock ────────────────────────
  let decisions: ExtractDedupDecision[] = [];
  await services.commitments.withLock(async () => {
    // Load existing commitments INSIDE the lock so a concurrent extract
    // can't write a new canonical between our read + our skip_reason
    // decision (F5 mitigation).
    const existingCommitments = await services.commitments.listOpen();

    const sameDayStagedItems = await loadSameDayStagedItems(
      services.storage,
      inputs.meetingsDir,
      inputs.meetingDate,
      inputs.currentMeetingSlug,
    );

    decisions = await runExtractDedup(
      inputs.extractedItems,
      {
        existingCommitments,
        sameDayStagedItems,
        meetingDate: inputs.meetingDate,
        meetingSlug: inputs.currentMeetingSlug,
      },
      callConcurrent,
      { tier },
    );
  });

  // Build the frontmatter patches the CLI will merge into its
  // writeWithLock mutator.
  const nowIso = new Date().toISOString();
  const skipReasonPatch = buildDupeSkipReasonEntries(decisions, nowIso);
  const statusPatch = buildDupeStatusEntries(decisions);

  // ── 6. Reverse-stamp each canonical meeting (best-effort) ────────────────
  const reverseStampResults: WireExtractDedupResult['reverseStampResults'] = [];
  if (!options.dryRun) {
    const stampedSlugs = new Set<string>(); // de-dupe within this extract
    for (const d of decisions) {
      if (d.outcome.kind !== 'definite-dupe') continue;
      const canonicalSlug = d.outcome.canonical.meetingSlug;
      if (!canonicalSlug) continue;
      // Don't reverse-stamp our own meeting (defensive — shouldn't happen
      // because same-day candidates exclude current, but commitments.json
      // canonicals can carry the current meeting's slug if extract was
      // re-run after sync).
      if (canonicalSlug === inputs.currentMeetingSlug) continue;
      if (stampedSlugs.has(canonicalSlug)) continue;
      stampedSlugs.add(canonicalSlug);

      const canonicalPath = await resolveMeetingSlugToPath(
        services.storage,
        inputs.meetingsDir,
        canonicalSlug,
      );
      if (!canonicalPath) {
        reverseStampResults.push({
          canonicalMeetingPath: '',
          written: false,
          abstainReason: `slug-not-found: ${canonicalSlug}`,
        });
        continue;
      }

      // Extract the original item ID from the canonical id (which may
      // be a `<slug>::<itemId>` from a same-day staged item). When the
      // canonical is a real commitment, fall through with no itemId —
      // applyReverseStamp will append the marker at body end.
      const canonicalIdRaw = d.outcome.canonical.id;
      let canonicalItemId: string | undefined;
      const idSplit = canonicalIdRaw.split('::');
      if (idSplit.length === 2) {
        canonicalItemId = idSplit[1];
      }

      const result = await applyReverseStamp(services.storage, {
        canonicalMeetingPath: canonicalPath,
        canonicalItemId,
        newMeetingSlug: inputs.currentMeetingSlug,
        newMeetingDate: inputs.meetingDate,
      });
      reverseStampResults.push(result);
    }
  }

  // ── 7. Append audit log (best-effort; pipeline never throws) ─────────────
  if (!options.dryRun) {
    await appendDedupDecisionLogBatch(
      inputs.workspaceRoot,
      decisions,
      tier,
    );
  }

  return {
    decisions,
    skipReasonPatch,
    statusPatch,
    reverseStampResults,
  };
}

// ---------------------------------------------------------------------------
// Helper — adapt FilteredItem-like inputs to pipeline shape
// ---------------------------------------------------------------------------

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
export function adaptFilteredItemsForDedup(
  filteredItems: ReadonlyArray<{
    id: string;
    text: string;
    type: 'action' | 'decision' | 'learning';
    ownerMeta?: {
      ownerSlug?: string;
      direction?: string;
      counterpartySlug?: string;
    };
  }>,
): ExtractedItemForExtractDedup[] {
  const out: ExtractedItemForExtractDedup[] = [];
  for (const fi of filteredItems) {
    if (fi.type !== 'action') continue;
    const direction = fi.ownerMeta?.direction;
    if (direction !== 'i_owe_them' && direction !== 'they_owe_me') continue;
    const personSlugs: string[] = [];
    if (fi.ownerMeta?.ownerSlug) personSlugs.push(fi.ownerMeta.ownerSlug.toLowerCase());
    if (fi.ownerMeta?.counterpartySlug) personSlugs.push(fi.ownerMeta.counterpartySlug.toLowerCase());
    out.push({
      itemId: fi.id,
      text: fi.text,
      direction,
      personSlugs,
    });
  }
  return out;
}

// Re-export the adapter so `meeting.ts` can import everything from one place.
export { commitmentToDedupInput };
