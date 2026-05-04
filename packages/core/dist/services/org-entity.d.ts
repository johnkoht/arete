/**
 * Org-entity service: auto-detect orgs from meeting attendees and
 * refresh org pages under `.arete/memory/entities/orgs/<slug>.md`.
 *
 * Phase 1 §b of the wiki expansion plan.
 *
 * Auto-detection heuristic (default):
 *   - Scan all meetings under resources/meetings/.
 *   - Group attendees by email domain.
 *   - Internal domains (default: ['reserv.com']) are skipped.
 *   - An org "qualifies" if it appears on ≥2 distinct meetings within a
 *     90-day window from `today`.
 *
 * Manual seeding (Phase 1 §b "manual" path) is the
 * `arete entity org create <slug>` CLI command — wired in commands/.
 *
 * The page is sentinel-bracketed: the writer regenerates only the auto
 * section (`<!-- AUTO_ORG_MEMORY:START -->` ... `<!-- AUTO_ORG_MEMORY:END -->`).
 * User-authored prose outside the sentinels is preserved.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths } from '../models/workspace.js';
/** Internal domains skipped by org auto-detection. */
export declare const DEFAULT_INTERNAL_DOMAINS: readonly string[];
/** Window for "appears on ≥2 distinct meetings" detection. */
export declare const DEFAULT_DETECTION_WINDOW_DAYS = 90;
/** Minimum distinct meetings within window for an org to qualify. */
export declare const DEFAULT_DETECTION_MIN_MEETINGS = 2;
export interface DetectOrgsOptions {
    /** Reference date (today). YYYY-MM-DD. Default: now. */
    today?: string;
    /**
     * Domain blocklist. Attendees with these domains never count toward
     * org detection. Default: `DEFAULT_INTERNAL_DOMAINS`.
     */
    internalDomains?: readonly string[];
    /** Day window. Default: 90. */
    windowDays?: number;
    /** Minimum distinct meeting count within window. Default: 2. */
    minMeetings?: number;
    /**
     * Cap the number of meetings scanned (for huge workspaces). When set,
     * the most recent N meeting files are scanned. Default: no cap.
     */
    maxMeetingsScanned?: number;
}
export interface DetectedOrg {
    /** Slug derived from the email domain (e.g., 'cover-whale.com' → 'cover-whale'). */
    slug: string;
    /** Email domain used for detection. */
    domain: string;
    /** Distinct meeting paths the org's attendees appeared on. */
    sources: string[];
    /** People (attendees) seen across these meetings — name strings. */
    peopleNames: string[];
    /** Earliest meeting date (YYYY-MM-DD). */
    firstSeen: string;
    /** Latest meeting date (YYYY-MM-DD). */
    lastSeen: string;
}
export interface RefreshOrgsOptions extends DetectOrgsOptions {
    /**
     * When true, do not write — return the planned actions only. Useful
     * for `arete wiki lint` and dry-run previews.
     */
    dryRun?: boolean;
}
export interface RefreshOrgsResult {
    detected: DetectedOrg[];
    /** Slugs whose pages were created or updated this run. */
    written: string[];
    /** Slugs whose pages were skipped because content was already fresh. */
    skipped: string[];
    warnings: string[];
}
/**
 * Scan meeting frontmatter and detect orgs that meet the threshold.
 * Pure-ish: reads via StorageAdapter, no clock reads inside (today is
 * injected).
 */
export declare function detectOrgsFromMeetings(paths: WorkspacePaths, storage: StorageAdapter, options?: DetectOrgsOptions): Promise<DetectedOrg[]>;
/**
 * Render the auto-section body for an org page. Pure; deterministic
 * for equal inputs.
 *
 * Shape (markdown bullets):
 *   - **Last seen on**: 2026-04-22
 *   - **Recent sources**: <list>
 *   - **People**: <list>
 *   - **Open meetings (last 90d)**: N
 */
export declare function renderOrgAutoSection(org: DetectedOrg, today: string): string;
/**
 * Auto-detect and refresh org pages in one pass.
 *
 * - Scans meetings, detects qualifying orgs.
 * - For each detected org:
 *    - If the page doesn't exist: render fresh from the org-entity model
 *      and write.
 *    - If the page exists: parse, update frontmatter (last_refreshed,
 *      sources_integrated, people, last_seen), then upsert the auto
 *      section in place (preserving user prose outside the sentinels).
 */
export declare function refreshOrgs(paths: WorkspacePaths, storage: StorageAdapter, options?: RefreshOrgsOptions): Promise<RefreshOrgsResult>;
/**
 * Manually create an org-entity page from a slug + optional metadata.
 * Used by `arete entity org create <slug>` (Phase 1 §b "manual" path)
 * for accounts that aren't detected via meeting attendees (e.g.,
 * partners discussed but never on calls).
 */
export declare function createOrgEntityManual(paths: WorkspacePaths, storage: StorageAdapter, input: {
    slug: string;
    today: string;
    aliases?: string[];
    relatedTopics?: string[];
    /** Free-form prose to set as the user-authored body (outside sentinels). */
    prose?: string;
}): Promise<{
    pagePath: string;
    created: boolean;
}>;
/**
 * Domain → slug. Strips the TLD and normalizes:
 *   cover-whale.com → cover-whale
 *   leap.legal      → leap
 *   foxen.io        → foxen
 *   acme.co.uk      → acme
 *
 * If the domain has only one segment (rare, but possible in test
 * fixtures), return it directly.
 */
export declare function slugifyDomain(domain: string): string;
//# sourceMappingURL=org-entity.d.ts.map