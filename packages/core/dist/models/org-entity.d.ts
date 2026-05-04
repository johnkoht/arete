/**
 * Org-entity domain model: schema, pure renderer, pure parser.
 *
 * Org pages live at `.arete/memory/entities/orgs/<slug>.md`. Promotes
 * accounts/customers/vendors (Cover Whale, LEAP, Foxen, Snapsheet) from
 * ad-hoc topic slugs to first-class wiki entities.
 *
 * Auto-section pattern mirrors person memory: a sentinel-bracketed
 * region inside a user-editable file. The system regenerates content
 * inside `<!-- AUTO_ORG_MEMORY:START --> ... <!-- AUTO_ORG_MEMORY:END -->`;
 * everything outside is preserved verbatim across refresh.
 *
 * Phase 1 plan: dev/work/plans/arete-v2-chef-orchestrator/phase-1-wiki-expansion/plan.md §(b).
 */
export declare const AUTO_ORG_MEMORY_START = "<!-- AUTO_ORG_MEMORY:START -->";
export declare const AUTO_ORG_MEMORY_END = "<!-- AUTO_ORG_MEMORY:END -->";
export type OrgStatus = 'active' | 'dormant' | 'closed';
export interface OrgEntityFrontmatter {
    org_slug: string;
    status: OrgStatus;
    aliases?: string[];
    people?: string[];
    related_topics?: string[];
    first_seen: string;
    last_refreshed: string;
    /**
     * Source files (meeting paths today; later: inbox docs, slack threads)
     * whose attendees/content surfaced this org. Used for idempotency in
     * the writer.
     */
    sources_integrated?: string[];
}
export interface OrgEntity {
    frontmatter: OrgEntityFrontmatter;
    /**
     * Auto-generated body section between sentinels. Caller populates this
     * with markdown — the renderer wraps it in sentinels and an outer
     * preamble. Free-form prose outside the sentinels is the user's
     * domain and never touched by the writer.
     */
    autoSection: string;
}
/**
 * Render a fresh org-entity page (no prior file). Used for the
 * first-time write. Subsequent updates use `upsertOrgMemorySection` to
 * preserve user edits outside the sentinels.
 */
export declare function renderOrgEntityPage(org: OrgEntity): string;
/**
 * Parse an org-entity markdown file into the model shape. Returns
 * `null` if frontmatter is missing or malformed.
 *
 * The auto-section is whatever lives between the sentinels; if the
 * sentinels are absent, `autoSection` is the empty string.
 */
export declare function parseOrgEntityPage(content: string): OrgEntity | null;
/**
 * Extract the auto-generated org-memory section. Returns the trimmed
 * content between sentinels, or `null` if sentinels are absent / empty.
 */
export declare function extractOrgMemorySection(content: string): string | null;
/**
 * Insert or replace the auto-generated section in an org-entity file.
 * Same shape as `upsertPersonMemorySection` — preserves user-authored
 * content outside the sentinels verbatim.
 *
 * If sentinels are absent, the section is appended to the end of the
 * content (which lets a user pre-author a header / prose preamble before
 * the writer first runs).
 */
export declare function upsertOrgMemorySection(content: string, section: string): string;
//# sourceMappingURL=org-entity.d.ts.map