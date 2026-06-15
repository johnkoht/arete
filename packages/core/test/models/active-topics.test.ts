import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getActiveTopics,
  renderActiveTopicsAsWikilinks,
  renderActiveTopicsAsSlugList,
  maxLastRefreshed,
  type ActiveTopicEntry,
} from '../../src/models/active-topics.js';
import type { TopicPage } from '../../src/models/topic-page.js';

function page(slug: string, overrides: Partial<TopicPage['frontmatter']> = {}, sections: Record<string, string> = {}): TopicPage {
  return {
    frontmatter: {
      topic_slug: slug,
      status: 'active',
      first_seen: '2026-03-01',
      last_refreshed: '2026-04-22',
      sources_integrated: [],
      ...overrides,
    },
    sections: {
      'Current state': `${slug} is in motion.`,
      ...sections,
    },
  };
}

const REF_TODAY = new Date('2026-04-23T00:00:00Z');

// ---------------------------------------------------------------------------
// getActiveTopics
// ---------------------------------------------------------------------------

describe('getActiveTopics', () => {
  it('filters out stale topics without open items', () => {
    const pages = [
      page('recent', { last_refreshed: '2026-04-20' }),
      page('stale', { status: 'stale', last_refreshed: '2025-01-01' }),
    ];
    const out = getActiveTopics(pages, { today: REF_TODAY });
    assert.deepStrictEqual(out.map((e) => e.slug), ['recent']);
  });

  it('keeps stale topics that have open items', () => {
    const pages = [
      page('stale-but-urgent', { status: 'stale', last_refreshed: '2025-01-01' }),
    ];
    const openItems = new Map([['stale-but-urgent', 3]]);
    const out = getActiveTopics(pages, { today: REF_TODAY, openItemsBySlug: openItems });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].slug, 'stale-but-urgent');
  });

  it('keeps durable-status topics even when old and without open items', () => {
    for (const status of ['active', 'stable', 'blocked'] as const) {
      const pages = [page(`old-${status}`, { status, last_refreshed: '2025-01-01' })];
      const out = getActiveTopics(pages, { today: REF_TODAY });
      assert.deepStrictEqual(
        out.map((e) => e.slug),
        [`old-${status}`],
        `durable status '${status}' should survive the recency cutoff`,
      );
    }
  });

  it('drops old non-durable topics (new/stale/archived) without open items', () => {
    for (const status of ['new', 'stale', 'archived'] as const) {
      const pages = [page(`old-${status}`, { status, last_refreshed: '2025-01-01' })];
      const out = getActiveTopics(pages, { today: REF_TODAY });
      assert.deepStrictEqual(
        out.map((e) => e.slug),
        [],
        `non-durable status '${status}' should age out past the recency cutoff`,
      );
    }
  });

  it('does not resurrect an aged-out topic that is present in the map with openItems: 0', () => {
    // Regression guard for the keep-filter arm: a stale, old topic explicitly
    // present in openItemsBySlug with a 0 count must NOT be kept — a map entry
    // is not, by itself, a resurrection signal.
    const pages = [page('stale-zero', { status: 'stale', last_refreshed: '2025-01-01' })];
    const openItems = new Map([['stale-zero', 0]]);
    const out = getActiveTopics(pages, { today: REF_TODAY, openItemsBySlug: openItems });
    assert.deepStrictEqual(out.map((e) => e.slug), []);
  });

  it('sorts by (openItems desc, lastRefreshed desc, slug asc)', () => {
    const pages = [
      page('a-three', { last_refreshed: '2026-04-22' }),
      page('b-three', { last_refreshed: '2026-04-20' }),
      page('c-two', { last_refreshed: '2026-04-22' }),
      page('d-two', { last_refreshed: '2026-04-20' }),
    ];
    const openItems = new Map([
      ['a-three', 3],
      ['b-three', 3],
      ['c-two', 2],
      ['d-two', 2],
    ]);
    const out = getActiveTopics(pages, { today: REF_TODAY, openItemsBySlug: openItems });
    assert.deepStrictEqual(
      out.map((e) => e.slug),
      ['a-three', 'b-three', 'c-two', 'd-two'],
    );
  });

  it('ASCII string comparison only (no localeCompare)', () => {
    // Plain string compare: uppercase comes before lowercase.
    const pages = [page('zzz', { last_refreshed: '2026-04-22' }), page('Aaa', { last_refreshed: '2026-04-22' })];
    const out = getActiveTopics(pages, { today: REF_TODAY });
    // 'A' (0x41) < 'z' (0x7A) — plain string compare puts 'Aaa' first
    assert.deepStrictEqual(out.map((e) => e.slug), ['Aaa', 'zzz']);
  });

  it('produces byte-equal output under shuffled input', () => {
    const p1 = [page('a', { last_refreshed: '2026-04-22' }), page('b', { last_refreshed: '2026-04-22' }), page('c', { last_refreshed: '2026-04-22' })];
    const p2 = [page('c', { last_refreshed: '2026-04-22' }), page('b', { last_refreshed: '2026-04-22' }), page('a', { last_refreshed: '2026-04-22' })];
    const r1 = getActiveTopics(p1, { today: REF_TODAY });
    const r2 = getActiveTopics(p2, { today: REF_TODAY });
    assert.deepStrictEqual(r1, r2);
  });

  it('respects limit', () => {
    const pages = Array.from({ length: 50 }, (_, i) => page(`t${String(i).padStart(3, '0')}`));
    const out = getActiveTopics(pages, { today: REF_TODAY, limit: 5 });
    assert.strictEqual(out.length, 5);
  });

  it('defaults to a 25-entry cap (human-facing CLAUDE.md view)', () => {
    const pages = Array.from({ length: 50 }, (_, i) => page(`t${String(i).padStart(3, '0')}`));
    const out = getActiveTopics(pages, { today: REF_TODAY });
    assert.strictEqual(out.length, 25);
  });

  it('I-3: with no limit (Infinity), a canonical slug ranked >25 reaches the list', () => {
    // 117 active topics, all same recency → sorted by slug asc. The slug that
    // sorts to rank #117 is dropped by the default 25-cap but MUST be present
    // for the extractor-bias path (Strategy A: no-limit bias list).
    const pages = Array.from({ length: 117 }, (_, i) =>
      page(`topic-${String(i).padStart(3, '0')}`, { last_refreshed: '2026-04-22' }),
    );
    const ranked117 = 'topic-116'; // sorts last under slug-asc tiebreak

    const capped = getActiveTopics(pages, { today: REF_TODAY }); // default 25
    assert.strictEqual(capped.length, 25);
    assert.ok(
      !capped.some((e) => e.slug === ranked117),
      'rank-117 slug should be truncated under the default cap (repro of the bug)',
    );

    const unbounded = getActiveTopics(pages, {
      today: REF_TODAY,
      limit: Number.POSITIVE_INFINITY,
    });
    assert.strictEqual(unbounded.length, 117, 'no-limit returns all active entries');
    assert.ok(
      unbounded.some((e) => e.slug === ranked117),
      'rank-117 slug must reach the bias list when no limit is passed',
    );

    // And it survives the bias-list render the meeting extractor consumes.
    const rendered = renderActiveTopicsAsSlugList(unbounded);
    assert.ok(rendered.includes(ranked117));
  });

  it('populates summary from Current state headline', () => {
    const pages = [
      page('x', {}, { 'Current state': 'Staging-validated; awaiting pilot.\n\nExtra paragraph.' }),
    ];
    const out = getActiveTopics(pages, { today: REF_TODAY });
    assert.strictEqual(out[0].summary, 'Staging-validated; awaiting pilot.');
  });

  it('is stable across wall-clock days given identical inputs (injected today)', () => {
    const pages = [page('a', { last_refreshed: '2026-04-20' })];
    const day1 = new Date('2026-04-23T00:00:00Z');
    const day2 = new Date('2026-04-24T00:00:00Z');
    const r1 = getActiveTopics(pages, { today: day1 });
    const r2 = getActiveTopics(pages, { today: day2 });
    // Within 90d window on both → both include the topic, identical entries.
    assert.deepStrictEqual(r1, r2);
  });

  it('omits area field when absent from frontmatter', () => {
    const pages = [page('x'), page('y', { area: 'glance-comms' })];
    const out = getActiveTopics(pages, { today: REF_TODAY });
    const x = out.find((e) => e.slug === 'x');
    const y = out.find((e) => e.slug === 'y');
    assert.ok(x !== undefined && !('area' in x));
    assert.strictEqual(y?.area, 'glance-comms');
  });
});

