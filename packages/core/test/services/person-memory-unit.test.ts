import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectSignalsForPerson,
  aggregateSignals,
  upsertPersonMemorySection,
  normalizeSignalTopic,
  renderPersonMemorySection,
  extractPersonMemorySection,
  getPersonMemoryLastRefreshed,
  isMemoryStale,
  AUTO_PERSON_MEMORY_START,
  AUTO_PERSON_MEMORY_END,
} from '../../src/services/person-memory.js';
import type { PersonMemorySignal, AggregatedPersonSignal } from '../../src/services/person-memory.js';
import type { PersonStance, PersonActionItem } from '../../src/services/person-signals.js';
import type { RelationshipHealth } from '../../src/services/person-health.js';

// ---------------------------------------------------------------------------
// normalizeSignalTopic
// ---------------------------------------------------------------------------

describe('normalizeSignalTopic', () => {
  it('lowercases and strips non-alphanumeric chars', () => {
    assert.equal(normalizeSignalTopic('API Costs!!!'), 'api costs');
  });

  it('trims leading punctuation and whitespace', () => {
    assert.equal(normalizeSignalTopic(':; some topic'), 'some topic');
  });

  it('truncates to 120 characters', () => {
    const long = 'a'.repeat(200);
    assert.equal(normalizeSignalTopic(long).length, 120);
  });

  it('collapses internal whitespace', () => {
    assert.equal(normalizeSignalTopic('too   many   spaces'), 'too many spaces');
  });
});

// ---------------------------------------------------------------------------
// collectSignalsForPerson
// ---------------------------------------------------------------------------

describe('collectSignalsForPerson', () => {
  it('detects ask signals from "asked about" pattern', () => {
    const content = 'Alice asked about pricing tiers.';
    const signals = collectSignalsForPerson(content, 'Alice', '2026-01-15', 'meeting.md');

    assert.equal(signals.length, 1);
    assert.equal(signals[0].kind, 'ask');
    assert.equal(signals[0].topic, 'pricing tiers');
    assert.equal(signals[0].date, '2026-01-15');
    assert.equal(signals[0].source, 'meeting.md');
  });

  it('detects concern signals from "concerned about" pattern', () => {
    const content = 'Alice was concerned about timeline delays.';
    const signals = collectSignalsForPerson(content, 'Alice', '2026-01-15', 'meeting.md');

    assert.equal(signals.length, 1);
    assert.equal(signals[0].kind, 'concern');
    assert.equal(signals[0].topic, 'timeline delays');
  });

  it('detects concern signals from "worried about" pattern', () => {
    const content = 'Alice was worried about budget overruns.';
    const signals = collectSignalsForPerson(content, 'Alice', '2026-01-15', 'meeting.md');

    assert.equal(signals.length, 1);
    assert.equal(signals[0].kind, 'concern');
    assert.equal(signals[0].topic, 'budget overruns');
  });

  it('detects concern from "pushed back on" pattern', () => {
    const content = 'Alice pushed back on the migration plan.';
    const signals = collectSignalsForPerson(content, 'Alice', '2026-01-15', 'meeting.md');

    assert.equal(signals.length, 1);
    assert.equal(signals[0].kind, 'concern');
    assert.equal(signals[0].topic, 'the migration plan');
  });

  it('detects speaker-prefixed asks (can we / could we / what about)', () => {
    const content = 'Alice: Can we revisit the onboarding flow?';
    const signals = collectSignalsForPerson(content, 'Alice', '2026-01-15', 'meeting.md');

    assert.equal(signals.length, 1);
    assert.equal(signals[0].kind, 'ask');
    assert.equal(signals[0].topic, 'revisit the onboarding flow');
  });

  it('detects speaker-prefixed concerns', () => {
    const content = 'Alice: I am concerned about the deadline.';
    const signals = collectSignalsForPerson(content, 'Alice', '2026-01-15', 'meeting.md');

    // Matches both the general "concerned about" pattern and the speaker-prefix pattern
    assert.ok(signals.length >= 1, `Expected at least 1 signal, got ${signals.length}`);
    assert.ok(signals.every(s => s.kind === 'concern'));
    assert.ok(signals.some(s => s.topic.includes('deadline')));
  });

  it('returns empty array when person is not mentioned', () => {
    const content = 'Bob asked about pricing.';
    const signals = collectSignalsForPerson(content, 'Alice', '2026-01-15', 'meeting.md');
    assert.equal(signals.length, 0);
  });

  it('is case-insensitive for person name matching', () => {
    const content = 'alice asked about reporting.';
    const signals = collectSignalsForPerson(content, 'Alice', '2026-01-15', 'meeting.md');
    assert.equal(signals.length, 1);
    assert.equal(signals[0].kind, 'ask');
  });

  it('skips signals with topics shorter than 3 characters', () => {
    const content = 'Alice asked about it.';
    const signals = collectSignalsForPerson(content, 'Alice', '2026-01-15', 'meeting.md');
    // "it" normalizes to "it" which is 2 chars — should be filtered
    assert.equal(signals.length, 0);
  });

  it('collects multiple signals from the same content', () => {
    const content = [
      'Alice asked about pricing.',
      'Alice was concerned about delivery timelines.',
      'Alice asked for more details on the API.',
    ].join('\n');
    const signals = collectSignalsForPerson(content, 'Alice', '2026-01-15', 'meeting.md');
    assert.ok(signals.length >= 3, `Expected at least 3 signals, got ${signals.length}`);
  });
});

