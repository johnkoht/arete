/**
 * Agenda parsing utilities for extracting items from agenda markdown files.
 */
/**
 * Parse agenda items (checkboxes) from markdown content.
 * Extracts items in the format `- [ ] item` or `- [x] item`.
 *
 * @param content - Markdown content
 * @returns Array of parsed agenda items with their checked status
 */
export function parseAgendaItems(content) {
    const items = [];
    const lines = content.split('\n');
    let currentSection;
    for (const line of lines) {
        // Track section headers (## or ###)
        const sectionMatch = line.match(/^#{2,3}\s+(.+)$/);
        if (sectionMatch) {
            currentSection = sectionMatch[1].trim();
            continue;
        }
        // Match checkbox items: - [ ] or - [x] or - [X]
        const checkboxMatch = line.match(/^[\s]*-\s*\[([ xX])\]\s*(.+)$/);
        if (checkboxMatch) {
            const checked = checkboxMatch[1].toLowerCase() === 'x';
            const text = checkboxMatch[2].trim();
            items.push({
                text,
                checked,
                section: currentSection,
            });
        }
    }
    return items;
}
/**
 * Get unchecked agenda items as simple strings.
 *
 * @param content - Markdown content
 * @returns Array of unchecked item texts
 */
export function getUncheckedAgendaItems(content) {
    return parseAgendaItems(content)
        .filter(item => !item.checked)
        .map(item => item.text);
}
/**
 * Get completed (checked) items as simple strings.
 *
 * @param content - Markdown content
 * @returns Array of completed item texts
 */
export function getCompletedItems(content) {
    return parseAgendaItems(content)
        .filter(item => item.checked && item.text.length > 0)
        .map(item => item.text);
}
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
export function getOpenTasks(content) {
    return parseAgendaItems(content)
        .filter(item => !item.checked && item.text.length > 0)
        .map(item => stripTaskMetadata(item.text))
        .filter(text => text.length > 0);
}
/** Strip `@tag(value)` markers and normalize whitespace for Jaccard matching. */
function stripTaskMetadata(text) {
    return text
        .replace(/@[a-zA-Z]+\([^)]*\)/g, '')
        .trim()
        .replace(/\s+/g, ' ');
}
//# sourceMappingURL=agenda.js.map