// ---------------------------------------------------------------------------
// renderActiveTopicsAsWikilinks
// ---------------------------------------------------------------------------

describe('renderActiveTopicsAsWikilinks', () => {
  it('renders each entry as an Obsidian [[wikilink]] bullet', () => {
    const entries: ActiveTopicEntry[] = [
      {
        slug: 'cover-whale-templates',
        area: 'glance-comms',
        status: 'active',
        summary: 'Staging-validated.',
        lastRefreshed: '2026-04-22',
      },
    ];
    const out = renderActiveTopicsAsWikilinks(entries);
    assert.match(out, /^- \[\[cover-whale-templates\]\] \(glance-comms\) — active — Staging-validated\./);
  });

  it('omits area parens when entry has no area', () => {
    const entries: ActiveTopicEntry[] = [
      { slug: 'solo', status: 'active', summary: 'x', lastRefreshed: '2026-04-22' },
    ];
    const out = renderActiveTopicsAsWikilinks(entries);
    assert.match(out, /^- \[\[solo\]\] — active — x$/);
  });

  it('omits summary dash when summary is empty', () => {
    const entries: ActiveTopicEntry[] = [
      { slug: 'x', status: 'stub', summary: '', lastRefreshed: '2026-04-22' },
    ];
    const out = renderActiveTopicsAsWikilinks(entries);
    assert.match(out, /^- \[\[x\]\] — stub$/);
  });

  it('returns empty string for empty input', () => {
    assert.strictEqual(renderActiveTopicsAsWikilinks([]), '');
  });
});

