/**
 * Meeting parser — extracts action items from structured `## Action Items` sections.
 *
 * This module provides a pure function parser for action items written by the
 * meeting extraction skill. It parses arrow notation for direction and handles
 * YAML frontmatter for date extraction.
 *
 * Example input format (produced by arete meeting extract + user review):
 * ```markdown
 * ---
 * title: "Weekly Sync"
 * date: "2026-03-04"
 * ---
 *
 * ## Action Items
 *
 * - [ ] John to send API docs to Sarah by Friday (@john-smith → @sarah-chen)
 * - [x] Sarah to review the proposal (@sarah-chen → @mike-jones)
 * ```
 */
import type { ActionItemDirection } from './person-signals.js';
export type ParsedActionItem = {
    text: string;
    direction: ActionItemDirection;
    source: string;
    date: string;
    hash: string;
    stale: boolean;
    completed: boolean;
};
/**
 * Parse action items from a meeting file's ## Action Items section.
 *
 * This is the main export — a pure function with no I/O.
 *
 * @param content - Full meeting markdown content (including frontmatter)
 * @param personSlug - Filter to items where this person is owner OR counterparty
 * @param ownerSlug - The meeting owner's slug (used for direction inference in fallback)
 * @param source - Meeting filename (passed through to result)
 * @returns Array of parsed action items for this person, or empty array if no section
 */
export declare function parseActionItemsFromMeeting(content: string, personSlug: string, ownerSlug: string, source: string): ParsedActionItem[];
//# sourceMappingURL=meeting-parser.d.ts.map