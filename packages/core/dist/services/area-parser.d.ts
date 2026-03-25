/**
 * AreaParserService — parses area YAML frontmatter and provides meeting-to-area lookup.
 *
 * Areas are persistent work domains that accumulate intelligence across quarters.
 * Each area file (areas/*.md) has YAML frontmatter with recurring_meetings[] for mapping.
 *
 * Uses StorageAdapter for all file I/O (no direct fs calls).
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { AreaMatch, AreaContext } from '../models/entities.js';
/**
 * AreaParserService provides parsing and lookup for area files.
 *
 * @example
 * ```ts
 * const parser = new AreaParserService(storage, workspaceRoot);
 * const match = await parser.getAreaForMeeting('CoverWhale Sync');
 * // { areaSlug: 'glance-communications', matchType: 'recurring', confidence: 1.0 }
 *
 * const context = await parser.getAreaContext('glance-communications');
 * // { slug: 'glance-communications', name: 'Glance Communications', ... }
 * ```
 */
export declare class AreaParserService {
    private storage;
    private workspaceRoot;
    constructor(storage: StorageAdapter, workspaceRoot: string);
    /**
     * Get the areas directory path.
     */
    private get areasDir();
    /**
     * List all area files in the workspace.
     * Excludes template files (starting with _).
     */
    private listAreaFiles;
    /**
     * Parse a single area file into AreaContext.
     * Returns null if file not found or malformed.
     */
    parseAreaFile(filePath: string): Promise<AreaContext | null>;
    /**
     * Get area matching a meeting title.
     *
     * Uses case-insensitive substring matching against recurring_meetings[].title.
     * Returns null when no match found.
     * Returns highest-confidence match when multiple match (first match wins for equal confidence).
     *
     * @param meetingTitle - The meeting title to match
     * @returns AreaMatch or null if no match
     */
    getAreaForMeeting(meetingTitle: string): Promise<AreaMatch | null>;
    /**
     * Get parsed context for an area by slug.
     *
     * @param areaSlug - The area slug (filename without .md)
     * @returns AreaContext or null if not found
     */
    getAreaContext(areaSlug: string): Promise<AreaContext | null>;
    /**
     * List all areas in the workspace.
     *
     * @returns Array of AreaContext for all valid area files
     */
    listAreas(): Promise<AreaContext[]>;
}
//# sourceMappingURL=area-parser.d.ts.map