/**
 * Attendee slug extraction utility — shared by momentum.ts and patterns.ts.
 *
 * Extracts person slugs from meeting frontmatter, supporting both
 * explicit `attendee_ids` slug lists and `attendees` name arrays.
 */
/**
 * Slugify a person name: "Sarah Chen" → "sarah-chen"
 */
function slugifyName(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}
/**
 * Extract attendee slugs from meeting frontmatter data.
 *
 * Supports:
 *   attendee_ids: ['slug-a', 'slug-b']           (explicit slug list, preferred)
 *   attendees: [{name: 'John', email: '...'}]    (name-based → slugify)
 *   attendees: ['Name String']                    (plain string → slugify)
 *
 * Returns an empty array for null/undefined inputs or empty data.
 */
export function extractAttendeeSlugs(data) {
    const slugs = [];
    // Try attendee_ids first (explicit slug list)
    const attendeeIds = data['attendee_ids'];
    if (Array.isArray(attendeeIds)) {
        for (const id of attendeeIds) {
            if (typeof id === 'string' && id.trim()) {
                slugs.push(id.trim());
            }
        }
        if (slugs.length > 0)
            return slugs;
    }
    // Fall back to attendees array with name slugification
    const attendees = data['attendees'];
    if (Array.isArray(attendees)) {
        for (const a of attendees) {
            if (typeof a === 'string' && a.trim()) {
                slugs.push(slugifyName(a.trim()));
            }
            else if (a && typeof a === 'object') {
                const obj = a;
                const name = typeof obj['name'] === 'string' ? obj['name'] : '';
                if (name.trim()) {
                    slugs.push(slugifyName(name.trim()));
                }
            }
        }
    }
    return slugs;
}
//# sourceMappingURL=attendees.js.map