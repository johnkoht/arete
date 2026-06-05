/**
 * Chef-skip directive parser (phase-10-followup-2 Step 6).
 *
 * Parses `[[unskip <id>]]` and `[[confirm-skip <id>]]` directives from
 * winddown view content and resolves them against meeting files in the
 * workspace.
 *
 * Pre-condition #2 from plan v3: Phase 10's `[[unmerge]]` directive is
 * specified but the parser does not yet exist. The phase-10-followup-2
 * parser built here IS the directive infrastructure for the project;
 * `[[unmerge]]` will follow this precedent (parser shape, meeting-file
 * resolver, audit log conventions).
 *
 * Both id-alone and slug-qualified forms are accepted from day 1 (PM C4):
 *
 *   [[unskip ai_0042]]                          -- id-alone
 *   [[unskip john-jamie-2026-06-04:ai_0042]]    -- slug-qualified
 *   [[confirm-skip ai_0099]]                    -- id-alone
 *   [[confirm-skip glance-2:ai_0099]]           -- slug-qualified
 *
 * Resolver scan strategy (F3 mitigation): scan meeting files in the
 * workspace where `staged_item_status` is non-empty (these are the
 * only files where unskip/confirm has any effect). Cap at N=50 most-
 * recent-mtime if the candidate list exceeds.
 *
 * Disambiguation rules:
 *   - id-alone matches 2+ → NO-OP, surface "ambiguous — please qualify"
 *   - id-alone matches 0 → NO-OP, surface "no match — may have already
 *     been processed"
 *   - slug-qualified → exact meeting file (no scan needed)
 */
import type { StorageAdapter } from '../storage/adapter.js';
export type ChefSkipDirectiveKind = 'unskip' | 'confirm-skip';
export interface ChefSkipDirective {
    kind: ChefSkipDirectiveKind;
    /** Item ID (e.g. 'ai_0042'). Always present. */
    id: string;
    /** Meeting slug qualifier — present only for slug-qualified forms. */
    slug: string | null;
    /** Raw matched text for audit purposes. */
    raw: string;
}
export interface ResolvedDirective extends ChefSkipDirective {
    /**
     * Resolution outcome:
     * - 'resolved': meetingPath set to an exact match.
     * - 'ambiguous': id-alone matched 2+ meetings; user must qualify.
     * - 'no-match': zero meetings have this id in staged_item_status.
     * - 'invalid-slug': slug-qualified but the slug doesn't exist or
     *   doesn't contain the id.
     */
    status: 'resolved' | 'ambiguous' | 'no-match' | 'invalid-slug';
    /** Absolute path to the meeting file when status='resolved'. */
    meetingPath: string | null;
    /** Candidate meeting paths when status='ambiguous'. */
    candidates: string[];
}
/**
 * Parse all `[[unskip <id>]]` and `[[confirm-skip <id>]]` directives from
 * winddown view content. Returns one entry per occurrence; duplicates are
 * preserved (caller may dedupe).
 */
export declare function parseChefSkipDirectives(content: string): ChefSkipDirective[];
export interface ResolveOptions {
    /** Absolute path to the workspace root (used to scan meetings dir). */
    workspaceRoot: string;
    /** Resources-relative path to meetings directory; defaults to
     *  `resources/meetings`. */
    meetingsDir?: string;
}
/**
 * Resolve a single directive to a meeting file path. Slug-qualified
 * directives skip the scan and resolve directly; id-alone directives
 * scan meeting files for ones with `staged_item_status` populated.
 *
 * Scan strategy (F3): we list meeting files, sort by mtime descending,
 * cap at MAX_CANDIDATE_SCAN, parse each one's frontmatter, keep those
 * with `staged_item_status[id]` defined. Returns 'ambiguous' if 2+ match.
 */
export declare function resolveChefSkipDirective(storage: StorageAdapter, directive: ChefSkipDirective, options: ResolveOptions): Promise<ResolvedDirective>;
/**
 * Build the human-readable error/info message for a directive that
 * didn't resolve cleanly. The caller surfaces this in the next winddown
 * view so the user can see why their directive didn't take effect.
 */
export declare function formatDirectiveStatusMessage(d: ResolvedDirective): string | null;
//# sourceMappingURL=chef-skip-directives.d.ts.map