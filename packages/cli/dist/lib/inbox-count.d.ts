/**
 * Shared inbox item counting logic.
 * Used by status and pull commands.
 */
export interface InboxCounts {
    unprocessed: number;
    needsReview: number;
}
/**
 * Count inbox items by status.
 * Parses frontmatter from .md files in the inbox/ directory.
 * Files without frontmatter or without a status field count as unprocessed.
 */
export declare function countInboxItems(inboxDir: string): InboxCounts;
//# sourceMappingURL=inbox-count.d.ts.map