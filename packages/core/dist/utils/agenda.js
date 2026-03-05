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
//# sourceMappingURL=agenda.js.map