/**
 * Meeting context service — assembles context bundles for meeting files.
 *
 * Provides a single function `buildMeetingContext(meetingPath, options)` that:
 * 1. Reads meeting file (title, date, attendees, transcript)
 * 2. Finds linked agenda (via frontmatter or fuzzy match)
 * 3. Resolves attendees to person profiles with stances/openItems
 * 4. Gathers related workspace context via brief service
 *
 * Used by `arete meeting context <file>` CLI command.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths, AreaContext } from '../models/index.js';
import type { IntelligenceService } from './intelligence.js';
import type { EntityService } from './entity.js';
import { AreaParserService } from './area-parser.js';
import type { AgendaItem } from '../utils/agenda.js';
import { TopicMemoryService } from './topic-memory.js';
export type { AgendaItem } from '../utils/agenda.js';
/**
 * Resolved attendee with full person context.
 */
export interface ResolvedAttendee {
    slug: string;
    email: string;
    name: string;
    category: string;
    profile: string;
    stances: string[];
    openItems: string[];
    recentMeetings: string[];
}
/**
 * Unknown attendee not found in people directory.
 */
export interface UnknownAttendee {
    email: string;
    name: string;
}
/**
 * Related context from brief service.
 */
export interface RelatedContext {
    goals: Array<{
        slug: string;
        title: string;
        summary: string;
    }>;
    projects: Array<{
        slug: string;
        title: string;
        summary: string;
    }>;
    recentDecisions: string[];
    recentLearnings: string[];
}
/**
 * Agenda candidate for user selection when no auto-match found.
 */
export interface AgendaCandidate {
    path: string;
    meetingTitle?: string;
    score: number;
}
/**
 * Complete meeting context bundle.
 */
export interface MeetingContextBundle {
    meeting: {
        path: string;
        title: string;
        date: string;
        attendees: string[];
        transcript: string;
    };
    agenda: {
        path: string;
        items: AgendaItem[];
        unchecked: string[];
    } | null;
    /** Metadata about agenda matching for skill-level prompting */
    agendaMatch?: {
        matchType: 'exact' | 'fuzzy' | 'none';
        confidence: number;
        /** Candidate agendas for user selection when no auto-match */
        candidates: AgendaCandidate[];
    };
    attendees: ResolvedAttendee[];
    unknownAttendees: UnknownAttendee[];
    relatedContext: RelatedContext;
    areaContext?: AreaContext | null;
    warnings: string[];
    /**
     * Existing open tasks from now/week.md and now/tasks.md.
     * Included so the extraction LLM can avoid re-proposing already-tracked tasks.
     * Cap at 20 items to avoid bloating the prompt.
     */
    existingTasks?: string[];
    /**
     * Topic-wiki context for delta-only extraction.
     *
     * For each topic detected lexically in the transcript, this carries the
     * pre-rendered wiki sections plus recent topic-tagged L2 memory entries.
     * The extraction LLM uses this so it emits only deltas (new decisions,
     * changed scope, raised gaps) rather than re-extracting captured content.
     *
     * Undefined when no topics are detected. The detected slugs are also
     * the natural input for `activeTopicSlugs` in the extraction prompt.
     */
    topicWikiContext?: {
        detectedTopics: Array<{
            slug: string;
            sections: string;
            l2Excerpts: string[];
            /**
             * `last_refreshed` from the topic page frontmatter (wiki-repair
             * W5): retrieval surfaces must show page age instead of serving a
             * frozen page as current.
             */
            lastRefreshed?: string;
            /** True when `last_refreshed` is more than 60 days old (or unparseable). */
            stale?: boolean;
        }>;
    };
}
/**
 * Deserialize a `MeetingContextBundle` from a parsed `--context` payload
 * (single_pass W2 / S5).
 *
 * The previous CLI reader hand-copied only 6 fields, silently dropping
 * `areaContext`, `existingTasks`, and `topicWikiContext` — the three
 * highest-value blocks (delta/supersession, week.md dedup, area calibration).
 * That re-enumeration is the bug and would rot again on the next bundle field.
 * This carries the WHOLE object (minus the response wrapper) so every present
 * field — including future ones — survives the JSON boundary the backend never
 * crossed.
 *
 * S5 hardening: `--context` is an arbitrary file/stdin payload, and W1 made
 * extraction fail-loud — an unchecked cast of a malformed nested block (e.g.
 * `topicWikiContext.detectedTopics` not an array) would throw INSIDE
 * extraction. So:
 *   - the required `meeting` field is validated (throws a clear error if
 *     missing/malformed — this is a genuine bad payload, not a degradable block);
 *   - optional blocks the prompt builder INDEXES are shape-guarded and a
 *     malformed one degrades to absent (drop the block) rather than throwing.
 *
 * Accepts both the wrapped form (`{success:true, ...bundle}` from
 * `arete meeting context --json`) and a direct bundle object. Strips `success`
 * and a top-level `error` wrapper key.
 *
 * @throws Error when `meeting` is missing or not an object (a bad payload).
 */
