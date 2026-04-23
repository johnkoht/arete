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
/**
 * Get OPEN (unchecked) task items as simple strings, with `@tag(value)` metadata stripped.
 *
 * Used by meeting extract to dedup extracted action items against tasks
 * already tracked in `now/week.md` and `now/tasks.md`. Mirrors
 * getCompletedItems but filters to `- [ ]` and strips the `@area(...)`,
 * `@person(...)`, `@due(...)`, `@from(commitment:...)` metadata markers
 * so Jaccard matching operates on the semantic task text only.
 *
 * Differs from getUncheckedAgendaItems in that it strips metadata tags —
 * agendas don't typically carry them; task files do.
 *
 * @param content - Markdown content from week.md or tasks.md
 * @returns Array of open task texts (metadata stripped, whitespace normalized)
 */
export declare function getOpenTasks(content: string): string[];
//# sourceMappingURL=agenda.d.ts.map