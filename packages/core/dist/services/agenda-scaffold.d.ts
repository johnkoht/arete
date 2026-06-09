/**
 * Agenda scaffold — deterministic pre-seeding of a meeting agenda (Approach B).
 *
 * Phase 9 follow-up (F3 agenda-synthesis regression). The typed `arete brief`
 * primitive returns real context, but under batch load the agent pattern-fills
 * the empty template instead of synthesizing themed sections. Approach B
 * reduces reliance on freeform synthesis: given the assembled MeetingBrief +
 * the meeting-type template + per-attendee qualitative signal, this helper
 * emits a PRE-POPULATED agenda skeleton — each template section already filled
 * with candidate source bullets pulled from structured data:
 *   - the person's `## 1:1 Discussion Topics` questions,
 *   - open commitments (with short IDs),
 *   - recent-meeting callbacks (title + date),
 *   - `## Next 1:1 Focus` sweep items,
 *   - related wiki pages.
 *
 * The agent's job becomes CURATE + FRAME populated scaffolding rather than
 * synthesize from an empty template — far less skippable under batch load.
 *
 * Pure function: brief + extracts in, scaffold (data + markdown) out. NO I/O,
 * NO LLM. Source reads (person files, template) happen in the CLI layer and are
 * passed in, matching the brief-assemblers / brief-formatters split.
 *
 * Plan: dev/work/plans/arete-v2-chef-orchestrator/phase-9-followup-agenda-synthesis/plan.md
 *   (approach 3 — deterministic floor) — AC1, AC2, AC3.
 */
import type { MeetingBrief, Commitment } from '../models/index.js';
import type { DiscussionTopicGroup, NextFocusExtract } from './brief-assemblers.js';
/** Per-attendee qualitative signal the typed brief does not itself surface. */
export interface AttendeeScaffoldInput {
    slug: string;
    name: string;
    /** `## 1:1 Discussion Topics` groups parsed from the person file. */
    discussionTopics: DiscussionTopicGroup[];
    /** `## Next 1:1 Focus` extract parsed from the person file (if present). */
    nextFocus?: NextFocusExtract;
    /**
     * The attendee's OWN open commitments — `listForPerson(slug)`, i.e. the
     * relationship-scoped owed-list (I-owe-them / they-owe-me). This is what
     * seeds `## Priorities` (must-fix #2 — judge #2 BLOCKER): seeding Priorities
     * from the owner-global ledger made every 1:1's Priorities IDENTICAL. The
     * owner attendee's own ledger is NOT a per-relationship priority signal, so
     * the assembler skips the owner here (see `ownerSlug`) and routes owner-global
     * items to the separate `crossCutting` bucket.
     */
    commitments?: Commitment[];
}
/** A parsed meeting-type template (frontmatter-stripped). */
export interface TemplateInput {
    /** type/variant, e.g. "one-on-one", "other". */
    type: string;
    /** Section headings in template order (without leading `## `). */
    sectionHeadings: string[];
    /** Optional per-section minutes from the template's `time_allocation`. */
    timeAllocation?: Record<string, number>;
}
/** A single candidate bullet routed into a scaffold section. */
export interface ScaffoldCandidate {
    /** Markdown bullet text (no leading `- `). */
    text: string;
    /** Provenance tag for transparency + agent curation. */
    source: 'commitment' | 'recent-meeting' | 'discussion-topic' | 'next-focus' | 'wiki' | 'attendee-highlight';
}
/** A scaffold section: a template heading pre-populated with candidates. */
export interface ScaffoldSection {
    heading: string;
    /** Minutes from template time_allocation, if any. */
    minutes?: number;
    /** Pre-seeded candidate bullets (may be empty → agent must address). */
    candidates: ScaffoldCandidate[];
    /** True when no structured signal routed here — agent must synthesize/justify. */
    empty: boolean;
}
export interface AgendaScaffold {
    meetingTitle: string;
    meetingDate?: string;
    attendees: string[];
    templateType: string;
    sections: ScaffoldSection[];
    /** Workspace-relative source paths (carried through from the brief). */
    sources: string[];
    /** Signal that had no obvious home — surfaced so the agent doesn't drop it. */
    unrouted: ScaffoldCandidate[];
    /**
     * Owner-global / cross-cutting commitments — the workspace owner's own ledger
     * items that merely TOUCH this attendee's lane (group-global commitments not
     * owned by the non-owner attendee themselves). Surfaced in a SEPARATE,
     * clearly-labeled bucket — never folded into the primary `## Priorities`,
     * never identical across different 1:1s as the primary signal (must-fix #2).
     */
    crossCutting: ScaffoldCandidate[];
    /** Framing prose carried verbatim from person-file `## Next 1:1 Focus`. */
    framingNotes?: string[];
}
/** Buckets a template section can draw candidate bullets from. */
type Bucket = 'priorities' | 'feedback-growth' | 'support-blockers' | 'next-steps' | 'general';
/**
 * Classify a template section heading into a candidate bucket by keyword.
 * Deterministic + template-agnostic: works for one-on-one's named sections and
 * falls back to 'general' for free-form templates (other/leadership/customer).
 */
