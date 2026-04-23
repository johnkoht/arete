import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TopicMemoryService } from '../../src/services/topic-memory.js';
import { renderTopicPage, type TopicPage } from '../../src/models/topic-page.js';
import type { SearchProvider, SearchResult } from '../../src/search/types.js';

function topicPage(
  slug: string,
  overrides: Partial<TopicPage['frontmatter']> = {},
  sections: Record<string, string> = {},
): TopicPage {
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

/**
 * Make a storage adapter pre-populated with a map of path → content.
 * retrieveRelevant now reads files via storage.read(path), so tests must
 * seed the storage with the paths the mock search provider returns.
 */
function makeStorage(files: Record<string, string> = {}) {
  const store = new Map(Object.entries(files));
  return {
    store,
    async read(path: string) {
      return store.get(path) ?? null;
    },
    async write(path: string, content: string) {
      store.set(path, content);
    },
    async exists(path: string) {
      return store.has(path);
    },
    async delete() {},
    async list() {
      return [];
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

/**
 * Make a SearchProvider mock with a specific backend `name` so backend
 * classification can be tested. By default returns the `results` verbatim
 * from semanticSearch.
 */
function makeSearchProvider(
  results: Array<{ path: string; content?: string; score: number }>,
  name = 'fallback',
): SearchProvider {
  return {
    name,
    async isAvailable() {
      return true;
    },
    async search() {
      return results.map(
        (r): SearchResult => ({
          path: r.path,
          content: r.content ?? '',
          score: r.score,
          matchType: 'keyword',
        }),
      );
    },
    async semanticSearch() {
      return results.map(
        (r): SearchResult => ({
          path: r.path,
          content: r.content ?? '',
          score: r.score,
          matchType: 'semantic',
        }),
      );
    },
  };
}

const TOPIC_PATH = (slug: string) => `.arete/memory/topics/${slug}.md`;

// ---------------------------------------------------------------------------

describe('TopicMemoryService.retrieveRelevant', () => {
  it('returns searchBackend: "none" when provider not injected', async () => {
    const svc = new TopicMemoryService(makeStorage());
    const result = await svc.retrieveRelevant('anything');
    assert.deepStrictEqual(result.results, []);
    assert.strictEqual(result.searchBackend, 'none');
  });

  it('returns empty results when search returns no candidates', async () => {
    const svc = new TopicMemoryService(makeStorage(), makeSearchProvider([]));
    const r = await svc.retrieveRelevant('anything');
    assert.strictEqual(r.results.length, 0);
    assert.strictEqual(r.searchBackend, 'fallback');
  });

  it('classifies searchBackend as "qmd" when provider name is "qmd"', async () => {
    const page = topicPage('x');
    const storage = makeStorage({
      [TOPIC_PATH('x')]: renderTopicPage(page),
    });
    const svc = new TopicMemoryService(
      storage,
      makeSearchProvider([{ path: TOPIC_PATH('x'), score: 1 }], 'qmd'),
    );
    const r = await svc.retrieveRelevant('q');
    assert.strictEqual(r.searchBackend, 'qmd');
  });

  it('post-filters by .arete/memory/topics/ path prefix (qmd paths-ignored path)', async () => {
    // Simulate qmd's behavior: returns results from across the entire
    // workspace, ignoring the `paths` filter we passed.
    const topicA = topicPage('real-topic');
    const storage = makeStorage({
      [TOPIC_PATH('real-topic')]: renderTopicPage(topicA),
      'resources/meetings/some-meeting.md': 'body',
      'people/internal/jane.md': 'body',
    });
    const svc = new TopicMemoryService(
      storage,
      makeSearchProvider(
        [
          { path: 'resources/meetings/some-meeting.md', score: 0.9 },
          { path: 'people/internal/jane.md', score: 0.85 },
          { path: TOPIC_PATH('real-topic'), score: 0.5 },
        ],
        'qmd',
      ),
    );
    const r = await svc.retrieveRelevant('q');
    assert.strictEqual(r.results.length, 1, 'non-topic paths must be filtered out');
    assert.strictEqual(r.results[0].slug, 'real-topic');
  });

  it('tolerates absolute-prefix paths (different qmd path formats)', async () => {
    const page = topicPage('x');
    const storage = makeStorage({
      // Note: storage-adapter path matches what search returned
      '/ws/.arete/memory/topics/x.md': renderTopicPage(page),
    });
    const svc = new TopicMemoryService(
      storage,
      makeSearchProvider(
        [{ path: '/ws/.arete/memory/topics/x.md', score: 1.0 }],
        'qmd',
      ),
    );
    const r = await svc.retrieveRelevant('q');
    assert.strictEqual(r.results.length, 1, 'absolute path with /.arete/memory/topics/ must match');
  });

  it('re-reads full file content from disk (ignores snippet in result.content)', async () => {
    // qmd returns snippets, not full files. retrieveRelevant must read
    // from storage, not trust c.content.
    const fullPage = topicPage('cover-whale-templates');
    const storage = makeStorage({
      [TOPIC_PATH('cover-whale-templates')]: renderTopicPage(fullPage),
    });
    const svc = new TopicMemoryService(
      storage,
      // Search returns a snippet that would NOT parse as a topic page
      makeSearchProvider(
        [{
          path: TOPIC_PATH('cover-whale-templates'),
          content: '@@ -10,4 @@\n## Current state\n\nStaging.\n',
          score: 0.9,
        }],
        'qmd',
      ),
    );
    const r = await svc.retrieveRelevant('cover whale');
    assert.strictEqual(r.results.length, 1, 'must re-read full file, not trust snippet');
    assert.strictEqual(r.results[0].slug, 'cover-whale-templates');
  });

  it('ranks by combined score (qmd × 0.6) + recency bonus', async () => {
    const today = new Date();
    const recentDate = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const oldDate = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const recent = topicPage('recent', { last_refreshed: recentDate });
    const old = topicPage('old', { last_refreshed: oldDate });

    const storage = makeStorage({
      [TOPIC_PATH('recent')]: renderTopicPage(recent),
      [TOPIC_PATH('old')]: renderTopicPage(old),
    });
    const svc = new TopicMemoryService(
      storage,
      makeSearchProvider([
        { path: TOPIC_PATH('recent'), score: 0.5 },
        { path: TOPIC_PATH('old'), score: 0.8 },
      ]),
    );
    const r = await svc.retrieveRelevant('query');
    assert.strictEqual(r.results[0].slug, 'recent', 'recent rises despite lower raw score');
    assert.strictEqual(r.results[1].slug, 'old');
  });

  it('applies area-match bonus when options.area provided', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const match = topicPage('match', { area: 'my-area', last_refreshed: today });
    const noMatch = topicPage('no-match', { area: 'other-area', last_refreshed: today });

    const storage = makeStorage({
      [TOPIC_PATH('match')]: renderTopicPage(match),
      [TOPIC_PATH('no-match')]: renderTopicPage(noMatch),
    });
    const svc = new TopicMemoryService(
      storage,
      makeSearchProvider([
        { path: TOPIC_PATH('match'), score: 0.5 },
        { path: TOPIC_PATH('no-match'), score: 0.5 },
      ]),
    );
    const r = await svc.retrieveRelevant('query', { area: 'my-area' });
    assert.strictEqual(r.results[0].slug, 'match');
    assert.ok(r.results[0].score > r.results[1].score);
  });

  it('respects --limit (default 3)', async () => {
    const pages = Array.from({ length: 10 }, (_, i) => topicPage(`t${i}`));
    const storage = makeStorage(
      Object.fromEntries(pages.map((p) => [TOPIC_PATH(p.frontmatter.topic_slug), renderTopicPage(p)])),
    );
    const svc = new TopicMemoryService(
      storage,
      makeSearchProvider(
        pages.map((p, i) => ({
          path: TOPIC_PATH(p.frontmatter.topic_slug),
          score: 1 - i * 0.01,
        })),
      ),
    );

    const defaultLimit = await svc.retrieveRelevant('q');
    assert.strictEqual(defaultLimit.results.length, 3);

    const customLimit = await svc.retrieveRelevant('q', { limit: 5 });
    assert.strictEqual(customLimit.results.length, 5);
  });

  it('truncates bodyForContext to the word budget', async () => {
    const longCurrent = 'word '.repeat(500).trim();
    const longBackground = 'bg '.repeat(500).trim();
    const page = topicPage('fat', {}, {
      'Current state': longCurrent,
      'Why/background': longBackground,
    });
    const storage = makeStorage({
      [TOPIC_PATH('fat')]: renderTopicPage(page),
    });
    const svc = new TopicMemoryService(
      storage,
      makeSearchProvider([{ path: TOPIC_PATH('fat'), score: 1.0 }]),
    );
    const r = await svc.retrieveRelevant('q', { budgetWords: 100 });
    assert.strictEqual(r.results.length, 1);
    assert.ok(r.results[0].bodyForContext.includes('## Current state'));
    assert.ok(!r.results[0].bodyForContext.includes('## Why/background'));
  });

  it('skips Source trail and Change log from bodyForContext', async () => {
    const page = topicPage('t', {}, {
      'Current state': 'status',
      'Source trail': '- [[some-meeting]]',
      'Change log': '- 2026-04-22: updated',
    });
    const storage = makeStorage({
      [TOPIC_PATH('t')]: renderTopicPage(page),
    });
    const svc = new TopicMemoryService(
      storage,
      makeSearchProvider([{ path: TOPIC_PATH('t'), score: 1.0 }]),
    );
    const r = await svc.retrieveRelevant('q', { budgetWords: 10000 });
    assert.ok(!r.results[0].bodyForContext.includes('Source trail'));
    assert.ok(!r.results[0].bodyForContext.includes('Change log'));
  });

  it('tiebreaks equal scores by last_refreshed DESC then slug ASC', async () => {
    // All three have equal qmd score and equal recency bonus → test
    // last_refreshed tiebreak (newer first), with slug ASC as final tiebreak.
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400 * 1000).toISOString().slice(0, 10);

    const newA = topicPage('a-topic', { last_refreshed: tomorrow });
    const oldB = topicPage('b-topic', { last_refreshed: today });
    const newC = topicPage('c-topic', { last_refreshed: tomorrow });

    const storage = makeStorage({
      [TOPIC_PATH('a-topic')]: renderTopicPage(newA),
      [TOPIC_PATH('b-topic')]: renderTopicPage(oldB),
      [TOPIC_PATH('c-topic')]: renderTopicPage(newC),
    });
    const svc = new TopicMemoryService(
      storage,
      makeSearchProvider([
        { path: TOPIC_PATH('c-topic'), score: 0.5 },
        { path: TOPIC_PATH('a-topic'), score: 0.5 },
        { path: TOPIC_PATH('b-topic'), score: 0.5 },
      ]),
    );
    const r = await svc.retrieveRelevant('q');
    // Newer (a, c) tie by date; slug ASC puts 'a' first. Older 'b' last.
    assert.deepStrictEqual(
      r.results.map((x) => x.slug),
      ['a-topic', 'c-topic', 'b-topic'],
    );
  });

  it('skips candidates that do not exist in storage', async () => {
    const good = topicPage('valid');
    const storage = makeStorage({
      [TOPIC_PATH('valid')]: renderTopicPage(good),
    });
    const svc = new TopicMemoryService(
      storage,
      makeSearchProvider([
        { path: TOPIC_PATH('valid'), score: 0.9 },
        { path: TOPIC_PATH('not-on-disk'), score: 0.95 },
      ]),
    );
    const r = await svc.retrieveRelevant('q');
    assert.strictEqual(r.results.length, 1);
    assert.strictEqual(r.results[0].slug, 'valid');
  });

  it('handles malformed last_refreshed without crashing', async () => {
    const bad = topicPage('bad', { last_refreshed: 'not-a-date' });
    const storage = makeStorage({
      [TOPIC_PATH('bad')]: renderTopicPage(bad),
    });
    const svc = new TopicMemoryService(
      storage,
      makeSearchProvider([{ path: TOPIC_PATH('bad'), score: 1.0 }]),
    );
    const r = await svc.retrieveRelevant('q');
    // Still returned (no bonus, but included) — graceful degradation.
    assert.strictEqual(r.results.length, 1);
  });

  it('computes max score ≤ 0.9 (qmd × 0.6 + recency 0.2 + area 0.1)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const page = topicPage('x', { area: 'my-area', last_refreshed: today });
    const storage = makeStorage({
      [TOPIC_PATH('x')]: renderTopicPage(page),
    });
    const svc = new TopicMemoryService(
      storage,
      makeSearchProvider([{ path: TOPIC_PATH('x'), score: 1.0 }]),
    );
    const r = await svc.retrieveRelevant('q', { area: 'my-area' });
    // qmd 1.0 × 0.6 = 0.6, + recency 0.2 + area 0.1 = 0.9
    assert.ok(r.results[0].score <= 0.9 + 1e-9, `score ${r.results[0].score} exceeds max 0.9`);
    assert.ok(r.results[0].score >= 0.9 - 1e-9, `score ${r.results[0].score} should be at max 0.9`);
  });
});
