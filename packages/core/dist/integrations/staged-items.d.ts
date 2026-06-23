/**
 * Staged item utilities for meeting triage.
 *
 * Parses and writes staged action items, decisions, and learnings sections
 * in meeting markdown files. All file I/O uses StorageAdapter.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { StagedItem, StagedItemEdits, StagedItemElevated, StagedItemOwner, StagedItemOwnerMeta, StagedItemSkipReason, StagedItemSkipReasonMeta, StagedItemStatus, StagedSections } from '../models/index.js';
export type { StagedItem, StagedItemEdits, StagedItemElevated, StagedItemOwner, StagedItemOwnerMeta, StagedItemSkipReason, StagedItemSkipReasonMeta, StagedItemStatus, StagedSections, };
/**
 * Generate a staged item ID.
 *
 * @param type   - Item type: 'ai' | 'de' | 'le'
 * @param index  - 1-based index within its section
 */
export declare function generateItemId(type: StagedItem['type'], index: number): string;
/**
 * Parse `## Staged Action Items`, `## Staged Decisions`, and
 * `## Staged Learnings` sections from meeting body markdown.
 *
 * - Case-insensitive header matching
 * - Returns empty arrays (never throws) if sections are missing
 * - Skips lines that don't match the `- <id>: <text>` pattern
 */
export declare function parseStagedSections(body: string): StagedSections;
/**
 * Parse `staged_item_status` from meeting file frontmatter.
 * Returns an empty object if the file has no frontmatter or the field is absent.
 */
export declare function parseStagedItemStatus(content: string): StagedItemStatus;
/**
 * Parse the `staged_item_elevated` frontmatter field (W4 / chef-holistic-reconcile
 * B-2). Map of item id → `true` for items the chef confidently keeps. Only
 * truthy entries are returned; any non-`true` value (including `false`, strings,
 * numbers) drops silently — presence-with-`true` is the only valid signal.
 *
 * Backward compat: returns `{}` for meeting files with no `staged_item_elevated`
 * field (every pre-W4 meeting has none).
 *
 * The renderer reads this → `[x]` pre-fill (B-1). The commit filter
 * (`commitApprovedItems`) NEVER reads it — elevation is not commit-readiness.
 */
export declare function parseStagedItemElevated(content: string): StagedItemElevated;
/**
 * Parse the `staged_item_edits` frontmatter field from raw markdown content.
 * Returns a map of item IDs to edited text strings.
 */
export declare function parseStagedItemEdits(content: string): StagedItemEdits;
/**
 * Parse the `staged_item_owner` frontmatter field from raw markdown content.
 * Returns a map of item IDs to owner metadata (ownerSlug, direction, counterpartySlug).
 */
export declare function parseStagedItemOwner(content: string): StagedItemOwner;
/**
 * Parse the `staged_item_skip_reason` frontmatter field from raw markdown content.
 * Returns a map of item IDs to skip-reason metadata.
 *
 * Phase 10 followup-2: chef may write a skip reason as a STRUCTURAL marker
 * that `commitApprovedItems` honors (via the `'skipped'` status filter on
 * the sibling `staged_item_status` field). The setBy union discriminates
 * provenance — see `StagedItemSkipReasonMeta` JSDoc.
 *
 * Backward compat: returns `{}` for meeting files with no
 * `staged_item_skip_reason` field (M3 first-ship — every pre-existing
 * meeting has no skip_reason).
 *
 * Malformed entries (missing required fields, wrong setBy union value)
 * drop silently. The `commitApprovedItems` consumer is shape-tolerant.
 */
export declare function parseStagedItemSkipReason(content: string): StagedItemSkipReason;
/**
 * Parse the `staged_item_importance` frontmatter field (single_pass D3).
 * Map of item id → importance tier. Entries with an unrecognized value drop.
 */
export declare function parseStagedItemImportance(content: string): Record<string, 'blocker' | 'high' | 'normal'>;
/**
 * Parse the `staged_item_uncertain` frontmatter field (single_pass D3, the ⚠
 * channel). Map of item id → uncertainty reason string. PRESENCE of an entry
 * (even an empty string) means the item is uncertain. Non-string entries drop.
 */
export declare function parseStagedItemUncertain(content: string): Record<string, string>;
/**
 * Parse the `staged_item_links` frontmatter field (single_pass D3).
 * Map of item id → `{ continuationOf?, supersedes? }`. Entries with no valid
 * string field drop.
 */
