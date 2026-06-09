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
/**
 * Classify a template section heading into a candidate bucket by keyword.
 * Deterministic + template-agnostic: works for one-on-one's named sections and
 * falls back to 'general' for free-form templates (other/leadership/customer).
 */
export function classifySection(heading) {
    const h = heading.toLowerCase();
    if (/next step|action item|follow[- ]?up|wrap/.test(h))
        return 'next-steps';
    if (/feedback|growth|develop|coaching|craft|career/.test(h))
        return 'feedback-growth';
    if (/support|blocker|escalat|help|risk|need/.test(h))
        return 'support-blockers';
    if (/priorit|focus|status|update|progress|agenda|topic|discuss|roadmap|review/.test(h)) {
        return 'priorities';
    }
    return 'general';
}
/**
 * Classify a discussion-topic group label into the bucket it best feeds.
 * Craft/career/strategy → feedback-growth; experience/frustration → support.
 */
function classifyTopicGroup(label) {
    const l = label.toLowerCase();
    if (/frustrat|blocker|unclear|experience|annoy/.test(l))
        return 'support-blockers';
    if (/craft|curios|career|personal|strateg|engag|growth/.test(l))
        return 'feedback-growth';
    return 'feedback-growth';
}
// ---------------------------------------------------------------------------
// Candidate extraction from the brief
// ---------------------------------------------------------------------------
const COMMITMENTS_HEADING_RE = /^Open commitments/i;
const RECENT_MEETINGS_HEADING_RE = /^Recent meetings/i;
const WIKI_HEADING_RE = /^Related wiki pages/i;
/** Pull commitment bullets (already ID-tagged) out of the brief sections. */
function commitmentCandidates(brief) {
    const out = [];
    for (const section of brief.sections) {
        if (!COMMITMENTS_HEADING_RE.test(section.heading))
            continue;
        for (const bullet of section.bullets) {
            // Skip sub-headers like "**I owe (2):**".
            if (/^\*\*.*:\*\*$/.test(bullet.trim()))
                continue;
            out.push({ text: bullet.replace(/^\s+/, ''), source: 'commitment' });
        }
    }
    return out;
}
/** Pull recent-meeting callbacks out of the brief sections. */
function recentMeetingCandidates(brief) {
    const out = [];
    for (const section of brief.sections) {
        if (!RECENT_MEETINGS_HEADING_RE.test(section.heading))
            continue;
        for (const bullet of section.bullets) {
            out.push({ text: bullet, source: 'recent-meeting' });
        }
    }
    return out;
}
/** Pull related-wiki callbacks out of the brief sections. */
function wikiCandidates(brief) {
    const out = [];
    for (const section of brief.sections) {
        if (!WIKI_HEADING_RE.test(section.heading))
            continue;
        for (const bullet of section.bullets) {
            out.push({ text: bullet, source: 'wiki' });
        }
    }
    return out;
}
/** Commitment direction split when commitments are passed in structured form. */
export function splitOwed(commitments) {
    return {
        iOwe: commitments.filter((c) => c.direction === 'i_owe_them'),
        theyOwe: commitments.filter((c) => c.direction === 'they_owe_me'),
    };
}
const DEFAULT_MAX_PER_SECTION = 8;
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
export function assembleAgendaScaffold(brief, attendees, template, opts = {}) {
    const maxPer = opts.maxCandidatesPerSection ?? DEFAULT_MAX_PER_SECTION;
    const commitments = commitmentCandidates(brief);
    const recentMeetings = recentMeetingCandidates(brief);
    const wiki = wikiCandidates(brief);
    // Flatten discussion topics, tagged with the bucket each group feeds.
    const topicsByBucket = {
        priorities: [],
        'feedback-growth': [],
        'support-blockers': [],
        'next-steps': [],
        general: [],
    };
    const allTopicCandidates = [];
    for (const att of attendees) {
        for (const group of att.discussionTopics) {
            const bucket = classifyTopicGroup(group.label);
            for (const q of group.questions) {
                const cand = {
                    text: `${q} _(topic: ${group.label})_`,
                    source: 'discussion-topic',
                };
                topicsByBucket[bucket].push(cand);
                allTopicCandidates.push(cand);
            }
        }
    }
    // Next-Focus sweep items → support-blockers (and remember framing).
    const sweepCandidates = [];
    const framingNotes = [];
    for (const att of attendees) {
        if (!att.nextFocus)
            continue;
        if (att.nextFocus.framing)
            framingNotes.push(att.nextFocus.framing);
        for (const item of att.nextFocus.sweepItems) {
            sweepCandidates.push({ text: item, source: 'next-focus' });
        }
    }
    const consumed = {
        commitments: false,
        recentMeetings: false,
        wiki: false,
        topics: false,
        sweep: false,
    };
    const sections = [];
    for (const heading of template.sectionHeadings) {
        const bucket = classifySection(heading);
        const minutes = template.timeAllocation?.[heading];
        let candidates = [];
        switch (bucket) {
            case 'priorities':
                candidates = [...commitments, ...recentMeetings];
                consumed.commitments = true;
                consumed.recentMeetings = true;
                break;
            case 'feedback-growth':
                candidates = [...topicsByBucket['feedback-growth']];
                consumed.topics = true;
                break;
            case 'support-blockers':
                candidates = [...sweepCandidates, ...topicsByBucket['support-blockers']];
                consumed.sweep = true;
                // mark feedback topics partially consumed only if non-empty group fed here
                if (topicsByBucket['support-blockers'].length > 0)
                    consumed.topics = true;
                break;
            case 'next-steps':
                candidates = []; // filled live; seed left intentionally empty
                break;
            case 'general':
                candidates = [
                    ...commitments,
                    ...recentMeetings,
                    ...allTopicCandidates,
                    ...wiki,
                ];
                consumed.commitments = true;
                consumed.recentMeetings = true;
                consumed.topics = true;
                consumed.wiki = true;
                break;
        }
        const capped = candidates.slice(0, maxPer);
        sections.push({
            heading,
            minutes,
            candidates: capped,
            empty: capped.length === 0 && bucket !== 'next-steps',
        });
    }
    // Anything unconsumed → unrouted (so the agent doesn't silently drop signal).
    const unrouted = [];
    if (!consumed.commitments)
        unrouted.push(...commitments);
    if (!consumed.recentMeetings)
        unrouted.push(...recentMeetings);
    if (!consumed.wiki)
        unrouted.push(...wiki);
    if (!consumed.topics)
        unrouted.push(...allTopicCandidates);
    if (!consumed.sweep)
        unrouted.push(...sweepCandidates);
    return {
        meetingTitle: brief.metadata.title,
        meetingDate: brief.metadata.date,
        attendees: brief.metadata.attendees,
        templateType: template.type,
        sections,
        sources: brief.sources,
        unrouted,
        ...(framingNotes.length > 0 ? { framingNotes } : {}),
    };
}
// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------
const SOURCE_LABEL = {
    commitment: 'commitment',
    'recent-meeting': 'recent meeting',
    'discussion-topic': 'discussion topic',
    'next-focus': 'owed / sweep',
    wiki: 'wiki',
    'attendee-highlight': 'highlight',
};
/**
 * Render the scaffold to the agenda-skeleton markdown the agent curates.
 *
 * Output shape mirrors the saved-agenda format (frontmatter + `# Meeting
 * Agenda` + `## Section (Xmin)` + bullets) so the agent can edit in place. Each
 * pre-seeded bullet is tagged `[src]` so the agent can see provenance while
 * curating; the consume-step instruction tells it to strip tags + frame prose.
 */
