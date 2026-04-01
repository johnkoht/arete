/**
 * Staged item utilities for meeting triage.
 *
 * Parses and writes staged action items, decisions, and learnings sections
 * in meeting markdown files. All file I/O uses StorageAdapter.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { StagedItem, StagedItemEdits, StagedItemOwner, StagedItemOwnerMeta, StagedItemStatus, StagedSections } from '../models/index.js';
export type { StagedItem, StagedItemEdits, StagedItemOwner, StagedItemOwnerMeta, StagedItemStatus, StagedSections };
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
 * Parse the `staged_item_edits` frontmatter field from raw markdown content.
 * Returns a map of item IDs to edited text strings.
 */
export declare function parseStagedItemEdits(content: string): StagedItemEdits;
/**
 * Parse the `staged_item_owner` frontmatter field from raw markdown content.
 * Returns a map of item IDs to owner metadata (ownerSlug, direction, counterpartySlug).
 */
export declare function parseStagedItemOwner(content: string): StagedItemOwner;
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
 * Metadata extracted from meeting frontmatter for memory file entries.
 */
export type MeetingMetadata = {
    /** Meeting title */
    title: string;
    /** Meeting date (YYYY-MM-DD) */
    date: string;
    /** Source string: "Meeting Title (Attendee1, Attendee2)" */
    source: string;
};
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
 */
export declare function commitApprovedItems(storage: StorageAdapter, filePath: string, memoryDir: string): Promise<void>;
//# sourceMappingURL=staged-items.d.ts.map