export declare function classifySection(heading: string): Bucket;
/**
 * Render a structured Commitment to candidate-bullet text (no leading `- `),
 * matching the brief's `renderCommitmentBullet` shape so attendee-scoped
 * candidates read identically to the group-global ones the agent already
 * curates: `` `<id8>` <arrow> <name>[ project]: <text> _(date)_ ``.
 */
export declare function renderCommitmentText(c: Commitment): string;
/** Commitment direction split when commitments are passed in structured form. */
export declare function splitOwed(commitments: Commitment[]): {
    iOwe: Commitment[];
    theyOwe: Commitment[];
};
export interface AssembleScaffoldOptions {
    /** Soft cap on candidate bullets per section (older/lower priority dropped). */
    maxCandidatesPerSection?: number;
    /**
     * Workspace owner slug (e.g. `john-koht`). The owner is an attendee of their
     * own 1:1s; their personal/owner-global ledger must NOT seed the other
     * person's `## Priorities` (judge #2 BLOCKER). When set, the owner attendee's
     * own commitments are excluded from the per-attendee Priorities seed and the
     * group-global ledger is routed to `crossCutting` instead.
     */
    ownerSlug?: string;
}
/**
 * Assemble the agenda scaffold. Deterministic.
 *
 * Routing (per classified bucket):
 *  - priorities      ← open commitments (curate to top) + recent-meeting callbacks
 *  - feedback-growth ← discussion-topic questions (craft/career/strategy groups)
 *  - support-blockers← Next-Focus sweep items + experience/frustration topics
 *  - next-steps      ← seeded empty checklist (filled live in the meeting)
 *  - general         ← merged signal (commitments + recent + wiki + all topics)
 *
 * Any signal with no home (e.g. wiki pages when no 'general'/'priorities'
 * section consumed them) lands in `unrouted` so the agent never silently
 * drops it.
 */
export declare function assembleAgendaScaffold(brief: MeetingBrief, attendees: AttendeeScaffoldInput[], template: TemplateInput, opts?: AssembleScaffoldOptions): AgendaScaffold;
/**
 * Render the scaffold to the agenda-skeleton markdown the agent curates.
 *
 * Output shape mirrors the saved-agenda format (frontmatter + `# Meeting
 * Agenda` + `## Section (Xmin)` + bullets) so the agent can edit in place. Each
 * pre-seeded bullet is tagged `[src]` so the agent can see provenance while
 * curating; the consume-step instruction tells it to strip tags + frame prose.
 */
export declare function renderScaffoldMarkdown(scaffold: AgendaScaffold): string;
export {};
//# sourceMappingURL=agenda-scaffold.d.ts.map