export function renderScaffoldMarkdown(scaffold) {
    const framingNotes = scaffold.framingNotes;
    const lines = [];
    // Frontmatter (meeting_title is REQUIRED for auto-linking).
    lines.push('---');
    lines.push(`meeting_title: "${scaffold.meetingTitle}"`);
    if (scaffold.meetingDate)
        lines.push(`date: ${scaffold.meetingDate}`);
    lines.push(`type: ${scaffold.templateType}`);
    if (scaffold.attendees.length > 0) {
        lines.push('attendees:');
        for (const a of scaffold.attendees)
            lines.push(`  - ${a}`);
    }
    lines.push('---');
    lines.push('');
    lines.push(`# Meeting Agenda: ${scaffold.meetingTitle}`);
    lines.push('');
    lines.push('> **SCAFFOLD — curate, do not ship as-is.** Each bullet below is a' +
        ' *candidate* pulled from structured data and tagged with its `[source]`.' +
        ' Frame each section with a one-line lead-in, keep/cut/merge candidates' +
        ' into specific talking points, strip the `[source]` tags. An EMPTY' +
        ' section means no structured signal routed there — synthesize from the' +
        ' brief or write a one-line reason it is empty. Do not leave it blank.');
    lines.push('');
    if (framingNotes && framingNotes.length > 0) {
        lines.push('**Framing carried from person file(s):**');
        for (const note of framingNotes)
            lines.push(`> ${note}`);
        lines.push('');
    }
    for (const section of scaffold.sections) {
        const min = typeof section.minutes === 'number' ? ` (${section.minutes}min)` : '';
        lines.push(`## ${section.heading}${min}`);
        lines.push('');
        if (section.candidates.length === 0) {
            if (/next step|action item/i.test(section.heading)) {
                lines.push('- [ ] _(capture live during the meeting)_');
            }
            else {
                lines.push('- _EMPTY — no structured candidate routed here. Synthesize from the' +
                    ' brief, or replace this line with a one-line reason this section is' +
                    ' empty._');
            }
            lines.push('');
            continue;
        }
        for (const c of section.candidates) {
            lines.push(`- ${c.text}  \`[${SOURCE_LABEL[c.source]}]\``);
        }
        lines.push('');
    }
    if (scaffold.unrouted.length > 0) {
        lines.push('## Unrouted signal (place or explicitly drop)');
        lines.push('');
        lines.push('_These candidates had no obvious home in the template. Route them into a' +
            ' section above or drop them deliberately — do not ignore._');
        for (const c of scaffold.unrouted) {
            lines.push(`- ${c.text}  \`[${SOURCE_LABEL[c.source]}]\``);
        }
        lines.push('');
    }
    if (scaffold.sources.length > 0) {
        lines.push('## Sources');
        lines.push('');
        for (const s of scaffold.sources)
            lines.push(`- \`${s}\``);
        lines.push('');
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
//# sourceMappingURL=agenda-scaffold.js.map