/**
 * Convert text to a URL/filename-safe slug.
 *
 * Ported from scripts/integrations/utils.py
 */
export function slugify(text, maxLength = 50) {
    if (text == null || text === '') {
        return 'untitled';
    }
    // Convert to lowercase
    let slug = text.toLowerCase();
    // Replace spaces and underscores with hyphens
    slug = slug.replace(/[\s_]+/g, '-');
    // Remove non-alphanumeric characters (except hyphens)
    slug = slug.replace(/[^a-z0-9-]/g, '');
    // Collapse multiple hyphens
    slug = slug.replace(/-+/g, '-');
    // Remove leading/trailing hyphens
    slug = slug.replace(/^-+|-+$/g, '');
    // Truncate to max length (at word boundary if possible)
    if (slug.length > maxLength) {
        const truncated = slug.slice(0, maxLength);
        const lastHyphen = truncated.lastIndexOf('-');
        if (lastHyphen !== -1) {
            slug = truncated.slice(0, lastHyphen).replace(/-+$/, '');
        }
        else {
            slug = truncated;
        }
    }
    return slug || 'untitled';
}
//# sourceMappingURL=slugify.js.map