// ---------------------------------------------------------------------------
// aggregateSignals
// ---------------------------------------------------------------------------

describe('aggregateSignals', () => {
  it('groups signals by topic and kind', () => {
    const signals: PersonMemorySignal[] = [
      { kind: 'ask', topic: 'pricing', date: '2026-01-10', source: 'a.md' },
      { kind: 'ask', topic: 'pricing', date: '2026-01-15', source: 'b.md' },
      { kind: 'concern', topic: 'timeline', date: '2026-01-12', source: 'c.md' },
    ];

    const result = aggregateSignals(signals, 1);
    assert.equal(result.asks.length, 1);
    assert.equal(result.asks[0].topic, 'pricing');
    assert.equal(result.asks[0].count, 2);
    assert.equal(result.asks[0].lastMentioned, '2026-01-15');
    assert.deepEqual(result.asks[0].sources, ['a.md', 'b.md']);

    assert.equal(result.concerns.length, 1);
    assert.equal(result.concerns[0].topic, 'timeline');
    assert.equal(result.concerns[0].count, 1);
  });

  it('filters by minMentions', () => {
    const signals: PersonMemorySignal[] = [
      { kind: 'ask', topic: 'pricing', date: '2026-01-10', source: 'a.md' },
      { kind: 'ask', topic: 'pricing', date: '2026-01-15', source: 'b.md' },
      { kind: 'ask', topic: 'onboarding', date: '2026-01-10', source: 'a.md' },
    ];

    const result = aggregateSignals(signals, 2);
    assert.equal(result.asks.length, 1);
    assert.equal(result.asks[0].topic, 'pricing');
  });

  it('sorts by count descending, then by lastMentioned descending', () => {
    const signals: PersonMemorySignal[] = [
      { kind: 'ask', topic: 'alpha', date: '2026-01-01', source: 'a.md' },
      { kind: 'ask', topic: 'beta', date: '2026-01-10', source: 'b.md' },
      { kind: 'ask', topic: 'alpha', date: '2026-01-05', source: 'c.md' },
    ];

    const result = aggregateSignals(signals, 1);
    assert.equal(result.asks[0].topic, 'alpha'); // count=2
    assert.equal(result.asks[1].topic, 'beta');  // count=1
  });

  it('returns empty arrays when no signals', () => {
    const result = aggregateSignals([], 1);
    assert.equal(result.asks.length, 0);
    assert.equal(result.concerns.length, 0);
  });

  it('does not duplicate sources', () => {
    const signals: PersonMemorySignal[] = [
      { kind: 'ask', topic: 'pricing', date: '2026-01-10', source: 'a.md' },
      { kind: 'ask', topic: 'pricing', date: '2026-01-11', source: 'a.md' },
    ];

    const result = aggregateSignals(signals, 1);
    assert.deepEqual(result.asks[0].sources, ['a.md']);
  });
});

// ---------------------------------------------------------------------------
// upsertPersonMemorySection
// ---------------------------------------------------------------------------

