/**
 * Phase 9 — Typed-mode brief assemblers.
 *
 * Pure file-system aggregation + structured search. NO LLM calls. NO
 * AIService injection. These helpers are consumed by IntelligenceService
 * to produce PersonBrief / ProjectBrief / AreaBrief / MeetingBrief.
 *
 * Composition order, per-mode caps, truncation markers, and source paths
 * all live here. Markdown rendering lives in `brief-formatters.ts`.
 *
 * Plan: `dev/work/plans/arete-v2-chef-orchestrator/phase-9-brief-primitive-restore/plan.md`
 * ACs: AC1, AC1a, AC2, AC3, AC4, AC4a-d, AC5, AC11
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { SearchProvider } from '../search/types.js';
import type { CommitmentsService } from './commitments.js';
import type { EntityService } from './entity.js';
import type { TopicMemoryService } from './topic-memory.js';
import type { AreaParserService } from './area-parser.js';
import type { AreaMemoryService } from './area-memory.js';
import type { WorkspacePaths, PersonBrief, ProjectBrief, AreaBrief, MeetingBrief, BriefSection } from '../models/index.js';
/** Global per-brief soft cap (characters). Matches old BRIEF_MAX_CONTEXT_CHARS. */
export declare const BRIEF_GLOBAL_CAP_CHARS = 12000;
/** Per-section caps (chars). v2 MC1 — mini-brief truncation drops tail. */
export declare const PER_SECTION_CAPS: Record<string, number>;
/** Per-mode wiki retrieval cap. Q6 in plan v3 — knock to 5 if too crowded. */
export declare const WIKI_RETRIEVAL_LIMIT = 7;
/** How many recent meetings to surface in --person and --project briefs. */
export declare const RECENT_MEETINGS_PER_PERSON = 10;
export declare const RECENT_MEETINGS_PER_PROJECT = 10;
/** How many group-overlap meetings to surface in --meeting brief. */
export declare const GROUP_OVERLAP_LIMIT = 3;
/** How many recent meetings per attendee within --meeting mini-brief. */
export declare const MEETING_MINIBRIEF_RECENT_LIMIT = 5;
interface ParsedFrontmatter {
    frontmatter: Record<string, unknown>;
    body: string;
}
export declare function parseFrontmatter(content: string): ParsedFrontmatter | null;
/** Workspace-relative path for source listing. */
export declare function relativeToRoot(absolutePath: string, root: string): string;
/** Extract YYYY-MM-DD from a meeting filename (e.g. "2026-04-29-john-lindsay-11.md"). */
export declare function extractDateFromMeetingPath(filePath: string): string | undefined;
/**
 * Read all meetings under resources/meetings/ once, parse frontmatter,
 * and return a bucketed map keyed by attendee slug (and by attendee name
 * lower-cased as fallback). Avoids O(attendees × meetings) re-reads.
 * Performance note: this implements MC6 from plan v2.
 */
export interface MeetingIndexEntry {
    path: string;
    date: string;
    title: string;
    attendeeIds: string[];
    attendeeNames: string[];
    area?: string;
    projectSlug?: string;
    /** First non-empty body excerpt (post-frontmatter heading or summary). */
    excerpt?: string;
}
export declare function loadMeetingIndex(storage: StorageAdapter, paths: WorkspacePaths): Promise<MeetingIndexEntry[]>;
/** Filter the meeting index to entries where `personSlug` or `personName` appear in attendees. */
export declare function meetingsForPerson(index: MeetingIndexEntry[], personSlug: string, personName: string): MeetingIndexEntry[];
/** Filter the meeting index by area frontmatter match. */
export declare function meetingsForArea(index: MeetingIndexEntry[], areaSlug: string): MeetingIndexEntry[];
/** Filter the meeting index by overlap with a group of attendee slugs. */
export declare function meetingsForGroup(index: MeetingIndexEntry[], groupSlugs: string[], excludePath?: string): MeetingIndexEntry[];
/**
 * Extract bullets from the `## Memory Highlights (Auto)` section of a person
 * file. Returns the bullets per sub-section (Asks/Concerns/Stances/etc.) in
 * the order they appear. Drops "None detected yet." placeholders cleanly
 * (AC1a v3 — no bleed of placeholder text into briefs).
 */