// ---------------------------------------------------------------------------
// renderActiveTopicsAsSlugList
// ---------------------------------------------------------------------------

describe('renderActiveTopicsAsSlugList', () => {
  it('renders bare slugs (no wikilinks)', () => {
    const entries: ActiveTopicEntry[] = [
      { slug: 'cover-whale-templates', status: 'active', summary: 'live', lastRefreshed: '2026-04-22' },
    ];
    const out = renderActiveTopicsAsSlugList(entries);
    assert.strictEqual(out, 'cover-whale-templates — active: live');
    assert.ok(!out.includes('[['));
    assert.ok(!out.includes(']]'));
  });

  it('critical: output round-trips into extraction prompt without [[ leakage', () => {
    // Repro of reviewer §6 concern: if extraction prompt echoes slug list
    // into its JSON output, we must not have wikilinks in the list.
    const entries: ActiveTopicEntry[] = [
      { slug: 'a', status: 'new', summary: '', lastRefreshed: '2026-04-22' },
    ];
    const out = renderActiveTopicsAsSlugList(entries);
    assert.ok(!out.includes('['));
    assert.ok(!out.includes(']'));
  });
});

// ---------------------------------------------------------------------------
// maxLastRefreshed
// ---------------------------------------------------------------------------

describe('maxLastRefreshed', () => {
  it('returns max date across entries (lexicographic ISO)', () => {
    const entries: ActiveTopicEntry[] = [
      { slug: 'a', status: 'x', summary: '', lastRefreshed: '2026-04-20' },
      { slug: 'b', status: 'x', summary: '', lastRefreshed: '2026-04-22' },
      { slug: 'c', status: 'x', summary: '', lastRefreshed: '2026-04-21' },
    ];
    assert.strictEqual(maxLastRefreshed(entries), '2026-04-22');
  });

  it('returns empty string for empty input', () => {
    assert.strictEqual(maxLastRefreshed([]), '');
  });
});