export declare function deserializeContextBundle(parsed: Record<string, unknown>): MeetingContextBundle;
/**
 * Options for building meeting context.
 */
export interface BuildMeetingContextOptions {
    /** Skip agenda lookup entirely. */
    skipAgenda?: boolean;
    /** Skip attendee resolution. */
    skipPeople?: boolean;
    /**
     * Pin the "current date" used for the recent-meeting recency window
     * (defaults to wall-clock now). Surfaced for deterministic testing so the
     * 60-day cutoff can be anchored relative to fixture dates rather than `Date.now()`.
     */
    referenceDate?: Date;
}
/**
 * Dependencies for buildMeetingContext (DI pattern).
 */
export interface MeetingContextDeps {
    storage: StorageAdapter;
    intelligence: IntelligenceService;
    entity: EntityService;
    paths: WorkspacePaths;
    areaParser?: AreaParserService;
    /**
     * Topic memory service — required for the topic-wiki context step.
     *
     * `createServices()` already wires this. Tests that don't exercise the
     * topic-wiki path should provide a stub whose `listAll(paths)` returns
     * `{ topics: [], errors: [] }` (causing the wiki step to no-op).
     */
    topicMemory: TopicMemoryService;
}
export interface ParsedMeetingFrontmatter {
    title: string;
    date: string;
    attendees: Array<{
        name: string;
        email: string;
    }>;
    attendee_ids?: string[];
    agenda?: string;
    area?: string;
    /** Slugified topic keywords extracted from meeting intelligence. */
    topics?: string[];
    /** Count of open action items (pending + approved, not skipped). */
    open_action_items?: number;
    /** Count of action items where the user owes a counterparty. */
    my_commitments?: number;
    /** Count of action items where a counterparty owes the user. */
    their_commitments?: number;
    /** Count of staged decisions. */
    decisions_count?: number;
    /** Count of staged learnings. */
    learnings_count?: number;
}
export interface ParsedMeetingFile {
    frontmatter: ParsedMeetingFrontmatter;
    body: string;
}
/**
 * Parse meeting file frontmatter and body.
 */
declare function parseMeetingFile(content: string): ParsedMeetingFile | null;
/**
 * Calculate YYYY-MM-DD cutoff date string for 60 days before reference date.
 */
declare function calculateCutoffDateString(referenceDate: Date, daysBack?: number): string;
/**
 * Extract date prefix from meeting filename.
 * Returns null if filename doesn't match YYYY-MM-DD-*.md pattern.
 */
declare function extractDateFromFilename(filename: string): string | null;
/**
 * Find recent meetings for a person by scanning meeting files.
 *
 * @param referenceDate - Pin the "current date" for testability (defaults to now)
 */
declare function findRecentMeetings(storage: StorageAdapter, paths: WorkspacePaths, personSlug: string, personEmail: string, limit?: number, referenceDate?: Date): Promise<string[]>;
/**
 * Find recent meetings for multiple attendees in a single pass through meeting files.
 *
 * This batched version reads each meeting file once regardless of attendee count,
 * reducing file reads from O(A×N) to O(N) where A = attendees, N = meetings.
 *
 * @param storage - StorageAdapter for file access (DI pattern)
 * @param paths - WorkspacePaths for meetings directory location
 * @param attendees - Array of attendee slugs and emails to look up
 * @param limit - Maximum meetings to return per attendee (default 5)
 * @param referenceDate - Pin the "current date" for testability (defaults to now)
 * @returns Map<slug, titles[]> for ALL requested attendees (empty array if no meetings)
 */
declare function findRecentMeetingsForAttendees(storage: StorageAdapter, paths: WorkspacePaths, attendees: Array<{
    slug: string;
    email: string;
}>, limit?: number, referenceDate?: Date): Promise<Map<string, string[]>>;
/**
 * Build a complete context bundle for a meeting file.
 *
 * @param meetingPath - Absolute or relative path to the meeting file
 * @param deps - Dependencies (storage, intelligence, entity, paths)
 * @param options - Optional flags to skip agenda or people resolution
 * @returns MeetingContextBundle with all assembled context
 */
export declare function buildMeetingContext(meetingPath: string, deps: MeetingContextDeps, options?: BuildMeetingContextOptions): Promise<MeetingContextBundle>;
export { findRecentMeetings, findRecentMeetingsForAttendees, calculateCutoffDateString, extractDateFromFilename, parseMeetingFile, };
//# sourceMappingURL=meeting-context.d.ts.map