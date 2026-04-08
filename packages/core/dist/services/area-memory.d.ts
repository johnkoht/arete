/**
 * AreaMemoryService — computes and writes L3 area memory summaries.
 *
 * Follows the PersonMemoryRefresh pattern: reads existing L1/L2 data,
 * aggregates into a computed summary, writes to `.arete/memory/areas/{slug}.md`.
 *
 * All I/O via StorageAdapter — no direct fs imports.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { AreaParserService } from './area-parser.js';
import type { CommitmentsService } from './commitments.js';
import type { MemoryService } from './memory.js';
import type { WorkspacePaths } from '../models/index.js';
export type RefreshAreaMemoryOptions = {
    /** Refresh only this area slug. */
    areaSlug?: string;
    /** Preview without writing files. */
    dryRun?: boolean;
};
export type RefreshAreaMemoryResult = {
    /** Number of area memory files written/updated. */
    updated: number;
    /** Total areas scanned. */
    scannedAreas: number;
    /** Areas skipped (e.g., no data). */
    skipped: number;
};
export type CompactDecisionsOptions = {
    /** Compact decisions older than this many days. Default: 90. */
    olderThan?: number;
    /** Preview without writing/archiving. */
    dryRun?: boolean;
};
export type CompactDecisionsResult = {
    /** Number of decisions compacted. */
    compacted: number;
    /** Number of decisions preserved (too recent or unmatched). */
    preserved: number;
    /** Number of areas that received compacted summaries. */
    areasUpdated: number;
    /** Archive file path (if created). */
    archivePath?: string;
};
/**
 * Check if an area memory file is stale.
 */
export declare function isAreaMemoryStale(lastRefreshed: string | null, staleDays?: number): boolean;
export declare class AreaMemoryService {
    private readonly storage;
    private readonly areaParser;
    private readonly commitments;
    private readonly memory;
    constructor(storage: StorageAdapter, areaParser: AreaParserService, commitments: CommitmentsService, memory: MemoryService);
    /**
     * Refresh area memory for a single area.
     *
     * Reads area file, commitments, decisions, and meetings to compute
     * a summary written to `.arete/memory/areas/{slug}.md`.
     */
    refreshAreaMemory(areaSlug: string, workspacePaths: WorkspacePaths, options?: RefreshAreaMemoryOptions): Promise<boolean>;
    /**
     * Refresh area memory for all areas in the workspace.
     */
    refreshAllAreaMemory(workspacePaths: WorkspacePaths, options?: RefreshAreaMemoryOptions): Promise<RefreshAreaMemoryResult>;
    /**
     * Compact old decisions into area memory summaries.
     *
     * Decisions older than `olderThan` days are grouped by area,
     * added as compact summaries to area memory files, and the
     * originals are archived.
     */
    compactDecisions(workspacePaths: WorkspacePaths, options?: CompactDecisionsOptions): Promise<CompactDecisionsResult>;
    /**
     * Read the last_refreshed date from an area memory file.
     * Returns null if file doesn't exist or has no frontmatter.
     */
    getLastRefreshed(areaSlug: string, workspacePaths: WorkspacePaths): Promise<string | null>;
    /**
     * List all area memory files with staleness info.
     */
    listAreaMemoryStatus(workspacePaths: WorkspacePaths, staleDays?: number): Promise<Array<{
        slug: string;
        lastRefreshed: string | null;
        stale: boolean;
    }>>;
    private computeAreaData;
    /**
     * Single-pass scan of area-matched meeting files.
     *
     * Collects both recent attendee IDs (for active people) and topic aggregates
     * in one loop, avoiding the O(2N) double-scan that separate methods would cause.
     *
     * Matches meetings via BOTH frontmatter `area:` field AND recurring meeting
     * title match. People collection is limited to RECENT_DAYS; topics use all
     * matched meetings (stale exclusion applied at the end).
     */
    private scanAreaMeetings;
    /**
     * Get recently completed commitments for an area.
     */
    private getRecentlyCompleted;
    /**
     * Get recent decisions that match an area.
     */
    private getRecentDecisions;
    /**
     * Match a decision to an area based on keyword overlap.
     */
    private matchDecisionToArea;
}
//# sourceMappingURL=area-memory.d.ts.map