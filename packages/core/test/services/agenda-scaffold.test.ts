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
  inferTemplateType,
  deriveRecurringTemplateType,
  type AttendeeScaffoldInput,
  type TemplateInput,
} from '../../src/services/agenda-scaffold.js';
import type { MeetingIndexEntry } from '../../src/services/brief-assemblers.js';
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

  // B must-fix #1 (judge #1): the extractor must match BOTH the canonical
  // `## 1:1 Discussion Topics` header AND Lindsay's `## Standing 1:1 Discussion
  // Prompts` alias. Before the fix, the alias-header file returned [] and her
  // Feedback & Growth section came up EMPTY.
  it('matches both header variants: "1:1 Discussion Topics" and "Standing 1:1 Discussion Prompts"', () => {
    const canonical = `# P
## 1:1 Discussion Topics
- "Canonical question one?"
- "Canonical question two?"
## Interaction Log
`;
    const alias = `# P
## Standing 1:1 Discussion Prompts

Questions to revisit periodically:
- "Alias question one?"
- "Alias question two?"
## Interaction Log
`;
    const canonicalGroups = extractDiscussionTopics(canonical);
    const aliasGroups = extractDiscussionTopics(alias);
    // Both headers must yield non-empty groups with their verbatim questions.
    assert.ok(canonicalGroups.length > 0, 'canonical "1:1 Discussion Topics" must extract');
    assert.ok(aliasGroups.length > 0, 'alias "Standing 1:1 Discussion Prompts" must extract');
    assert.equal(canonicalGroups.flatMap((g) => g.questions).length, 2);
    assert.equal(aliasGroups.flatMap((g) => g.questions).length, 2);
    assert.match(aliasGroups.flatMap((g) => g.questions).join('\n'), /Alias question one/);
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

// --- B must-fix #2 (judge #2 BLOCKER): attendee-scoped Priorities -----------

/** A minimal open commitment for the attendee-scoping tests. */
function mkCommitment(
  id: string,
  personSlug: string,
  personName: string,
  text: string,
): Commitment {
  return {
    id,
    text,
    direction: 'i_owe_them',
    personSlug,
    personName,
    source: 'test',
    date: '2026-06-02',
    createdAt: '2026-06-02T00:00:00.000Z',
    status: 'open',
    resolvedAt: null,
  } as Commitment;
}

describe('assembleAgendaScaffold — attendee-scoped Priorities (must-fix #2)', () => {
  // The proof of the bug: a 1:1 brief is keyed on [attendee, owner], so the
  // group-global "Open commitments touching this group" section carries the
  // owner's ENTIRE ledger. Seeding Priorities from that made every 1:1's
  // Priorities IDENTICAL. The fix seeds from each attendee's OWN list.
  const ownerGlobal = [
    '`959208f4` → John Koht: Port topic memory _(2026-06-01)_',
    '`c0205fec` → John Koht: Complete compliance items _(2026-06-01)_',
  ];

  function briefForGroup(): MeetingBrief {
    return makeBrief({
      sections: [
        {
          heading: 'Open commitments touching this group (2)',
          // Owner-global ledger — what the brief returns for BOTH 1:1s.
          bullets: ownerGlobal,
        },
      ],
    });
  }

  function attendee(
    slug: string,
    name: string,
    commitments: Commitment[],
  ): AttendeeScaffoldInput {
    return { slug, name, discussionTopics: [], commitments };
  }

  it('seeds Priorities from the attendee owed-list, NOT the owner-global ledger', () => {
    const lindsay = attendee('lindsay-gray', 'Lindsay Gray', [
      mkCommitment('0b3609e9', 'lindsay-gray', 'Lindsay Gray', 'Deliver POP MVP plan'),
      mkCommitment('52f53ff2', 'lindsay-gray', 'Lindsay Gray', 'Write PRD for task mgmt'),
    ]);
    const john = attendee('john-koht', 'John Koht', []);
    const s = assembleAgendaScaffold(briefForGroup(), [john, lindsay], ONE_ON_ONE_TEMPLATE, {
      ownerSlug: 'john-koht',
    });
    const pri = s.sections.find((x) => x.heading === 'Priorities')!;
    const text = pri.candidates.map((c) => c.text).join('\n');
    // Lindsay's own items seed Priorities.
    assert.match(text, /0b3609e9/);
    assert.match(text, /52f53ff2/);
    // The owner-global ledger must NOT be in Priorities.
    assert.ok(!/959208f4/.test(text), 'owner-global commitment leaked into Priorities');
    assert.ok(!/c0205fec/.test(text), 'owner-global commitment leaked into Priorities');
  });

  it('routes owner-global commitments to the separate Cross-cutting bucket', () => {
    const lindsay = attendee('lindsay-gray', 'Lindsay Gray', [
      mkCommitment('0b3609e9', 'lindsay-gray', 'Lindsay Gray', 'Deliver POP MVP plan'),
    ]);
    const john = attendee('john-koht', 'John Koht', []);
    const s = assembleAgendaScaffold(briefForGroup(), [john, lindsay], ONE_ON_ONE_TEMPLATE, {
      ownerSlug: 'john-koht',
    });
    const xc = s.crossCutting.map((c) => c.text).join('\n');
    assert.match(xc, /959208f4/);
    assert.match(xc, /c0205fec/);
    // And Cross-cutting must NOT swallow the attendee's own item.
    assert.ok(!/0b3609e9/.test(xc));
    const md = renderScaffoldMarkdown(s);
    assert.match(md, /## Cross-cutting \/ touches their lane/);
  });

  it('two different attendees get DIFFERENT Priority seeds (the regression proof)', () => {
    const john = attendee('john-koht', 'John Koht', []);
    const lindsay = attendee('lindsay-gray', 'Lindsay Gray', [
      mkCommitment('0b3609e9', 'lindsay-gray', 'Lindsay Gray', 'Deliver POP MVP plan'),
      mkCommitment('52f53ff2', 'lindsay-gray', 'Lindsay Gray', 'Write PRD'),
    ]);
    const anthony = attendee('anthony-avina', 'Anthony Avina', [
      mkCommitment('08bc2f35', 'anthony-avina', 'Anthony Avina', 'Update import script'),
      mkCommitment('9e0b1ad5', 'anthony-avina', 'Anthony Avina', 'Review status letter doc'),
    ]);

    const sL = assembleAgendaScaffold(briefForGroup(), [john, lindsay], ONE_ON_ONE_TEMPLATE, {
      ownerSlug: 'john-koht',
    });
    const sA = assembleAgendaScaffold(briefForGroup(), [john, anthony], ONE_ON_ONE_TEMPLATE, {
      ownerSlug: 'john-koht',
    });

    const priL = sL.sections
      .find((x) => x.heading === 'Priorities')!
      .candidates.filter((c) => c.source === 'commitment')
      .map((c) => c.text)
      .sort();
    const priA = sA.sections
      .find((x) => x.heading === 'Priorities')!
      .candidates.filter((c) => c.source === 'commitment')
      .map((c) => c.text)
      .sort();

    assert.ok(priL.length > 0 && priA.length > 0);
    assert.notDeepEqual(priL, priA, 'two attendees must NOT get identical Priority seeds');
    assert.match(priL.join('\n'), /0b3609e9/);
    assert.match(priA.join('\n'), /08bc2f35/);
    // Cross-cutting is allowed to be identical (it IS the shared owner ledger).
  });

  it('falls back to group-global commitments when no attendee commitments are passed', () => {
    // Group meetings / unresolved attendees: preserve prior behavior.
    const s = assembleAgendaScaffold(briefForGroup(), [attendeeFromFile()], ONE_ON_ONE_TEMPLATE, {
      ownerSlug: 'john-koht',
    });
    const pri = s.sections.find((x) => x.heading === 'Priorities')!;
    const text = pri.candidates.map((c) => c.text).join('\n');
    assert.match(text, /959208f4/); // group-global is the only signal → used as seed
    assert.equal(s.crossCutting.length, 0); // nothing to separate out
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

// ---------------------------------------------------------------------------
// WS-1 (plan-context-injection) — project-doc routing (T2)
// ---------------------------------------------------------------------------

/** A MeetingBrief carrying a `Project document` section (selectProjectDocs out). */
function briefWithProjectDoc(overrides: Partial<MeetingBrief> = {}): MeetingBrief {
  return {
    mode: 'meeting',
    subject: 'Jira Roadmap Sync',
    subjectSlug: '2026-06-09-jira-roadmap-sync',
    sections: [
      {
        heading: 'Meeting area & projects',
        bullets: ['**Glance Roadmap** (area: glance-operations, status: active) — `projects/active/glance-2-roadmap/README.md`'],
      },
      {
        heading: 'Project document',
        bullets: [
          '**Glance 1.5 Roadmap** — `projects/active/glance-2-roadmap/glance-1.5-roadmap.md` _(score 0.412)_',
          '  - Notion vs Jira decision: keep roadmap in Notion; capacity and slice-zero parity are the open risks.',
          '_listed:_ `projects/active/glance-2-roadmap/working/capacity.md` — Capacity',
        ],
      },
    ],
    sources: ['projects/active/glance-2-roadmap/README.md'],
    truncated: false,
    metadata: {
      title: 'Jira Roadmap Sync',
      date: '2026-06-09',
      attendees: ['Dave'],
      resolved: true,
    },
    attendeeMiniBriefs: [],
    ...overrides,
  };
}

const PRIORITIES_ONLY_TEMPLATE: TemplateInput = {
  type: 'other',
  sectionHeadings: ['Priorities', 'Next Steps'],
};

// A truly minimal skeleton: a single non-priorities, non-general heading.
const MINIMAL_SKELETON_TEMPLATE: TemplateInput = {
  type: 'other',
  sectionHeadings: ['Notes'],
};

describe('assembleAgendaScaffold — project-doc routing (WS-1)', () => {
  it('AC1.5: routes the project-document section into sections[].candidates[] with source:project-doc', () => {
    const s = assembleAgendaScaffold(briefWithProjectDoc(), [], PRIORITIES_ONLY_TEMPLATE);
    const allCandidates = s.sections.flatMap((sec) => sec.candidates);
    const projDoc = allCandidates.filter((c) => c.source === 'project-doc');
    assert.ok(projDoc.length >= 1, 'at least one project-doc candidate reaches a section');
    // AC1.6: the chosen doc's rel path + score are present in the candidate text.
    assert.ok(
      projDoc.some(
        (c) =>
          /glance-2-roadmap\/glance-1\.5-roadmap\.md/.test(c.text) &&
          /score 0\.412/.test(c.text),
      ),
      'rel path + score surfaced for the audit (AC1.6)',
    );
    // The body excerpt (specific content, R8) is folded onto the doc bullet.
    assert.ok(
      projDoc.some((c) => /Notion vs Jira decision/.test(c.text)),
      'specific roadmap concern present (not length>=0)',
    );
  });

  it('AC-R3: with a MINIMAL skeleton template (no priorities/general heading) the project-doc candidate is reachable in unrouted (not dropped)', () => {
    const s = assembleAgendaScaffold(briefWithProjectDoc(), [], MINIMAL_SKELETON_TEMPLATE);
    const inSection = s.sections
      .flatMap((sec) => sec.candidates)
      .some((c) => c.source === 'project-doc');
    const inUnrouted = s.unrouted.some((c) => c.source === 'project-doc');
    assert.ok(inSection || inUnrouted, 'project-doc candidate is reachable, not silently dropped');
    // 'Notes' classifies to general → in this template it IS consumed. Assert
    // the candidate landed SOMEWHERE with its specific content intact.
    const all = [...s.sections.flatMap((sec) => sec.candidates), ...s.unrouted];
    assert.ok(all.some((c) => /Notion vs Jira decision/.test(c.text)));
  });

  it('AC-R3 strict: a skeleton with ONLY a next-steps heading still surfaces project-doc in unrouted', () => {
    const nextOnly: TemplateInput = { type: 'other', sectionHeadings: ['Next Steps'] };
    const s = assembleAgendaScaffold(briefWithProjectDoc(), [], nextOnly);
    assert.ok(
      s.unrouted.some((c) => c.source === 'project-doc' && /Notion vs Jira/.test(c.text)),
      'project-doc falls to unrouted when no consuming section exists',
    );
  });

  it('AC-R4: when the selected doc IS the last meeting instance, it is not emitted as BOTH recent-meeting and project-doc', () => {
    const sharedRel = 'resources/meetings/2026-06-02-jira-roadmap-sync.md';
    const brief = briefWithProjectDoc({
      sections: [
        {
          heading: 'Recent meetings with this group (1)',
          bullets: [`**Jira Roadmap Sync** (2026-06-02) — \`${sharedRel}\``],
        },
        {
          heading: 'Project document',
          bullets: [
            `**Jira Roadmap Sync** — \`${sharedRel}\` _(score 0.5)_`,
            '  - duplicate of the recent meeting instance',
          ],
        },
      ],
    });
    const s = assembleAgendaScaffold(brief, [], PRIORITIES_ONLY_TEMPLATE);
    const all = [...s.sections.flatMap((sec) => sec.candidates), ...s.unrouted];
    const refs = all.filter((c) => c.text.includes(sharedRel));
    // The shared doc must appear via recent-meeting, not duplicated as project-doc.
    assert.ok(
      !refs.some((c) => c.source === 'project-doc'),
      'overlapping doc dropped from project-doc set (deduped)',
    );
    assert.ok(refs.some((c) => c.source === 'recent-meeting'), 'recent-meeting candidate kept');
  });

  it('project-doc candidate leads the Priorities section (substance first)', () => {
    const s = assembleAgendaScaffold(briefWithProjectDoc(), [], PRIORITIES_ONLY_TEMPLATE);
    const priorities = s.sections.find((sec) => sec.heading === 'Priorities');
    assert.ok(priorities);
    assert.equal(priorities!.candidates[0].source, 'project-doc');
  });
});

// ---------------------------------------------------------------------------
// WS-1 — recurring-meeting template derivation (R10 / AC1.8 / AC-R10)
// ---------------------------------------------------------------------------

function meetingEntry(over: Partial<MeetingIndexEntry>): MeetingIndexEntry {
  return {
    path: '/w/resources/meetings/x.md',
    date: '2026-06-01',
    title: 'x',
    attendeeIds: [],
    attendeeNames: [],
    topics: [],
    ...over,
  };
}

describe('deriveRecurringTemplateType (WS-1 R10)', () => {
  it('AC1.8: recurring meeting with a prior 5-person instance → type derived from it (NOT one-on-one)', () => {
    // This instance shows only 2 attendees, but the prior same-titled instance
    // had 5 → it is a team meeting, typed `other`.
    const index = [
      meetingEntry({
        path: '/w/resources/meetings/2026-05-20-platform-biweekly.md',
        date: '2026-05-20',
        title: 'Platform Biweekly',
        attendeeIds: ['a', 'b', 'c', 'd', 'e'],
      }),
    ];
    const type = deriveRecurringTemplateType(
      'Platform Biweekly',
      2,
      index,
      '/w/resources/meetings/2026-06-03-platform-biweekly.md',
    );
    assert.notEqual(type, 'one-on-one');
    assert.equal(type, 'other');
  });

  it('AC1.8: derivation tolerates a date-prefixed title and matches the prior instance', () => {
    const index = [
      meetingEntry({
        path: '/w/resources/meetings/2026-05-20-platform-biweekly.md',
        date: '2026-05-20',
        title: '2026-05-20 Platform Biweekly',
        attendeeIds: ['a', 'b', 'c', 'd', 'e'],
      }),
    ];
    const type = deriveRecurringTemplateType('2026-06-03-Platform Biweekly', 2, index);
    assert.equal(type, 'other');
  });

  it('AC-R10: genuine 1:1 with NO prior instance still yields one-on-one', () => {
    const index = [
      meetingEntry({ title: 'Some Other Meeting', attendeeIds: ['x', 'y', 'z'] }),
    ];
    const type = deriveRecurringTemplateType('Anthony / John', 2, index);
    assert.equal(type, 'one-on-one');
  });

  it('AC-R10: empty index → one-on-one for a 2-person meeting (no regression)', () => {
    assert.equal(deriveRecurringTemplateType('Dave Sync', 2, []), 'one-on-one');
  });

  it('a recurring 1:1 (prior 2-person instance) stays one-on-one', () => {
    const index = [
      meetingEntry({
        path: '/w/resources/meetings/2026-05-26-anthony-john-weekly.md',
        date: '2026-05-26',
        title: 'Anthony / John Weekly',
        attendeeIds: ['anthony-avina', 'john-koht'],
      }),
    ];
    const type = deriveRecurringTemplateType(
      'Anthony / John Weekly',
      2,
      index,
      '/w/resources/meetings/2026-06-09-anthony-john-weekly.md',
    );
    assert.equal(type, 'one-on-one');
  });

  it('inferTemplateType: title keywords + attendee count heuristics', () => {
    assert.equal(inferTemplateType('Weekly Sync', 6), 'one-on-one'); // keyword wins
    assert.equal(inferTemplateType('Big Planning', 6), 'other');
    assert.equal(inferTemplateType('Dave / John', 2), 'one-on-one');
  });
});
