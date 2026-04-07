/**
 * Meeting manifest generator.
 *
 * Produces a single `resources/meetings/MANIFEST.md` that rolls up
 * frontmatter from all meetings within a rolling window (default 90 days).
 * Agents scan this one file instead of N individual meeting files.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths } from '../models/workspace.js';
/**
 * Generate (or refresh) the meeting manifest file.
 *
 * Reads all meeting files within the window, aggregates frontmatter stats,
 * groups by ISO week, and writes `resources/meetings/MANIFEST.md`.
 *
 * Missing frontmatter fields degrade gracefully — entries are omitted or
 * shortened, never thrown.
 */
export declare function generateMeetingManifest(workspacePaths: WorkspacePaths, storage: StorageAdapter, options?: {
    windowDays?: number;
}): Promise<{
    meetingCount: number;
}>;
//# sourceMappingURL=meeting-manifest.d.ts.map