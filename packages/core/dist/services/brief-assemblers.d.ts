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
import type { WorkspacePaths, PersonBrief, ProjectBrief, AreaBrief, MeetingBrief, BriefSection, Commitment } from '../models/index.js';
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
    /** Topic slugs from `topics:` frontmatter (June-style meetings carry these, no `area:`). */
    topics: string[];
    projectSlug?: string;
    /** First non-empty body excerpt (post-frontmatter heading or summary). */
    excerpt?: string;
}
export declare function loadMeetingIndex(storage: StorageAdapter, paths: WorkspacePaths): Promise<MeetingIndexEntry[]>;
/** Filter the meeting index to entries where `personSlug` or `personName` appear in attendees. */
export declare function meetingsForPerson(index: MeetingIndexEntry[], personSlug: string, personName: string): MeetingIndexEntry[];
/**
 * Filter the meeting index by area — explicit `area:` frontmatter wins
 * PER MEETING; the W6 topics-union arm survives only as a fallback for
 * meetings without one (Phase 13 AC1).
 *
 * A meeting WITH explicit `area:` matches only on `area:` — a topic
 * mention of another area no longer leaks it into that area's brief
 * (observed live failure mode (b)). A meeting WITHOUT `area:` falls back
 * to `topics:` membership (June-style meetings carry `topics:` lists and
 * no `area:` key — W6, review concern 7 — so area-only matching missed
 * them at both the project and area call sites).
 *
 * Documented trade-off (phase-13 review finding 1, R4-bounded): once a
 * meeting carries `area: X`, a topic mention of area Y no longer
 * surfaces it under Y — single primary area now, `areas:` plural is the
 * parked structural fix. Tested by the named exclusion fixture in
 * brief-project.test.ts.
 */
export declare function meetingsForArea(index: MeetingIndexEntry[], areaSlug: string): MeetingIndexEntry[];
/** Filter the meeting index by overlap with a group of attendee slugs. */
export declare function meetingsForGroup(index: MeetingIndexEntry[], groupSlugs: string[], excludePath?: string): MeetingIndexEntry[];
/** A group of discussion-topic questions under a `### Sub-heading`. */
export interface DiscussionTopicGroup {
    /** Sub-heading label, e.g. "Process & how we work together". */
    label: string;
    /** Verbatim bullet lines (without the leading "- "). */
    questions: string[];
}
/**
 * Extract the `## 1:1 Discussion Topics` section of a person file into its
 * `### sub-heading` groups, each with its verbatim question bullets. Drops
 * the leading italic helper line (`*Questions and ideas...*`). Returns []
 * when the section is absent. Pure string op.
 */
export declare function extractDiscussionTopics(content: string): DiscussionTopicGroup[];
/** A "Next 1:1 Focus" extract: the framing prose + the checkbox sweep items. */
export interface NextFocusExtract {
    /** First paragraph(s) of framing prose under the heading (capped). */
    framing?: string;
    /** Checkbox sweep items, verbatim (without the leading "- [ ] "/"- "). */
    sweepItems: string[];
}
/**
 * Extract the `## Next 1:1 Focus (...)` section of a person file: a short
 * framing prose lead-in plus the checkbox "sweep" items (each often carrying a
 * commitment id like `6a7f160f`). Returns undefined when the section is
 * absent. Pure string op.
 */
export declare function extractNextFocus(content: string): NextFocusExtract | undefined;
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
    /**
     * `last_refreshed` from the topic page frontmatter (wiki-repair W5 /
     * AC5). Surfaced on retrieval so briefs can show staleness instead of
     * serving a frozen page as if it were current.
     */
    lastRefreshed: string;
}
/** Days since `last_refreshed` after which a wiki page is labeled stale.
 * Mirrors `listTopicMemoryStatus`'s staleDays=60 (strict `>`). */
export declare const WIKI_STALE_DAYS = 60;
/**
 * Render the retrieval-surface staleness label for a wiki page:
 * `(as of 2026-04-24 — stale)` past WIKI_STALE_DAYS, `(as of 2026-06-01)`
 * otherwise. Unparseable dates render as stale — an unknown age must not
 * masquerade as fresh. Pure; `today` injectable for tests.
 */
export declare function wikiStalenessLabel(lastRefreshed: string, today?: Date): string;
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
/** Result of project-area resolution (Phase 12 AC1). */
export interface ProjectAreaResolution {
    area?: string;
    areaSetBy?: string;
    /** Which signal resolved the area. Absent when unresolved. */
    source?: 'frontmatter' | 'prose';
    /** R9: non-empty when frontmatter and prose disagree (frontmatter wins). */
    divergence?: string;
}
/**
 * Resolve a project's area from its README (Phase 12 AC1).
 *
 * Priority order (first hit wins):
 *  1. `fm.area` (covers both the older `{title,status,...}` and newer
 *     `{project,type,area}` schemas)
 *  2. `fm.areas` — future plural form, first entry tolerated (pre-mortem R4;
 *     plural support is NOT promoted here)
 *  3. Prose `**Area**:` line in the body (permissive — see PROSE_AREA_LINE)
 *  4. Unresolved
 *
 * R9: when frontmatter AND prose both resolve and disagree, frontmatter wins
 * and `divergence` carries a one-line warning for the brief to surface.
 */
export declare function resolveProjectArea(fm: Record<string, unknown>, body: string): ProjectAreaResolution;
/**
 * Project display name from README frontmatter — `name:` → `title:` →
 * `project:` → slug (W6.3: 0 of 7 live project READMEs use `name:`).
 */
