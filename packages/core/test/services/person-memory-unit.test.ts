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
