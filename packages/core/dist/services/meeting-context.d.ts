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
    attendees: ResolvedAttendee[];
    unknownAttendees: UnknownAttendee[];
    relatedContext: RelatedContext;
    areaContext?: AreaContext | null;
    warnings: string[];
}
/**
 * Options for building meeting context.
 */
export interface BuildMeetingContextOptions {
    /** Skip agenda lookup entirely. */
    skipAgenda?: boolean;
    /** Skip attendee resolution. */
    skipPeople?: boolean;
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
}
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
export { findRecentMeetings, findRecentMeetingsForAttendees, calculateCutoffDateString, extractDateFromFilename, };
//# sourceMappingURL=meeting-context.d.ts.map