describe('upsertPersonMemorySection', () => {
  const section = `${AUTO_PERSON_MEMORY_START}\n## Memory Highlights (Auto)\nSome content\n${AUTO_PERSON_MEMORY_END}\n`;

  it('appends section to content without existing markers', () => {
    const content = '# Alice\n\n## Notes\n\n- A note.\n';
    const result = upsertPersonMemorySection(content, section);

    assert.ok(result.includes(AUTO_PERSON_MEMORY_START));
    assert.ok(result.includes(AUTO_PERSON_MEMORY_END));
    assert.ok(result.includes('# Alice'));
    assert.ok(result.includes('Some content'));
  });

  it('replaces existing section between markers', () => {
    const existing = [
      '# Alice',
      '',
      '## Notes',
      '',
      AUTO_PERSON_MEMORY_START,
      '## Old Memory',
      'Old content',
      AUTO_PERSON_MEMORY_END,
      '',
      '## Footer',
    ].join('\n');

    const newSection = `${AUTO_PERSON_MEMORY_START}\nNew content\n${AUTO_PERSON_MEMORY_END}\n`;
    const result = upsertPersonMemorySection(existing, newSection);

    assert.ok(result.includes('New content'));
    assert.ok(!result.includes('Old content'));
    assert.ok(result.includes('# Alice'));
    assert.ok(result.includes('## Footer'));
  });

  it('preserves content before and after markers', () => {
    const before = '# Header\n\nIntro text.';
    const after = '\n\n## After section.';
    const existing = `${before}\n\n${AUTO_PERSON_MEMORY_START}\nold stuff\n${AUTO_PERSON_MEMORY_END}${after}`;

    const newSection = `${AUTO_PERSON_MEMORY_START}\nreplaced\n${AUTO_PERSON_MEMORY_END}\n`;
    const result = upsertPersonMemorySection(existing, newSection);

    assert.ok(result.includes('# Header'));
    assert.ok(result.includes('Intro text.'));
    assert.ok(result.includes('## After section.'));
    assert.ok(result.includes('replaced'));
    assert.ok(!result.includes('old stuff'));
  });

  it('result ends with newline', () => {
    const content = '# Alice';
    const result = upsertPersonMemorySection(content, section);
    assert.ok(result.endsWith('\n'));
  });
});

// ---------------------------------------------------------------------------
// extractPersonMemorySection / getPersonMemoryLastRefreshed / isMemoryStale
// ---------------------------------------------------------------------------

describe('extractPersonMemorySection', () => {
  it('returns null when no markers', () => {
    assert.equal(extractPersonMemorySection('no markers'), null);
  });

  it('extracts content between markers', () => {
    const content = `before\n${AUTO_PERSON_MEMORY_START}\ninner content\n${AUTO_PERSON_MEMORY_END}\nafter`;
    const result = extractPersonMemorySection(content);
    assert.equal(result, 'inner content');
  });

  it('returns null when markers are in wrong order', () => {
    const content = `${AUTO_PERSON_MEMORY_END}\nstuff\n${AUTO_PERSON_MEMORY_START}`;
    assert.equal(extractPersonMemorySection(content), null);
  });
});

describe('getPersonMemoryLastRefreshed', () => {
  it('returns null when no markers', () => {
    assert.equal(getPersonMemoryLastRefreshed('no section'), null);
  });

  it('extracts date from Last refreshed line', () => {
    const content = `${AUTO_PERSON_MEMORY_START}\nLast refreshed: 2026-02-15\n${AUTO_PERSON_MEMORY_END}`;
    assert.equal(getPersonMemoryLastRefreshed(content), '2026-02-15');
  });
});

describe('isMemoryStale', () => {
  it('returns true when ifStaleDays is undefined', () => {
    assert.equal(isMemoryStale('2026-01-01', undefined), true);
  });

  it('returns true when ifStaleDays is 0', () => {
    assert.equal(isMemoryStale('2026-01-01', 0), true);
  });

  it('returns true when lastRefreshed is null', () => {
    assert.equal(isMemoryStale(null, 7), true);
  });

  it('returns true when lastRefreshed is invalid', () => {
    assert.equal(isMemoryStale('not-a-date', 7), true);
  });

  it('returns true when days since refresh >= ifStaleDays', () => {
    const old = new Date();
    old.setDate(old.getDate() - 10);
    const dateStr = old.toISOString().slice(0, 10);
    assert.equal(isMemoryStale(dateStr, 7), true);
  });

  it('returns false when days since refresh < ifStaleDays', () => {
    const recent = new Date().toISOString().slice(0, 10);
    assert.equal(isMemoryStale(recent, 7), false);
  });
});

// ---------------------------------------------------------------------------
// renderPersonMemorySection
// ---------------------------------------------------------------------------

