/**
 * AreaParserService — parses area YAML frontmatter and provides meeting-to-area lookup.
 *
 * Areas are persistent work domains that accumulate intelligence across quarters.
 * Each area file (areas/*.md) has YAML frontmatter with recurring_meetings[] for mapping.
 *
 * Uses StorageAdapter for all file I/O (no direct fs calls).
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { AreaMatch, AreaContext, AreaMemory } from '../models/entities.js';
/** Confidence for exact recurring meeting title match. */
export declare const EXACT_TITLE_MATCH_CONFIDENCE = 1;
/** Confidence when area name appears in meeting title or summary. */
export declare const AREA_NAME_MATCH_CONFIDENCE = 0.8;
/** Maximum confidence for keyword overlap matches. */
export declare const KEYWORD_OVERLAP_MAX_CONFIDENCE = 0.7;
/** Minimum number of overlapping keywords required for a match. */
export declare const MINIMUM_KEYWORD_OVERLAP = 2;
/** Minimum confidence threshold; matches below this return null. */
export declare const SUGGESTION_THRESHOLD = 0.5;
/** Common stop words filtered from keyword matching. */
export declare const STOP_WORDS: Set<string>;
/**
 * Tokenize text with stop word filtering.
 * Lowercase, remove punctuation, split on whitespace, filter stop words.
 */
export declare function tokenizeWithStopWords(text: string): string[];
/**
 * Input for area suggestion based on meeting content.
 */
export interface SuggestAreaInput {
    title: string;
    summary?: string;
    transcript?: string;
}
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
     * Parse a memory.md file for an area.
     * Returns null if file doesn't exist.
     * Lenient: missing sections return empty arrays.
     */
    parseMemoryFile(areaSlug: string): Promise<AreaMemory | null>;
    /**
     * Parse a markdown section as a bullet list.
     * Case-insensitive matching. Returns null if section not found.
     * Logs warning for malformed sections (no error thrown).
     */
    private parseListSection;
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
    /**
     * Suggest an area for a meeting based on content matching.
     *
     * Matching algorithm (tries ALL methods, returns highest confidence):
     * 1. Exact title match (1.0): Meeting title matches a recurring_meetings[].title
     * 2. Area name match (0.8): Area name appears in meeting title OR summary
     * 3. Keyword overlap (0.5-0.7): Jaccard similarity between meeting content and area's currentState
     *
     * Returns null when:
     * - Input is empty/whitespace-only
     * - No matches found
     * - Highest confidence < SUGGESTION_THRESHOLD (0.5)
     *
     * @param input - Meeting title, summary, and/or transcript
     * @returns AreaMatch or null if no confident match
     */
    suggestAreaForMeeting(input: SuggestAreaInput): Promise<AreaMatch | null>;
}
//# sourceMappingURL=area-parser.d.ts.map