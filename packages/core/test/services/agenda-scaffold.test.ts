/**
 * Phase 9 follow-up — agenda-scaffold tests (Approach B, deterministic floor).
 *
 * Covers:
 *  - extractDiscussionTopics / extractNextFocus (person-file qualitative signal)
 *  - classifySection routing
 *  - assembleAgendaScaffold (one-on-one + general/other templates)
 *  - renderScaffoldMarkdown (frontmatter, source tags, empty-section guard)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDiscussionTopics,
  extractNextFocus,
} from '../../src/services/brief-assemblers.js';
import {
  assembleAgendaScaffold,
  renderScaffoldMarkdown,
  classifySection,
  splitOwed,
  type AttendeeScaffoldInput,
  type TemplateInput,
} from '../../src/services/agenda-scaffold.js';
import type { MeetingBrief, Commitment } from '../../src/models/index.js';

// --- Fixtures --------------------------------------------------------------

const PERSON_FILE = `---
name: Anthony Avina
slug: anthony-avina
---

# Anthony Avina

## Next 1:1 Focus (2026-04-28)

**Open with a 2-minute status sweep on my side of the ledger BEFORE introducing new topics.** Anthony flagged the team has been "reacting a lot."

Items to sweep (from Open Commitments — I owe Anthony):
- [ ] \`6a7f160f\` — Call with Justin (Compliance) re: signature requirements
- [ ] \`6bb2882d\` — Variable mapping + drops section in import playbook

## 1:1 Discussion Topics

*Questions and ideas to draw from in syncs with Anthony. Update after each meeting.*

### Craft & Technical Curiosity
- "You've been at Reserv since near the beginning — what's changed the most?"
- "If you had a week with no tickets, what would you refactor or rebuild?"

### Experience & Frustrations
- "We have a lot of open items between us — what feels most unclear or blocking?"
- "Is there anything about how I create tickets or scope work that you'd want me to change?"

### Strategic / Engagement
- "What do you think the communications platform should look like in a year?"

## Interaction Log
| Date | Type | Notes |
`;

function makeBrief(overrides: Partial<MeetingBrief> = {}): MeetingBrief {
  return {
    mode: 'meeting',
    subject: 'Anthony / John Weekly',
    subjectSlug: '2026-06-09-anthony-john-weekly',
    sections: [
      {
        heading: 'Attendees (2)',
        bullets: ['**Anthony Avina** _(Glance Comms Engineer)_'],
      },
      {
        heading: 'Recent meetings with this group (2)',
        bullets: [
          '**Anthony / John Weekly** (2026-04-28) — `resources/meetings/2026-04-28-anthony-john-weekly.md`',
        ],
      },
      {
        heading: 'Open commitments touching this group (2)',
        bullets: [
          '`08bc2f35` → Anthony Avina: Update import script to inject DOI drop _(2026-06-02)_',
          '`9e0b1ad5` → Anthony Avina: Review status letter automation doc _(2026-06-02)_',
        ],
      },
      {
        heading: 'Related wiki pages (1)',
        bullets: ['**email-threading** — protocol message IDs — `memory/topics/email-threading.md`'],
      },
    ],
    sources: [
      'people/internal/anthony-avina.md',
      'resources/meetings/2026-04-28-anthony-john-weekly.md',
    ],
    truncated: false,
    metadata: {
      title: 'Anthony / John Weekly',
      date: '2026-06-09',
      attendees: ['Anthony Avina'],
      resolved: true,
    },
    attendeeMiniBriefs: [{ slug: 'anthony-avina', name: 'Anthony Avina', resolved: true }],
    ...overrides,
  };
}

const ONE_ON_ONE_TEMPLATE: TemplateInput = {
  type: 'one-on-one',
  sectionHeadings: ['Priorities', 'Feedback and Growth', 'Support and Blockers', 'Next Steps'],
  timeAllocation: {
    Priorities: 30,
    'Feedback and Growth': 30,
    'Support and Blockers': 25,
    'Next Steps': 15,
  },
};

const OTHER_TEMPLATE: TemplateInput = {
  type: 'other',
  sectionHeadings: ['Agenda', 'Next Steps'],
  timeAllocation: { Agenda: 60, 'Next Steps': 40 },
};

function attendeeFromFile(): AttendeeScaffoldInput {
  return {
    slug: 'anthony-avina',
    name: 'Anthony Avina',
    discussionTopics: extractDiscussionTopics(PERSON_FILE),
    nextFocus: extractNextFocus(PERSON_FILE) ?? undefined,
  };
}

// --- Extractor tests -------------------------------------------------------

describe('extractDiscussionTopics', () => {
  it('parses sub-heading groups with verbatim question bullets', () => {
    const groups = extractDiscussionTopics(PERSON_FILE);
    assert.equal(groups.length, 3);
    assert.equal(groups[0].label, 'Craft & Technical Curiosity');
    assert.equal(groups[0].questions.length, 2);
    assert.match(groups[0].questions[1], /refactor or rebuild/);
    assert.equal(groups[1].label, 'Experience & Frustrations');
  });

  it('returns [] when the section is absent', () => {
    assert.deepEqual(extractDiscussionTopics('# No topics here\n\n## Other\n- x'), []);
  });

  it('handles flat-bullet shape under an alternate heading (no sub-groups)', () => {
    const flat = `## Standing 1:1 Discussion Prompts

Questions to revisit periodically:
- "What does 'great' look like for me?"
- "What should I start, stop, or continue?"

## Interaction Log
`;
    const groups = extractDiscussionTopics(flat);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].label, 'Discussion prompts');
    assert.equal(groups[0].questions.length, 2);
    assert.match(groups[0].questions[0], /great/);
  });

  it('skips the italic helper line, not the questions', () => {
    const groups = extractDiscussionTopics(PERSON_FILE);
    const all = groups.flatMap((g) => g.questions);
    assert.ok(!all.some((q) => q.startsWith('*Questions')));
    assert.ok(all.every((q) => q.startsWith('"')));
  });
});

describe('extractNextFocus', () => {
  it('extracts framing prose + checkbox sweep items (with ids)', () => {
    const nf = extractNextFocus(PERSON_FILE);
    assert.ok(nf);
    assert.match(nf!.framing ?? '', /status sweep/i);
    assert.equal(nf!.sweepItems.length, 2);
    assert.match(nf!.sweepItems[0], /6a7f160f/);
    assert.match(nf!.sweepItems[0], /Justin/);
  });

  it('returns undefined when section absent', () => {
    assert.equal(extractNextFocus('# none\n## Foo\n- bar'), undefined);
  });
});

// --- classifySection -------------------------------------------------------

describe('classifySection', () => {
  it('routes named 1:1 sections to the right buckets', () => {
    assert.equal(classifySection('Priorities'), 'priorities');
    assert.equal(classifySection('Feedback and Growth'), 'feedback-growth');
    assert.equal(classifySection('Support and Blockers'), 'support-blockers');
    assert.equal(classifySection('Next Steps'), 'next-steps');
  });
  it('routes free-form headings to general/priorities sensibly', () => {
    assert.equal(classifySection('Agenda'), 'priorities');
    assert.equal(classifySection('Glance 2.0 Roadmap'), 'priorities');
    assert.equal(classifySection('Open Discussion'), 'priorities');
    assert.equal(classifySection('Random Heading'), 'general');
  });
});

// --- splitOwed -------------------------------------------------------------

describe('splitOwed', () => {
  it('splits commitments by direction', () => {
    const cs = [
      { direction: 'i_owe_them' } as Commitment,
      { direction: 'they_owe_me' } as Commitment,
      { direction: 'i_owe_them' } as Commitment,
    ];
    const { iOwe, theyOwe } = splitOwed(cs);
    assert.equal(iOwe.length, 2);
    assert.equal(theyOwe.length, 1);
  });
});

// --- assembleAgendaScaffold ------------------------------------------------

describe('assembleAgendaScaffold (one-on-one)', () => {
  it('routes real commitment IDs + recent meetings into Priorities', () => {
    const s = assembleAgendaScaffold(makeBrief(), [attendeeFromFile()], ONE_ON_ONE_TEMPLATE);
    const pri = s.sections.find((x) => x.heading === 'Priorities');
    assert.ok(pri);
    assert.equal(pri!.minutes, 30);
    const text = pri!.candidates.map((c) => c.text).join('\n');
    assert.match(text, /08bc2f35/);
    assert.match(text, /2026-04-28/); // recent-meeting callback
    assert.ok(pri!.candidates.some((c) => c.source === 'commitment'));
    assert.ok(pri!.candidates.some((c) => c.source === 'recent-meeting'));
  });

  it('routes craft/strategy discussion topics into Feedback and Growth', () => {
    const s = assembleAgendaScaffold(makeBrief(), [attendeeFromFile()], ONE_ON_ONE_TEMPLATE);
    const fg = s.sections.find((x) => x.heading === 'Feedback and Growth');
    assert.ok(fg);
    assert.ok(fg!.candidates.length > 0);
    assert.ok(fg!.candidates.every((c) => c.source === 'discussion-topic'));
    assert.match(fg!.candidates.map((c) => c.text).join('\n'), /refactor or rebuild/);
  });

  it('routes next-focus sweep items + frustration topics into Support and Blockers', () => {
    const s = assembleAgendaScaffold(makeBrief(), [attendeeFromFile()], ONE_ON_ONE_TEMPLATE);
    const sb = s.sections.find((x) => x.heading === 'Support and Blockers');
    assert.ok(sb);
    const text = sb!.candidates.map((c) => c.text).join('\n');
    assert.match(text, /6a7f160f/); // sweep item carries commitment id
    assert.ok(sb!.candidates.some((c) => c.source === 'next-focus'));
    assert.ok(sb!.candidates.some((c) => c.source === 'discussion-topic'));
  });

  it('leaves Next Steps empty (not flagged empty — filled live)', () => {
    const s = assembleAgendaScaffold(makeBrief(), [attendeeFromFile()], ONE_ON_ONE_TEMPLATE);
    const ns = s.sections.find((x) => x.heading === 'Next Steps');
    assert.ok(ns);
    assert.equal(ns!.candidates.length, 0);
    assert.equal(ns!.empty, false); // next-steps bucket is intentionally seedless
  });

  it('carries Next-Focus framing prose for the agent', () => {
    const s = assembleAgendaScaffold(makeBrief(), [attendeeFromFile()], ONE_ON_ONE_TEMPLATE);
    assert.ok(s.framingNotes && s.framingNotes.length > 0);
    assert.match(s.framingNotes!.join(' '), /status sweep/i);
  });
});

describe('assembleAgendaScaffold (general/other)', () => {
  it('merges all signal into the single Agenda section', () => {
    const s = assembleAgendaScaffold(makeBrief(), [attendeeFromFile()], OTHER_TEMPLATE);
    const agenda = s.sections.find((x) => x.heading === 'Agenda');
    assert.ok(agenda);
    const sources = new Set(agenda!.candidates.map((c) => c.source));
    // Agenda heading classifies as 'priorities' (keyword), so it gets
    // commitments + recent meetings; wiki/topics then land in unrouted.
    assert.ok(sources.has('commitment'));
    assert.ok(sources.has('recent-meeting'));
  });

  it('puts unconsumed wiki + topics into unrouted (never silently dropped)', () => {
    const s = assembleAgendaScaffold(makeBrief(), [attendeeFromFile()], OTHER_TEMPLATE);
    const sources = new Set(s.unrouted.map((c) => c.source));
    assert.ok(sources.has('wiki'));
    assert.ok(sources.has('discussion-topic'));
  });
});

describe('assembleAgendaScaffold — empty-section guard', () => {
  it('flags a qualitative section empty when no candidate routed', () => {
    const brief = makeBrief({ sections: [] }); // no commitments/meetings
    const s = assembleAgendaScaffold(brief, [{ slug: 'x', name: 'X', discussionTopics: [] }], ONE_ON_ONE_TEMPLATE);
    const pri = s.sections.find((x) => x.heading === 'Priorities');
    assert.equal(pri!.empty, true);
    const fg = s.sections.find((x) => x.heading === 'Feedback and Growth');
    assert.equal(fg!.empty, true);
  });

  it('respects maxCandidatesPerSection cap', () => {
    const s = assembleAgendaScaffold(makeBrief(), [attendeeFromFile()], ONE_ON_ONE_TEMPLATE, {
      maxCandidatesPerSection: 1,
    });
    for (const sec of s.sections) assert.ok(sec.candidates.length <= 1);
  });
});

// --- renderScaffoldMarkdown ------------------------------------------------

describe('renderScaffoldMarkdown', () => {
  it('emits frontmatter with meeting_title + type + attendees', () => {
    const s = assembleAgendaScaffold(makeBrief(), [attendeeFromFile()], ONE_ON_ONE_TEMPLATE);
    const md = renderScaffoldMarkdown(s);
    assert.match(md, /^---\nmeeting_title: "Anthony \/ John Weekly"/);
    assert.match(md, /type: one-on-one/);
    assert.match(md, /- Anthony Avina/);
    assert.match(md, /# Meeting Agenda: Anthony \/ John Weekly/);
  });

  it('tags each candidate bullet with its [source] and carries time-boxes', () => {
    const s = assembleAgendaScaffold(makeBrief(), [attendeeFromFile()], ONE_ON_ONE_TEMPLATE);
    const md = renderScaffoldMarkdown(s);
    assert.match(md, /## Priorities \(30min\)/);
    assert.match(md, /`\[commitment\]`/);
    assert.match(md, /`\[discussion topic\]`/);
    assert.match(md, /`\[owed \/ sweep\]`/);
  });

  it('writes the curate-not-ship guardrail + empty-section instruction', () => {
    const s = assembleAgendaScaffold(makeBrief(), [attendeeFromFile()], ONE_ON_ONE_TEMPLATE);
    const md = renderScaffoldMarkdown(s);
    assert.match(md, /SCAFFOLD — curate, do not ship as-is/);
    assert.match(md, /Next Steps \(15min\)/);
    assert.match(md, /capture live during the meeting/);
  });

  it('renders an explicit EMPTY guard line for unrouted qualitative sections', () => {
    const brief = makeBrief({ sections: [] });
    const s = assembleAgendaScaffold(brief, [{ slug: 'x', name: 'X', discussionTopics: [] }], ONE_ON_ONE_TEMPLATE);
    const md = renderScaffoldMarkdown(s);
    assert.match(md, /EMPTY — no structured candidate routed here/);
  });

  it('renders an Unrouted signal section when signal is unconsumed', () => {
    const s = assembleAgendaScaffold(makeBrief(), [attendeeFromFile()], OTHER_TEMPLATE);
    const md = renderScaffoldMarkdown(s);
    assert.match(md, /## Unrouted signal/);
  });
});