export declare function parseStagedItemLinks(content: string): Record<string, {
    continuationOf?: string;
    supersedes?: string;
}>;
export type WriteItemStatusOptions = {
    /** New status to set on the item */
    status: 'approved' | 'skipped' | 'pending';
    /** Optional edited text to store alongside the status */
    editedText?: string;
};
/**
 * Update `staged_item_status` (and optionally `staged_item_edits`) for a
 * single item in a meeting file's frontmatter.
 *
 * Uses read-parse-update-write to avoid corrupting other frontmatter fields.
 */
export declare function writeItemStatusToFile(storage: StorageAdapter, filePath: string, itemId: string, options: WriteItemStatusOptions): Promise<void>;
/**
 * Set `staged_item_elevated[itemId] = true` in a meeting file's frontmatter
 * (W4 / chef-holistic-reconcile B-2). The chef calls this for confident keeps
 * during the winddown reconcile pass.
 *
 * CRITICALLY does NOT touch `staged_item_status` — elevation is a render-only
 * pre-check signal, never commit-readiness. The item stays `'pending'` (or
 * unstatused) on disk; only the winddown apply checkbox-diff promotes a
 * left-checked item to `'approved'` (just before commit). This is what keeps a
 * stray `arete meeting approve` from silently committing an un-applied
 * elevation.
 *
 * Uses read-parse-update-write to avoid corrupting other frontmatter fields.
 */
export declare function writeItemElevatedToFile(storage: StorageAdapter, filePath: string, itemId: string): Promise<void>;
/**
 * Delete `staged_item_elevated[itemId]` from a meeting file's frontmatter
 * (W4 B-2, the `--remove` un-elevate / correction path). Inverse of
 * {@link writeItemElevatedToFile}.
 *
 * Like the setter, this NEVER touches `staged_item_status` — un-elevating
 * only drops the render-only pre-check, it does not change commit-readiness.
 *
 * Removing an absent id is a no-op (not an error): the caller's contract is
 * "ensure this id is not elevated", which already holds. When the map empties,
 * the `staged_item_elevated` key is dropped entirely to preserve the
 * legacy/clean post-edit frontmatter shape (matching the commit-filter
 * cleanup convention).
 *
 * Uses read-parse-update-write to avoid corrupting other frontmatter fields.
 */
export declare function removeItemElevatedFromFile(storage: StorageAdapter, filePath: string, itemId: string): Promise<void>;
export type WriteMeetingTopicsMode = 'set' | 'add' | 'remove';
export interface WriteMeetingTopicsResult {
    /** The `topics:` array after the merge (canonical post-write state). */
    topics: string[];
    /** True when the on-disk `topics:` value actually changed. */
    changed: boolean;
}
/**
 * Partial-merge a meeting file's `topics:` frontmatter field (CHR-W4 Piece 2).
 *
 * The chef's topic-review step calls this to CORRECT lexically-suggested
 * topics — add the obviously-right ones (e.g. `status-letter-automation`),
 * drop the wrong ones — via a deterministic surface instead of hand-editing
 * frontmatter (the elevate-verb lesson / eng-lead N-2).
 *
 * Modes:
 *  - `'set'`    → replace the whole `topics:` list with `slugs` (deduped,
 *                 order-preserving).
 *  - `'add'`    → union the existing list with `slugs` (existing order kept,
 *                 new slugs appended in input order, deduped).
 *  - `'remove'` → drop every slug in `slugs` from the existing list.
 *
 * Invariants:
 *  - Read-parse-update-write: every OTHER frontmatter field is preserved
 *    byte-for-faithful (same serializer the staged-item writers use). In
 *    particular this NEVER touches `staged_item_status`, `staged_item_elevated`,
 *    or any sibling staged-item map — topic assignment is orthogonal to
 *    item commit-readiness (AC: never touches status/elevated).
 *  - Slugs are trimmed; empty/blank slugs are ignored.
 *  - When the resulting list is EMPTY, the `topics:` key is dropped entirely
 *    (preserves the clean "no topics" frontmatter shape rather than leaving
 *    `topics: []`).
 *  - Idempotent: a `set`/`add`/`remove` that produces the same list as on
 *    disk writes nothing and returns `changed: false`.
 *
 * Throws when the file does not exist (caller resolves + validates first).
 */
