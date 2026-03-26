/**
 * Agenda parsing utilities for extracting items from agenda markdown files.
 */
export interface AgendaItem {
    text: string;
    checked: boolean;
    section?: string;
}
/**
 * Parse agenda items (checkboxes) from markdown content.
 * Extracts items in the format `- [ ] item` or `- [x] item`.
 *
 * @param content - Markdown content
 * @returns Array of parsed agenda items with their checked status
 */
export declare function parseAgendaItems(content: string): AgendaItem[];
/**
 * Get unchecked agenda items as simple strings.
 *
 * @param content - Markdown content
 * @returns Array of unchecked item texts
 */
export declare function getUncheckedAgendaItems(content: string): string[];
/**
 * Get completed (checked) items as simple strings.
 *
 * @param content - Markdown content
 * @returns Array of completed item texts
 */
export declare function getCompletedItems(content: string): string[];
//# sourceMappingURL=agenda.d.ts.map