export declare function projectDisplayName(fm: Record<string, unknown>, slug: string): string;
/**
 * Extract renderable status-update paragraphs from a `## Status Updates`
 * section body (Phase 13 AC8(7)).
 *
 * Live READMEs structure the section as dated `### YYYY-MM-DD` headings
 * followed by paragraphs. The old paragraph-split echoed the raw `###`
 * lines into the brief. Rules:
 *  - heading-only chunks are never emitted as content;
 *  - a `### YYYY-MM-DD` (date-prefixed) heading becomes a
 *    `**[YYYY-MM-DD]**` prefix on its following paragraph;
 *  - non-date `###` headings are dropped (and clear any pending date);
 *  - at most `limit` paragraphs are returned (matches the previous
 *    first-2-paragraphs behavior).
 *
 * Pure; exported for unit tests.
 */
export declare function extractStatusUpdates(sectionText: string, limit?: number): string[];
/**
 * Build the wiki re-rank query for a project brief (Phase 12 AC4):
 * name + area strengthened with the first lines of `## Key Questions`
 * and `## Background`. Pure; exported for tests.
 */
export declare function buildProjectWikiQuery(name: string, area: string | undefined, body: string): string;
/**
 * Project-grained commitment scope (Phase 12 AC4): commitments explicitly
 * claimed by this project (`projectSlug`) first, unioned with area-scoped
 * commitments not yet claimed by ANY project (a sibling's claim excludes
 * them). Deduped by id, projectSlug-claimed first. Pure; exported for tests.
 */
export declare function unionProjectCommitments(open: Commitment[], slug: string, area: string | undefined): Commitment[];
/**
 * Sibling-project slugs referenced from a README body via relative links
 * (`](../<slug>/...`), excluding self. Pure; exported for tests.
 * Phase 12 AC4.
 */
export declare function parseSiblingSlugs(body: string, selfSlug: string): string[];
/** Assemble a ProjectBrief — pure aggregator. AC2. */
export declare function assembleBriefForProject(slug: string, paths: WorkspacePaths, deps: ProjectBriefDeps): Promise<ProjectBrief>;
/** Delta of workspace activity since the project README was last modified. */
export interface ProjectWhatsNew {
    /** README mtime as ISO timestamp. Absent when sinceUnknown. */
    since?: string;
    /** True when the README mtime could not be determined. */
    sinceUnknown?: boolean;
    meetings: Array<{
        title: string;
        date: string;
        path: string;
    }>;
    topics: Array<{
        slug: string;
        lastRefreshed: string;
    }>;
    commitments: Array<{
        id: string;
        text: string;
        date: string;
    }>;
}
/**
 * Compute "what's new since the README was last touched" (Phase 12 AC3):
 * area meetings dated after the README mtime, wiki topics in the project's
 * area with a fresher `last_refreshed`, and newly-opened commitments in the
 * project-grained scope (AC4 union). PURE READ — performs no writes, no LLM.
 * Date comparison is done on YYYY-MM-DD strings (timezone-safe, see
 * services/LEARNINGS.md).
 */
export declare function assembleProjectWhatsNew(slug: string, paths: WorkspacePaths, deps: ProjectBriefDeps): Promise<ProjectWhatsNew | null>;
export interface AreaTaggedItem {
    type: 'decision' | 'learning';
    text: string;
    date?: string;
    path: string;
}
/** One parsed entry from `.arete/memory/items/{decisions,learnings}.md`. */
export interface MemoryItemEntry {
    /** Heading text (date prefix stripped when legacy `### YYYY-MM-DD: Title`). */
    title: string;
    /** From a `- **Date**: YYYY-MM-DD` bullet (live format) or the legacy heading prefix. */
    date?: string;
    /** Slugs from a `- **Topics**: a, b, c` bullet (live format). */
    topics: string[];
    /** Explicit `Area: foo` line or `[area:foo]` tag (legacy fallback). */
    area?: string;
}
/**
 * Parse memory-item entries in BOTH live and legacy formats (W6, review
 * concern 3 respec):
 *
 *   Live (what `decisions.md`/`learnings.md` actually contain today):
 *     ## Title
 *     - **Date**: YYYY-MM-DD
 *     - **Source**: ...
 *     - **Topics**: slug-a, slug-b
 *
 *   Legacy (the old spec — only ~5/694 live entries):
 *     ### YYYY-MM-DD: Title
 *     Area: foo            (or an inline `[area:foo]` tag)
 *
 * Line-based on purpose — the previous `[\s\S]+?(?=...|$)/gm` regex
 * truncated each section body at its first line end under the `m` flag
 * (same pitfall documented at `extractDiscussionTopics`).
 */
export declare function parseMemoryItemEntries(content: string): MemoryItemEntry[];
/**
 * Build the topic-slug → area map from topic-page `area:` frontmatter
 * (the same surface `ActiveTopicEntry.area` is derived from). Best-effort:
 * returns an empty map on any failure.
 */
export declare function loadTopicAreaMap(topicMemory: TopicMemoryService, paths: WorkspacePaths): Promise<Map<string, string>>;
export declare function readAreaTaggedMemoryItems(storage: StorageAdapter, paths: WorkspacePaths, area: string, topicAreaBySlug: Map<string, string>): Promise<AreaTaggedItem[]>;
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