import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TopicMemoryService } from '../../src/services/topic-memory.js';
import { renderTopicPage, type TopicPage } from '../../src/models/topic-page.js';
import type { SearchProvider, SearchResult } from '../../src/search/types.js';

function topicPage(slug: string, overrides: Partial<TopicPage['frontmatter']> = {}, sections: Record<string, string> = {}): TopicPage {
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
      'Current state': `${slug} current state.`,
      ...sections,
    },
  };
}

function makeStorage() {
  return {
    read: async () => null,
    write: async () => {},
    exists: async () => false,
    delete: async () => {},
    list: async () => [],
    listSubdirectories: async () => [],
    mkdir: async () => {},
    getModified: async () => null,
  };
}

function makeSearchProvider(results: Array<{ path: string; content: string; score: number }>): SearchProvider {
  return {
    name: 'mock',
    async isAvailable() {
      return true;
    },
    async search() {
      return results.map(
        (r): SearchResult => ({ ...r, matchType: 'keyword' }),
      );
    },
    async semanticSearch() {
      return results.map(
        (r): SearchResult => ({ ...r, matchType: 'semantic' }),
      );
    },
  };
}

describe('TopicMemoryService.retrieveRelevant', () => {
  it('returns empty array when searchProvider not injected', async () => {
    const svc = new TopicMemoryService(makeStorage());
    const results = await svc.retrieveRelevant('anything');
    assert.deepStrictEqual(results, []);
  });

  it('returns empty when search returns no candidates', async () => {
    const svc = new TopicMemoryService(makeStorage(), makeSearchProvider([]));
    const results = await svc.retrieveRelevant('anything');
    assert.deepStrictEqual(results, []);
  });

  it('ranks by combined score (qmd × 0.6) + recency bonus', async () => {
    // Two candidates:
    //  - `recent`: qmd score 0.5 → weighted 0.30, + 0.2 recency bonus (within 30d) = 0.50
    //  - `old`:    qmd score 0.8 → weighted 0.48, no recency bonus                 = 0.48
    // Recent should edge out the higher raw score.
    const today = new Date();
    const recentDate = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const oldDate = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const recentPage = topicPage('recent', { last_refreshed: recentDate });
    const oldPage = topicPage('old', { last_refreshed: oldDate });

    const provider = makeSearchProvider([
      { path: 'recent.md', content: renderTopicPage(recentPage), score: 0.5 },
      { path: 'old.md', content: renderTopicPage(oldPage), score: 0.8 },
    ]);

    const svc = new TopicMemoryService(makeStorage(), provider);
    const results = await svc.retrieveRelevant('query');
    assert.strictEqual(results[0].slug, 'recent', 'recent should rank first (recency bonus)');
    assert.strictEqual(results[1].slug, 'old');
  });

  it('applies area-match bonus when options.area provided', async () => {
    // Both equally recent; only area match differs.
    const today = new Date().toISOString().slice(0, 10);
    const match = topicPage('match', { area: 'my-area', last_refreshed: today });
    const noMatch = topicPage('no-match', { area: 'other-area', last_refreshed: today });

    const provider = makeSearchProvider([
      { path: 'match.md', content: renderTopicPage(match), score: 0.5 },
      { path: 'no-match.md', content: renderTopicPage(noMatch), score: 0.5 },
    ]);

    const svc = new TopicMemoryService(makeStorage(), provider);
    const results = await svc.retrieveRelevant('query', { area: 'my-area' });
    assert.strictEqual(results[0].slug, 'match', 'area-tagged topic ranks first');
    assert.ok(results[0].score > results[1].score);
  });

  it('respects --limit (default 3)', async () => {
    const pages = Array.from({ length: 10 }, (_, i) => topicPage(`t${i}`));
    const provider = makeSearchProvider(
      pages.map((p, i) => ({
        path: `${p.frontmatter.topic_slug}.md`,
        content: renderTopicPage(p),
        score: 1 - i * 0.01,
      })),
    );
    const svc = new TopicMemoryService(makeStorage(), provider);

    const defaultLimit = await svc.retrieveRelevant('q');
    assert.strictEqual(defaultLimit.length, 3);

    const customLimit = await svc.retrieveRelevant('q', { limit: 5 });
    assert.strictEqual(customLimit.length, 5);
  });

  it('truncates bodyForContext to the word budget', async () => {
    const longCurrent = 'word '.repeat(500).trim();
    const longBackground = 'bg '.repeat(500).trim();
    const page = topicPage('fat', {}, {
      'Current state': longCurrent,
      'Why/background': longBackground,
    });
    const provider = makeSearchProvider([
      { path: 'fat.md', content: renderTopicPage(page), score: 1.0 },
    ]);
    const svc = new TopicMemoryService(makeStorage(), provider);
    const results = await svc.retrieveRelevant('q', { budgetWords: 100 });
    assert.strictEqual(results.length, 1);
    // selectSectionsForBudget always includes Current state (even if over budget);
    // the over-budget section fills the budget and subsequent sections are excluded.
    assert.ok(results[0].bodyForContext.includes('## Current state'));
    assert.ok(!results[0].bodyForContext.includes('## Why/background'));
  });

  it('skips Source trail and Change log from bodyForContext', async () => {
    const page = topicPage('t', {}, {
      'Current state': 'status',
      'Source trail': '- [[some-meeting]]',
      'Change log': '- 2026-04-22: updated',
    });
    const provider = makeSearchProvider([
      { path: 't.md', content: renderTopicPage(page), score: 1.0 },
    ]);
    const svc = new TopicMemoryService(makeStorage(), provider);
    const results = await svc.retrieveRelevant('q', { budgetWords: 10000 });
    assert.ok(!results[0].bodyForContext.includes('Source trail'));
    assert.ok(!results[0].bodyForContext.includes('Change log'));
  });

  it('deterministic tiebreak by slug for equal scores', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const a = topicPage('a-topic', { last_refreshed: today });
    const b = topicPage('b-topic', { last_refreshed: today });
    const c = topicPage('c-topic', { last_refreshed: today });

    const provider1 = makeSearchProvider([
      { path: 'c.md', content: renderTopicPage(c), score: 0.5 },
      { path: 'a.md', content: renderTopicPage(a), score: 0.5 },
      { path: 'b.md', content: renderTopicPage(b), score: 0.5 },
    ]);
    const provider2 = makeSearchProvider([
      { path: 'a.md', content: renderTopicPage(a), score: 0.5 },
      { path: 'b.md', content: renderTopicPage(b), score: 0.5 },
      { path: 'c.md', content: renderTopicPage(c), score: 0.5 },
    ]);

    const r1 = await new TopicMemoryService(makeStorage(), provider1).retrieveRelevant('q');
    const r2 = await new TopicMemoryService(makeStorage(), provider2).retrieveRelevant('q');

    assert.deepStrictEqual(
      r1.map((r) => r.slug),
      r2.map((r) => r.slug),
      'reshuffled candidates produce identical ranked output',
    );
    assert.deepStrictEqual(r1.map((r) => r.slug), ['a-topic', 'b-topic', 'c-topic']);
  });

  it('skips candidates that fail to parse', async () => {
    const good = topicPage('valid');
    const provider = makeSearchProvider([
      { path: 'valid.md', content: renderTopicPage(good), score: 0.9 },
      { path: 'bogus.md', content: 'not-a-topic-page', score: 0.95 },
    ]);
    const svc = new TopicMemoryService(makeStorage(), provider);
    const results = await svc.retrieveRelevant('q');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].slug, 'valid');
  });
});
