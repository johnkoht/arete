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
 * Canonicalize an `area:` value read from a user file: an alias maps to
 * its canonical slug, anything else passes through unchanged (including
 * unknown slugs — dangling refs are `arete areas check`'s job, not the
 * read path's). Apply at LOAD BOUNDARIES (where meetings/projects/
 * commitments/topic pages are parsed into memory) so every downstream
 * slug `===` join works on canonical values without per-join patches.
 */
export declare function canonicalizeAreaSlug(value: string | undefined, aliasMap: Map<string, string>): string | undefined;
/**
 * Build the alias → canonical-slug map by scanning `areas/*.md`
 * frontmatter only (no section/memory parsing — cheap enough to call
 * per operation without caching, which would risk staleness).
 *
 * Deterministic: areas are processed in slug order, first claim of an
 * alias wins and later collisions warn (a typo in one area file must
 * not break resolution everywhere — `arete areas check` surfaces
 * collisions loudly). An alias that shadows another area's canonical
 * slug is dropped: direct filename lookup always wins, so honoring it
 * anywhere would make joins disagree with resolution.
 */
export declare function loadAreaAliasMap(storage: StorageAdapter, workspaceRoot: string): Promise<Map<string, string>>;
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
     * Get parsed context for an area by slug or former slug (alias).
     *
     * Direct filename lookup first (the happy path is unchanged); on miss,
     * falls back to scanning areas for one whose `aliases:` include the
     * given slug. Callers that WRITE an area reference must persist the
     * returned context's `slug`, never their input — the input may be an
     * alias (compare via `context.slug !== areaSlug`).
     *
     * @param areaSlug - The area slug (filename without .md) or an alias
     * @returns AreaContext or null if not found
     */
    getAreaContext(areaSlug: string): Promise<AreaContext | null>;
    /**
     * Build the alias → canonical-slug map from all area files.
     * See {@link loadAreaAliasMap} for semantics.
     */
    getAliasMap(): Promise<Map<string, string>>;
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
     * 3. Keyword overlap (0.5-0.7): Jaccard similarity between meeting content and area's focus
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