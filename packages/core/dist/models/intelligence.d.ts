/**
 * Intelligence domain types.
 *
 * This is the ONLY model file that imports across domains.
 * It imports from: common, context, memory, entities, skills.
 */
import type { ProductPrimitive, WorkType } from './common.js';
import type { ContextBundle } from './context.js';
import type { MemoryResult, MemorySearchResult } from './memory.js';
import type { ResolvedEntity, EntityRelationship, Commitment } from './entities.js';
import type { SkillCandidate } from './skills.js';
import type { WorkspacePaths } from './workspace.js';
/** Request for assembling a briefing */
export type BriefingRequest = {
    task: string;
    paths: WorkspacePaths;
    skillName?: string;
    primitives?: ProductPrimitive[];
    workType?: WorkType;
    includeMemory?: boolean;
    includeEntities?: boolean;
    includeContext?: boolean;
};
/** Full primitive briefing (matches legacy assembleBriefing output) */
export type PrimitiveBriefing = {
    task: string;
    skill?: string;
    assembledAt: string;
    confidence: 'High' | 'Medium' | 'Low';
    context: ContextBundle;
    memory: MemorySearchResult;
    entities: ResolvedEntity[];
    relationships: EntityRelationship[];
    markdown: string;
};
/** Assembled briefing for a skill or task (simplified, used by prepareForSkill) */
export type Briefing = {
    task: string;
    context?: ContextBundle;
    memory?: MemoryResult[];
    entities?: ResolvedEntity[];
    assembledAt: string;
};
/** Skill context extends briefing with the matched skill */
export type SkillContext = Briefing & {
    skill: SkillCandidate;
};
/** Proactive suggestion from the intelligence layer */
export type Suggestion = {
    type: 'skill' | 'context' | 'memory' | 'entity';
    title: string;
    description: string;
    confidence: number;
    action?: string;
    metadata?: Record<string, unknown>;
};
/**
 * A single section of a brief, mode-agnostic.
 *
 * `heading` is the section's H2 (omitting the leading `##`).
 * `bullets` is a list of fully-rendered markdown bullet bodies (no leading
 *   `- `; the formatter adds it).
 * `truncated` is set when per-section cap dropped items; the formatter
 *   appends a section-level marker. `truncatedCount` (when known) tells the
 *   user how many items were dropped.
 */
export type BriefSection = {
    heading: string;
    bullets: string[];
    truncated?: boolean;
    truncatedCount?: number;
    /** Optional free-form body that renders before bullets (used for area memory excerpts, project README excerpts, etc.). */
    body?: string;
};
/**
 * Common envelope shared by every typed mode.
 *
 * `mode` discriminates the union members below.
 * `subject` is the displayable name (Person name, Project name, etc.).
 * `subjectSlug` is the slug used to query (may differ for `--meeting` where
 *   input was a free-text title).
 * `sections` is the ordered list of populated sections. Empty sections are
 *   dropped at assembly time (not included here).
 * `sources` is every workspace-relative file path the assembler read from.
 * `truncated` indicates the global 12K cap was hit and trailing sections
 *   were dropped wholesale (the formatter adds a global marker).
 */
export type BriefBase = {
    subject: string;
    subjectSlug: string;
    sections: BriefSection[];
    sources: string[];
    truncated: boolean;
    truncatedSections?: string[];
};
/** Person brief — pure aggregator output for `arete brief --person <slug>` */
export type PersonBrief = BriefBase & {
    mode: 'person';
    /** Display metadata (role/team/company) surfaced in the Subject section. */
    metadata: {
        role?: string;
        team?: string;
        company?: string;
        email?: string;
        category?: string;
    };
};
/** Project brief — `arete brief --project <slug>` */
export type ProjectBrief = BriefBase & {
    mode: 'project';
    metadata: {
        area?: string;
        status?: string;
        started?: string;
    };
};
/** Area brief — `arete brief --area <slug>` */
export type AreaBrief = BriefBase & {
    mode: 'area';
    metadata: {
        name: string;
        status?: string;
    };
};
/**
 * Mini-brief embedded in `--meeting` mode for each resolved attendee.
 * Composition order (M2 mitigation): highlights → recent → commitments → metadata.
 * Truncation drops the tail, never the load-bearing signal.
 */
export type AttendeeMiniBrief = {
    slug?: string;
    name: string;
    email?: string;
    resolved: boolean;
    highlights?: string[];
    recentMeetings?: Array<{
        title: string;
        date: string;
        path: string;
    }>;
    commitments?: Commitment[];
    role?: string;
};
/** Meeting brief — `arete brief --meeting <slug-or-title>` */
export type MeetingBrief = BriefBase & {
    mode: 'meeting';
    metadata: {
        title: string;
        date?: string;
        duration?: string;
        attendees: string[];
        resolved: boolean;
        /** AC4d marker — set when input matched no slug, agenda, or calendar event. */
        unresolved?: boolean;
        /** When --project override was used, holds the slug. */
        projectOverride?: string;
        /** When area was inferred via suggestAreaForMeeting (best-effort), confidence + slug. */
        inferredArea?: {
            slug: string;
            confidence: number;
        };
        explicitArea?: string;
    };
    attendeeMiniBriefs: AttendeeMiniBrief[];
};
/** Discriminated union for any typed brief mode. */
export type TypedBrief = PersonBrief | ProjectBrief | AreaBrief | MeetingBrief;
//# sourceMappingURL=intelligence.d.ts.map