/**
 * Attendee slug extraction utility — shared by momentum.ts and patterns.ts.
 *
 * Extracts person slugs from meeting frontmatter, supporting both
 * explicit `attendee_ids` slug lists and `attendees` name arrays.
 */
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
export declare function extractAttendeeSlugs(data: Record<string, unknown>): string[];
//# sourceMappingURL=attendees.d.ts.map