export declare function writeMeetingTopicsToFile(storage: StorageAdapter, filePath: string, mode: WriteMeetingTopicsMode, slugs: string[]): Promise<WriteMeetingTopicsResult>;
/**
 * Metadata extracted from meeting frontmatter for memory file entries.
 */
export type MeetingMetadata = {
    /** Meeting title */
    title: string;
    /** Meeting date (YYYY-MM-DD) */
    date: string;
    /** Source string: "Meeting Title (Attendee1, Attendee2)" */
    source: string;
    /** Topic slugs associated with the meeting (defaults to []) */
    topics: string[];
};
/**
 * Per-item callback invoked once per approved item AFTER the meeting file
 * is written. Phase 0 instrumentation hook — callers plumb item-fate event
 * writes here without `commitApprovedItems` itself owning a storage-level
 * dependency on `MemoryLogService`.
 *
 * Errors thrown from the callback are caught internally by
 * `commitApprovedItems` and logged to stderr; the commit always completes
 * normally even if instrumentation fails. Callers may still wrap their
 * observers in try/catch as defense in depth, but it is no longer a
 * correctness requirement.
 */
export type ApprovedItemObserver = (item: ApprovedItemRecord) => Promise<void>;
export interface ApprovedItemRecord {
    /** Frontmatter id (e.g. `ai_001`, `de_002`, `le_003`). */
    id: string;
    /** Mapped to memory-log fate kinds: action_item / decision / learning. */
    kind: 'action_item' | 'decision' | 'learning';
    /** Final committed text (post-edits when `staged_item_edits` overrode). */
    text: string;
    /** Recorded confidence at extraction time, when known. */
    confidence: number | null;
}
/**
 * Per-skipped-item callback invoked once per skipped item AFTER the meeting
 * file is written. Phase 10 followup-2 AC9 / PM C3 instrumentation hook —
 * callers wire this to `appendChefSkipLog(..., { action: 'APPLY-SKIP', ... })`
 * to record the apply-time honoring of chef's skip signal.
 *
 * Errors thrown from the callback are caught internally; the commit always
 * completes normally even if instrumentation fails.
 */
export type SkippedItemObserver = (item: SkippedItemRecord) => Promise<void>;
export interface SkippedItemRecord {
    /** Frontmatter id (e.g. `ai_001`). */
    id: string;
    /** Skip reason text, if `staged_item_skip_reason[id]` was populated. */
    reason: string | null;
    /** Evidence reference, if `staged_item_skip_reason[id]` was populated. */
    evidence: string | null;
    /** Provenance, if `staged_item_skip_reason[id]` was populated. */
    setBy: 'chef' | 'chef-proposed' | 'user' | null;
}
export interface CommitApprovedItemsOptions {
    /** Phase 0 instrumentation. */
    onApproved?: ApprovedItemObserver;
    /**
     * Phase 10 followup-2 AC9: per-skipped-item callback. Receives one
     * SkippedItemRecord per `'skipped'`-status item dropped by the apply
     * filter. Callers typically wire this to `appendChefSkipLog` with
     * `action: 'APPLY-SKIP'`.
     */
    onSkipped?: SkippedItemObserver;
}
/**
 * Commit all approved staged items:
 *
 * 1. Collect approved item IDs from `staged_item_status`
 * 2. Cross-reference with parsed sections (use `staged_item_edits` text if available)
 * 3. Append approved decisions → `.arete/memory/items/decisions.md`
 *    Append approved learnings  → `.arete/memory/items/learnings.md`
 *    (Action items are NOT written to memory — they are task-tracking only)
 * 4. Strip all `## Staged *` sections (headers + their items) from the body
 * 5. Clear `staged_item_status` and `staged_item_edits` from frontmatter
 * 6. Set `status: 'approved'` and `approved_at: <ISO timestamp>` in frontmatter
 * 7. Write the cleaned meeting file back
 * 8. (Phase 0) Fire `options.onApproved` once per committed item.
 *    Observer failures are caught internally and logged to stderr — the
 *    commit always succeeds even if instrumentation throws.
 */
export declare function commitApprovedItems(storage: StorageAdapter, filePath: string, memoryDir: string, options?: CommitApprovedItemsOptions): Promise<void>;
//# sourceMappingURL=staged-items.d.ts.map