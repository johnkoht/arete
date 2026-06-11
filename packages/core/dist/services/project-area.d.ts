/**
 * Project area backfill helpers (Phase 12 AC2).
 *
 * `arete project backfill-area` support: list active projects with their
 * area-resolution status (reusing the AC1 priority parser), write the
 * `area:` + `area_set_by: backfill` provenance pair into a project README's
 * frontmatter, and selectively reset ONLY backfill-stamped areas.
 *
 * Frontmatter writes use the parse/serialize round-trip pattern from
 * `meeting-lock.ts` (yaml parse → mutate → stringify, body preserved).
 * No direct `fs` — all I/O through StorageAdapter (services invariant).
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths } from '../models/index.js';
/** One active project, annotated for the backfill flow. */
export interface ProjectBackfillCandidate {
    slug: string;
    /** Display title (frontmatter `name:`/`title:`/`project:` → slug). */
    title: string;
    readmePath: string;
    /** Resolved area per the AC1 priority parser (undefined = unresolved). */
    area?: string;
    /** Which signal resolved the area (frontmatter | prose). */
    areaSource?: 'frontmatter' | 'prose';
    /** Provenance marker (`manual` | `creation` | `backfill`). */
    areaSetBy?: string;
    /**
     * Inference text for `suggestAreaForMeeting`: README `## Background` +
     * `## Key Questions` section bodies (plan AC2). Empty string when neither
     * section exists.
     */
    inferenceSummary: string;
}
/**
 * Parse a project README into frontmatter map + body (yaml round-trip
 * input shape). Exported for the sibling topics writer (project-topics.ts)
 * so both Phase-12/14 README write surfaces share ONE parse.
 */
export declare function parseProjectReadme(content: string): {
    fm: Record<string, unknown>;
    body: string;
};
/**
 * List active projects annotated with area resolution + inference text.
 * Used by `arete project backfill-area` (preview, apply, reset).
 */
export declare function listProjectsForBackfill(storage: StorageAdapter, paths: WorkspacePaths): Promise<ProjectBackfillCandidate[]>;
/**
 * Write `area:` + `area_set_by:` into a project README's frontmatter,
 * preserving body and all other frontmatter keys (yaml round-trip).
 * Idempotent: same values → identical output content.
 */
export declare function applyAreaToProjectReadme(storage: StorageAdapter, readmePath: string, areaSlug: string, setBy?: 'backfill' | 'creation'): Promise<void>;
/**
 * Clear `area` + `area_set_by` ONLY on projects stamped
 * `area_set_by: backfill`. Creation/manual provenance is left intact
 * (AC2 `--reset` contract, mirrors `commitments backfill-area --reset`).
 */
export declare function resetBackfilledProjectAreas(storage: StorageAdapter, paths: WorkspacePaths): Promise<{
    reset: string[];
}>;
//# sourceMappingURL=project-area.d.ts.map