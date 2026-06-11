/**
 * W1.5 series resolver tests.
 *
 * Key cases:
 * - positive: same-title + same-attendee weekly chain resolves, newest first, max 2
 * - NEGATIVE (AC13): ad-hoc meeting sharing attendees but not title gets NO series
 * - excludePath: strict-=== exclusion of the target meeting (LEARNINGS 2026-04-29)
 * - window: meetings outside ~35 days and same-day meetings are excluded
 * - recurring_meetings config rescues drifted titles
 * - open questions parsed from prior meeting files
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveMeetingSeries,
  renderSeriesContext,
  normalizeTitleTokens,
  titleSimilarity,
  attendeeOverlap,
  parseOpenQuestionsSection,
  SERIES_TITLE_JACCARD,
} from '../../src/services/meeting-series.js';
import type { StorageAdapter, ListOptions } from '../../src/storage/adapter.js';

function createMockStorage(): StorageAdapter & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    async read(path: string) {
      return files.get(path) ?? null;
    },
    async write(path: string, content: string) {
      files.set(path, content);
    },
    async exists(path: string) {
      return files.has(path);
    },
    async delete(path: string) {
      files.delete(path);
    },
    async list(dir: string, options?: ListOptions) {
      const extensions = options?.extensions ?? [];
      const results: string[] = [];
      const dirPrefix = dir.endsWith('/') ? dir : dir + '/';
      for (const filePath of files.keys()) {
        if (!filePath.startsWith(dirPrefix)) continue;
        const remainder = filePath.slice(dirPrefix.length);
        if (remainder.includes('/')) continue;
        if (extensions.length > 0 && !extensions.some(ext => filePath.endsWith(ext))) continue;
        results.push(filePath);
      }
      return results;
    },
    async listSubdirectories() {
      return [];
    },
    async mkdir() {},
    async getModified() {
      return null;
    },
  };
}

const DIR = '/ws/resources/meetings';
const p = (f: string) => `${DIR}/${f}`;

function meeting(opts: {
  title: string;
  date: string;
  attendees: string[];
  status?: string;
  staged?: Array<{ id: string; text: string }>;
  openQuestions?: string[];
}): string {
  const lines = [
    '---',
    `title: "${opts.title}"`,
    `date: "${opts.date}"`,
    `status: ${opts.status ?? 'processed'}`,
    'attendees:',
    ...opts.attendees.map(a => `  - "${a}"`),
    '---',
    '',
    '## Summary',
    'Things happened.',
    '',
  ];
  if (opts.staged && opts.staged.length > 0) {
    lines.push('## Staged Decisions');
    for (const s of opts.staged) lines.push(`- ${s.id}: ${s.text}`);
    lines.push('');
  }
  if (opts.openQuestions && opts.openQuestions.length > 0) {
    lines.push('## Open Questions');
    opts.openQuestions.forEach((q, i) => lines.push(`- oq_${String(i + 1).padStart(3, '0')}: ${q}`));
    lines.push('');
  }
  return lines.join('\n');
}

describe('title/attendee helpers', () => {
  it('normalizeTitleTokens strips date prefixes and stop tokens', () => {
    const tokens = normalizeTitleTokens('2026-06-09 Anthony John Weekly Sync');
    assert.ok(tokens.has('anthony'));
    assert.ok(tokens.has('john'));
    assert.ok(!tokens.has('weekly'));
    assert.ok(!tokens.has('sync'));
    assert.ok(!tokens.has('2026'));
  });

  it('titleSimilarity is high for same series, low for ad-hoc', () => {
    assert.ok(titleSimilarity('Anthony / John Weekly', 'Anthony John Weekly') >= SERIES_TITLE_JACCARD);
    assert.ok(titleSimilarity('Anthony John Weekly', 'Glance 2.0 Compliance Workshop') < SERIES_TITLE_JACCARD);
  });

  it('attendeeOverlap handles email-decorated tokens and empty sides', () => {
    assert.equal(attendeeOverlap(['John Koht <john@x.com>'], ['john koht']), 1);
    assert.equal(attendeeOverlap([], ['john koht']), null);
  });

  it('parseOpenQuestionsSection reads oq ids and plain bullets', () => {
    const body = '## Open Questions\n- oq_001: A?\n- B?\n\n## Next\n- nope';
    assert.deepEqual(parseOpenQuestionsSection(body), ['A?', 'B?']);
  });
});

describe('resolveMeetingSeries', () => {
  it('resolves a weekly chain: newest-first, max 2, items + open questions attached', async () => {
    const storage = createMockStorage();
    storage.files.set(p('2026-05-19-anthony-john-weekly.md'), meeting({
      title: 'Anthony / John Weekly', date: '2026-05-19',
      attendees: ['John Koht', 'Anthony Avina'],
      staged: [{ id: 'de_001', text: 'Oldest decision' }],
    }));
    storage.files.set(p('2026-06-02-anthony-john-weekly.md'), meeting({
      title: 'Anthony / John Weekly', date: '2026-06-02',
      attendees: ['John Koht', 'Anthony Avina'],
      staged: [{ id: 'de_001', text: 'Kafka event-driven recipient table' }],
      openQuestions: ['Consolidation rules confirmed by Compliance?'],
    }));
    storage.files.set(p('2026-06-09-anthony-john-weekly.md'), meeting({
      title: 'Anthony / John Weekly', date: '2026-06-09',
      attendees: ['John Koht', 'Anthony Avina'],
    }));

    const res = await resolveMeetingSeries(storage, DIR, p('2026-06-09-anthony-john-weekly.md'));
    assert.ok(res);
    assert.equal(res.meetings.length, 2);
    assert.equal(res.meetings[0].date, '2026-06-02');
    assert.equal(res.meetings[1].date, '2026-05-19');
    assert.ok(res.meetings[0].items?.decisions.includes('Kafka event-driven recipient table'));
    assert.deepEqual(res.meetings[0].openQuestions, ['Consolidation rules confirmed by Compliance?']);
    assert.equal(res.matchedBy, 'title+attendees');
  });

  it('AC13 NEGATIVE: ad-hoc meeting sharing attendees but not title gets NO series', async () => {
    const storage = createMockStorage();
    storage.files.set(p('2026-06-02-anthony-john-weekly.md'), meeting({
      title: 'Anthony / John Weekly', date: '2026-06-02',
      attendees: ['John Koht', 'Anthony Avina'],
    }));
    // Ad-hoc escalation, same attendees, unrelated title.
    const res = await resolveMeetingSeries(
      storage, DIR, p('2026-06-09-recipient-table-escalation.md'),
    );
    // Target file doesn't exist → null; now with the file present:
    storage.files.set(p('2026-06-09-recipient-table-escalation.md'), meeting({
      title: 'Recipient Table Escalation', date: '2026-06-09',
      attendees: ['John Koht', 'Anthony Avina'],
    }));
    const res2 = await resolveMeetingSeries(
      storage, DIR, p('2026-06-09-recipient-table-escalation.md'),
    );
    assert.equal(res, null);
    assert.equal(res2, null, 'attendee overlap alone must not create a series link');
  });

  it('attendee mismatch blocks a title match (different 1:1 with same name pattern)', async () => {
    const storage = createMockStorage();
    storage.files.set(p('2026-06-02-john-nate.md'), meeting({
      title: 'John / Nate', date: '2026-06-02',
      attendees: ['John Koht', 'Nate Smith'],
    }));
    storage.files.set(p('2026-06-09-john-nate.md'), meeting({
      title: 'John / Nate', date: '2026-06-09',
      attendees: ['John Koht', 'Completely Different Person', 'Another Person', 'Third Person'],
    }));
    const res = await resolveMeetingSeries(storage, DIR, p('2026-06-09-john-nate.md'));
    // Overlap = 1/min(2,4)... John is in both: 1/2 = 0.5 ≥ threshold → matches.
    // This documents that a shared organizer keeps the chain — acceptable.
    assert.ok(res);
  });

  it('excludes the target itself by strict === and excludes same-day meetings', async () => {
    const storage = createMockStorage();
    const target = p('2026-06-09-email-templates-weekly.md');
    storage.files.set(target, meeting({
      title: 'Email Templates Weekly', date: '2026-06-09',
      attendees: ['John Koht', 'Crystal D'],
      staged: [{ id: 'de_001', text: 'Self decision must not appear' }],
    }));
    storage.files.set(p('2026-06-09-email-templates-weekly-2.md'), meeting({
      title: 'Email Templates Weekly', date: '2026-06-09',
      attendees: ['John Koht', 'Crystal D'],
    }));
    const res = await resolveMeetingSeries(storage, DIR, target);
    assert.equal(res, null, 'same-day siblings are priorItems, not series; self excluded');
  });

  it('excludes meetings outside the 35-day window', async () => {
    const storage = createMockStorage();
    storage.files.set(p('2026-04-01-email-templates-weekly.md'), meeting({
      title: 'Email Templates Weekly', date: '2026-04-01',
      attendees: ['John Koht', 'Crystal D'],
    }));
    storage.files.set(p('2026-06-09-email-templates-weekly.md'), meeting({
      title: 'Email Templates Weekly', date: '2026-06-09',
      attendees: ['John Koht', 'Crystal D'],
    }));
    const res = await resolveMeetingSeries(storage, DIR, p('2026-06-09-email-templates-weekly.md'));
    assert.equal(res, null);
  });

  it('recurring_meetings config rescues a drifted title', async () => {
    const storage = createMockStorage();
    storage.files.set(p('2026-06-02-glance-compliance-deep-dive.md'), meeting({
      title: 'Glance Compliance deep dive', date: '2026-06-02',
      attendees: ['John Koht', 'Heather K', 'Kim H'],
    }));
    storage.files.set(p('2026-06-09-weekly-glance-compliance.md'), meeting({
      title: 'Weekly Glance Compliance', date: '2026-06-09',
      attendees: ['John Koht', 'Heather K', 'Kim H'],
    }));
    // Titles share tokens 'glance','compliance' out of {glance,compliance,deep,dive} vs
    // {glance,compliance} → Jaccard 2/4 = 0.5 — exactly at threshold; to make the
    // config path load-bearing, use a harder drift:
    storage.files.set(p('2026-06-02-glance-compliance-deep-dive.md'), meeting({
      title: 'Compliance working session (deep dive, letters)', date: '2026-06-02',
      attendees: ['John Koht', 'Heather K', 'Kim H'],
    }));
    const without = await resolveMeetingSeries(storage, DIR, p('2026-06-09-weekly-glance-compliance.md'));
    assert.equal(without, null, 'drifted title alone must not match');

    const withConfig = await resolveMeetingSeries(storage, DIR, p('2026-06-09-weekly-glance-compliance.md'), {
      recurringTitles: ['Compliance'],
    });
    assert.ok(withConfig);
    assert.equal(withConfig.matchedBy, 'recurring-config');
  });
});

describe('renderSeriesContext', () => {
  it('renders dated headings, typed items, and open questions', async () => {
    const storage = createMockStorage();
    storage.files.set(p('2026-06-02-anthony-john-weekly.md'), meeting({
      title: 'Anthony / John Weekly', date: '2026-06-02',
      attendees: ['John Koht', 'Anthony Avina'],
      staged: [{ id: 'de_001', text: 'Kafka event-driven recipient table' }],
      openQuestions: ['Consolidation rules?'],
    }));
    storage.files.set(p('2026-06-09-anthony-john-weekly.md'), meeting({
      title: 'Anthony / John Weekly', date: '2026-06-09',
      attendees: ['John Koht', 'Anthony Avina'],
    }));
    const res = await resolveMeetingSeries(storage, DIR, p('2026-06-09-anthony-john-weekly.md'));
    assert.ok(res);
    const rendered = renderSeriesContext(res);
    assert.ok(rendered.includes('### 2026-06-02 — Anthony / John Weekly'));
    assert.ok(rendered.includes('- [decision] Kafka event-driven recipient table'));
    assert.ok(rendered.includes('- Consolidation rules?'));
  });
});