describe('renderPersonMemorySection', () => {
  const today = new Date().toISOString().slice(0, 10);

  it('renders asks and concerns only (backward compatible, no options)', () => {
    const asks: AggregatedPersonSignal[] = [
      { topic: 'pricing', count: 3, lastMentioned: '2026-02-10', sources: ['a.md', 'b.md'] },
    ];
    const concerns: AggregatedPersonSignal[] = [
      { topic: 'timeline', count: 2, lastMentioned: '2026-02-15', sources: ['c.md'] },
    ];

    const result = renderPersonMemorySection(asks, concerns);

    assert.ok(result.includes(AUTO_PERSON_MEMORY_START));
    assert.ok(result.includes(AUTO_PERSON_MEMORY_END));
    assert.ok(result.includes('### Repeated asks'));
    assert.ok(result.includes('- **pricing** — mentioned 3 times (last: 2026-02-10; sources: a.md, b.md)'));
    assert.ok(result.includes('### Repeated concerns'));
    assert.ok(result.includes('- **timeline** — mentioned 2 times (last: 2026-02-15; sources: c.md)'));
    // When no options, new sections show "None detected yet."
    assert.ok(result.includes('### Stances'));
    assert.ok(result.includes('### Open Items (I owe them)'));
    assert.ok(result.includes('### Open Items (They owe me)'));
    assert.ok(result.includes('### Relationship Health'));
  });

  it('renders empty sections as "None detected yet."', () => {
    const result = renderPersonMemorySection([], []);

    const noneCount = (result.match(/- None detected yet\./g) ?? []).length;
    // asks, concerns, stances, i_owe_them, they_owe_me, health = 6
    assert.equal(noneCount, 6, `Expected 6 "None detected yet." but found ${noneCount}`);
  });

  it('renders stances with source citations', () => {
    const stances: PersonStance[] = [
      {
        topic: 'microservices',
        direction: 'supports',
        summary: 'Prefers microservices for new features',
        evidenceQuote: 'I think we should use microservices',
        source: 'weekly-sync.md',
        date: '2026-02-20',
      },
      {
        topic: 'monolith',
        direction: 'opposes',
        summary: 'Against monolith approach',
        evidenceQuote: 'Monolith is too risky',
        source: 'arch-review.md',
        date: '2026-02-18',
      },
    ];

    const result = renderPersonMemorySection([], [], { stances });

    assert.ok(result.includes('### Stances'));
    assert.ok(result.includes('- **microservices** — supports: Prefers microservices for new features (from: weekly-sync.md, 2026-02-20)'));
    assert.ok(result.includes('- **monolith** — opposes: Against monolith approach (from: arch-review.md, 2026-02-18)'));
  });

  it('renders action items split by direction with source citations', () => {
    const actionItems: PersonActionItem[] = [
      {
        text: 'Send the proposal document',
        direction: 'i_owe_them',
        source: 'meeting1.md',
        date: '2026-02-20',
        hash: 'abc123',
        stale: false,
      },
      {
        text: 'Review the API spec',
        direction: 'they_owe_me',
        source: 'meeting2.md',
        date: '2026-02-21',
        hash: 'def456',
        stale: false,
      },
    ];

    const result = renderPersonMemorySection([], [], { actionItems });

    assert.ok(result.includes('### Open Items (I owe them)'));
    assert.ok(result.includes('- Send the proposal document (from: meeting1.md, 2026-02-20)'));
    assert.ok(result.includes('### Open Items (They owe me)'));
    assert.ok(result.includes('- Review the API spec (from: meeting2.md, 2026-02-21)'));
  });

  it('renders relationship health with all metrics', () => {
    const health: RelationshipHealth = {
      lastMet: '2026-02-25',
      daysSinceLastMet: 4,
      meetingsLast30Days: 3,
      meetingsLast90Days: 8,
      openLoopCount: 2,
      indicator: 'active',
    };

    const result = renderPersonMemorySection([], [], { health });

    assert.ok(result.includes('### Relationship Health'));
    assert.ok(result.includes('- Last met: 2026-02-25 (4 days ago)'));
    assert.ok(result.includes('- Meetings: 3 in last 30d, 8 in last 90d'));
    assert.ok(result.includes('- Open loops: 2'));
    assert.ok(result.includes('- Status: Active'));
  });

  it('renders health with null lastMet as "Never"', () => {
    const health: RelationshipHealth = {
      lastMet: null,
      daysSinceLastMet: null,
      meetingsLast30Days: 0,
      meetingsLast90Days: 0,
      openLoopCount: 0,
      indicator: 'dormant',
    };

    const result = renderPersonMemorySection([], [], { health });

    assert.ok(result.includes('- Last met: Never'));
    assert.ok(result.includes('- Status: Dormant'));
  });

  it('renders all health indicator variants', () => {
    const indicators: Array<{ indicator: RelationshipHealth['indicator']; expected: string }> = [
      { indicator: 'active', expected: 'Active' },
      { indicator: 'regular', expected: 'Regular' },
      { indicator: 'cooling', expected: 'Cooling' },
      { indicator: 'dormant', expected: 'Dormant' },
    ];

    for (const { indicator, expected } of indicators) {
      const health: RelationshipHealth = {
        lastMet: '2026-01-01',
        daysSinceLastMet: 60,
        meetingsLast30Days: 0,
        meetingsLast90Days: 1,
        openLoopCount: 0,
        indicator,
      };
      const result = renderPersonMemorySection([], [], { health });
      assert.ok(result.includes(`- Status: ${expected}`), `Expected "${expected}" for indicator "${indicator}"`);
    }
  });

  it('renders all sections within a single AUTO_PERSON_MEMORY block', () => {
    const stances: PersonStance[] = [
      { topic: 'api', direction: 'supports', summary: 'Likes REST', evidenceQuote: 'REST is great', source: 's.md', date: '2026-01-01' },
    ];
    const actionItems: PersonActionItem[] = [
      { text: 'Do X', direction: 'i_owe_them', source: 'a.md', date: '2026-01-01', hash: 'h1', stale: false },
    ];
    const health: RelationshipHealth = {
      lastMet: '2026-01-01',
      daysSinceLastMet: 10,
      meetingsLast30Days: 2,
      meetingsLast90Days: 5,
      openLoopCount: 1,
      indicator: 'active',
    };

    const result = renderPersonMemorySection([], [], { stances, actionItems, health });

    // Exactly one START and one END marker
    const startCount = (result.match(/<!-- AUTO_PERSON_MEMORY:START -->/g) ?? []).length;
    const endCount = (result.match(/<!-- AUTO_PERSON_MEMORY:END -->/g) ?? []).length;
    assert.equal(startCount, 1, 'Should have exactly one START marker');
    assert.equal(endCount, 1, 'Should have exactly one END marker');

    // All sections present
    assert.ok(result.includes('### Repeated asks'));
    assert.ok(result.includes('### Repeated concerns'));
    assert.ok(result.includes('### Stances'));
    assert.ok(result.includes('### Open Items (I owe them)'));
    assert.ok(result.includes('### Open Items (They owe me)'));
    assert.ok(result.includes('### Relationship Health'));
  });

  it('round-trip: render → upsert → extract preserves content', () => {
    const asks: AggregatedPersonSignal[] = [
      { topic: 'pricing', count: 2, lastMentioned: '2026-02-10', sources: ['a.md'] },
    ];
    const stances: PersonStance[] = [
      { topic: 'api', direction: 'concerned', summary: 'Worried about API costs', evidenceQuote: 'costs are high', source: 'sync.md', date: '2026-02-20' },
    ];
    const health: RelationshipHealth = {
      lastMet: '2026-02-25',
      daysSinceLastMet: 4,
      meetingsLast30Days: 3,
      meetingsLast90Days: 8,
      openLoopCount: 1,
      indicator: 'active',
    };

    const section = renderPersonMemorySection(asks, [], { stances, health });
    const existingContent = '# Alice\n\n## Notes\n\nSome notes here.\n';
    const upserted = upsertPersonMemorySection(existingContent, section);

    // Extract and verify key content is preserved
    const extracted = extractPersonMemorySection(upserted);
    assert.ok(extracted !== null, 'Extracted section should not be null');
    assert.ok(extracted!.includes('### Repeated asks'));
    assert.ok(extracted!.includes('**pricing**'));
    assert.ok(extracted!.includes('### Stances'));
    assert.ok(extracted!.includes('**api**'));
    assert.ok(extracted!.includes('### Relationship Health'));
    assert.ok(extracted!.includes('Status: Active'));
    // Original content preserved
    assert.ok(upserted.includes('# Alice'));
    assert.ok(upserted.includes('Some notes here.'));
  });

  it('empty action items for one direction shows "None detected yet."', () => {
    const actionItems: PersonActionItem[] = [
      { text: 'Review PR', direction: 'they_owe_me', source: 'x.md', date: '2026-01-01', hash: 'h1', stale: false },
    ];

    const result = renderPersonMemorySection([], [], { actionItems });

    // "I owe them" section should show none
    const iOweSection = result.slice(
      result.indexOf('### Open Items (I owe them)'),
      result.indexOf('### Open Items (They owe me)'),
    );
    assert.ok(iOweSection.includes('- None detected yet.'));

    // "They owe me" section should show the item
    const theyOweSection = result.slice(
      result.indexOf('### Open Items (They owe me)'),
      result.indexOf('### Relationship Health'),
    );
    assert.ok(theyOweSection.includes('- Review PR (from: x.md, 2026-01-01)'));
  });
});