export interface MemoryHighlightsExtract {
    asks: string[];
    concerns: string[];
    stances: string[];
    actionItemsIOwe: string[];
    actionItemsTheyOwe: string[];
    relationshipHealth: string[];
}
export declare function extractMemoryHighlights(content: string): MemoryHighlightsExtract;
export interface WikiMatch {
    slug: string;
    area?: string;
    /** 1-line summary derived from bodyForContext. */
    summary: string;
    /** File path for sources. */
    path: string;
}
/**
 * Per-mode wiki retrieval. `retrieveRelevant()` is the primary path; when
 * `searchBackend === 'none'` we fall back to `listAll() + tokenizeSlug()`
 * alias-jaccard. AC5.
 */
export declare function retrieveWiki(topicMemory: TopicMemoryService, paths: WorkspacePaths, query: string, opts?: {
    limit?: number;
    area?: string;
}): Promise<WikiMatch[]>;
/** Cap a list of bullets by character budget. Returns the kept bullets +
 * a count of how many were truncated. Drops oldest first when index suggests
 * recency order isn't already enforced.
 */
export declare function capBulletsByChars(bullets: string[], capChars: number): {
    kept: string[];
    truncatedCount: number;
};
/**
 * Apply the global 12K cap to a list of sections — drops trailing sections
 * wholesale once budget exceeded. Returns the kept sections plus the
 * names of dropped sections (for the global truncation marker).
 */
export declare function capSectionsByGlobalChars(sections: BriefSection[], capChars: number): {
    kept: BriefSection[];
    droppedNames: string[];
};
export interface PersonBriefDeps {
    storage: StorageAdapter;
    entities: EntityService;
    commitments: CommitmentsService;
    topicMemory: TopicMemoryService;
    areaParser: AreaParserService;
}
/**
 * Assemble a PersonBrief — pure aggregator.
 * AC1 / AC1a.
 */
export declare function assembleBriefForPerson(slug: string, paths: WorkspacePaths, deps: PersonBriefDeps): Promise<PersonBrief>;
export interface ProjectBriefDeps {
    storage: StorageAdapter;
    commitments: CommitmentsService;
    topicMemory: TopicMemoryService;
    areaMemory: AreaMemoryService;
    entities: EntityService;
}
/** Assemble a ProjectBrief — pure aggregator. AC2. */
export declare function assembleBriefForProject(slug: string, paths: WorkspacePaths, deps: ProjectBriefDeps): Promise<ProjectBrief>;
export interface AreaBriefDeps {
    storage: StorageAdapter;
    commitments: CommitmentsService;
    topicMemory: TopicMemoryService;
    areaParser: AreaParserService;
}
/** Assemble an AreaBrief — pure aggregator. AC3. */
export declare function assembleBriefForArea(slug: string, paths: WorkspacePaths, deps: AreaBriefDeps): Promise<AreaBrief>;
export interface MeetingBriefDeps {
    storage: StorageAdapter;
    commitments: CommitmentsService;
    topicMemory: TopicMemoryService;
    areaMemory: AreaMemoryService;
    areaParser: AreaParserService;
    entities: EntityService;
    searchProvider?: SearchProvider;
}
export interface MeetingBriefOptions {
    /** Pin project context — skips area inference. AC4a. */
    projectOverride?: string;
    /** Calendar events fetched by caller (optional — when absent, we skip calendar resolution). */
    calendarEvents?: Array<{
        title: string;
        date?: string;
        attendees?: string[];
    }>;
}
/**
 * Resolve the meeting input string to a meeting file path or, failing that,
 * to a calendar event. Returns null when nothing resolved (AC4d path).
 *
 * Precedence (v3 — M1 sharpened):
 *  - Inputs matching `^\d{4}-\d{2}-\d{2}-` regex try slug match first, then
 *    agenda match, then calendar match.
 *  - Inputs NOT matching that regex (free-text titles) skip the slug-match
 *    path entirely and go directly to calendar + agenda match.
 */
export declare function resolveMeetingInput(input: string, paths: WorkspacePaths, storage: StorageAdapter, index: MeetingIndexEntry[], calendarEvents?: Array<{
    title: string;
    date?: string;
    attendees?: string[];
}>): Promise<{
    kind: 'meeting-file';
    entry: MeetingIndexEntry;
    content: string;
} | {
    kind: 'calendar';
    event: {
        title: string;
        date?: string;
        attendees?: string[];
    };
} | {
    kind: 'unresolved';
}>;
/** Assemble a MeetingBrief — pure aggregator. AC4 / AC4a / AC4b / AC4c / AC4d. */
export declare function assembleBriefForMeeting(input: string, paths: WorkspacePaths, deps: MeetingBriefDeps, opts?: MeetingBriefOptions): Promise<MeetingBrief>;
export {};
//# sourceMappingURL=brief-assemblers.d.ts.map