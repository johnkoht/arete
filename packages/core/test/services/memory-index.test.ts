import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderMemoryIndex,
  MemoryIndexService,
  type MemoryIndexData,
} from '../../src/services/memory-index.js';
import type { TopicPage } from '../../src/models/topic-page.js';
import type { Person } from '../../src/models/entities.js';

function topicPage(slug: string, overrides: Partial<TopicPage['frontmatter']> = {}): TopicPage {
  return {
    frontmatter: {
      topic_slug: slug,
      status: 'active',
      first_seen: '2026-03-01',
      last_refreshed: '2026-04-22',
      sources_integrated: [],
      ...overrides,
    },
    sections: { 'Current state': `${slug} is in active development.` },
  };
}

function person(slug: string, name: string, role?: string): Person {
  return {
    slug,
    name,
    email: null,
    role: role ?? null,
    company: null,
    team: null,
    category: 'internal',
  };
}

// ---------------------------------------------------------------------------
// renderMemoryIndex
// ---------------------------------------------------------------------------

describe('renderMemoryIndex', () => {
  it('emits header + empty body when all lists are empty', () => {
    const out = renderMemoryIndex({ topics: [], people: [], areas: [] });
    assert.match(out, /^# Memory Index/);
    assert.ok(!out.includes('## Topics'));
    assert.ok(!out.includes('## People'));
    assert.ok(!out.includes('## Areas'));
  });

  it('renders topics with wikilinks, status, headline, date', () => {
    const out = renderMemoryIndex({
      topics: [topicPage('cover-whale-templates')],
      people: [],
      areas: [],
    });
    assert.match(
      out,
      /- \[\[cover-whale-templates\]\] — active — cover-whale-templates is in active development\. _\(updated: 2026-04-22\)_/,
    );
  });

  it('renders people with slug wikilink and role', () => {
    const out = renderMemoryIndex({
      topics: [],
      people: [person('anthony-avina', 'Anthony Avina', 'engineer')],
      areas: [],
    });
    assert.match(out, /- \[\[anthony-avina\]\] — Anthony Avina — engineer/);
  });

  it('renders areas with topic + open counts', () => {
    const out = renderMemoryIndex({
      topics: [],
      people: [],
      areas: [{ slug: 'glance-comms', name: 'Glance Communications', topicCount: 4, openItemCount: 12 }],
    });
    assert.match(out, /- \[\[glance-comms\]\] — Glance Communications — 4 topics, 12 open/);
  });

  it('uses singular "topic" for count=1', () => {
    const out = renderMemoryIndex({
      topics: [],
      people: [],
      areas: [{ slug: 'a', name: 'A', topicCount: 1, openItemCount: 0 }],
    });
    assert.match(out, /1 topic\b/);
    assert.ok(!out.includes('1 topics'));
  });

  it('omits open count when zero', () => {
    const out = renderMemoryIndex({
      topics: [],
      people: [],
      areas: [{ slug: 'a', name: 'A', topicCount: 3, openItemCount: 0 }],
    });
    assert.match(out, /- \[\[a\]\] — A — 3 topics$/m);
    assert.ok(!out.includes('0 open'));
  });

  it('sorts each section by slug asc (deterministic)', () => {
    const out = renderMemoryIndex({
      topics: [topicPage('zebra'), topicPage('apple'), topicPage('mango')],
      people: [
        person('zack', 'Zack'),
        person('alice', 'Alice'),
        person('mike', 'Mike'),
      ],
      areas: [
        { slug: 'zeta', name: 'Z', topicCount: 0, openItemCount: 0 },
        { slug: 'alpha', name: 'A', topicCount: 0, openItemCount: 0 },
      ],
    });
    assert.ok(out.indexOf('[[apple]]') < out.indexOf('[[mango]]'));
    assert.ok(out.indexOf('[[mango]]') < out.indexOf('[[zebra]]'));
    assert.ok(out.indexOf('[[alice]]') < out.indexOf('[[mike]]'));
    assert.ok(out.indexOf('[[mike]]') < out.indexOf('[[zack]]'));
    assert.ok(out.indexOf('[[alpha]]') < out.indexOf('[[zeta]]'));
  });

  it('produces byte-equal output under input reshuffling', () => {
    const input1: MemoryIndexData = {
      topics: [topicPage('a'), topicPage('b'), topicPage('c')],
      people: [person('p1', 'P1'), person('p2', 'P2')],
      areas: [
        { slug: 'x', name: 'X', topicCount: 2, openItemCount: 1 },
        { slug: 'y', name: 'Y', topicCount: 1, openItemCount: 0 },
      ],
    };
    const input2: MemoryIndexData = {
      topics: [topicPage('c'), topicPage('a'), topicPage('b')],
      people: [person('p2', 'P2'), person('p1', 'P1')],
      areas: [
        { slug: 'y', name: 'Y', topicCount: 1, openItemCount: 0 },
        { slug: 'x', name: 'X', topicCount: 2, openItemCount: 1 },
      ],
    };
    assert.strictEqual(renderMemoryIndex(input1), renderMemoryIndex(input2));
  });

  it('surfaces diagnostic footer when errors present', () => {
    const out = renderMemoryIndex({
      topics: [],
      people: [],
      areas: [],
      errors: ['topic foo.md: bad frontmatter', 'topic bar.md: empty'],
    });
    assert.match(out, /2 item\(s\) excluded due to errors/);
  });

  it('does not embed wall-clock timestamps', () => {
    const out = renderMemoryIndex({ topics: [topicPage('x')], people: [], areas: [] });
    assert.doesNotMatch(out, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it('omits headline suffix when topic has empty Current state', () => {
    const pageNoHeadline: TopicPage = {
      frontmatter: topicPage('empty-topic').frontmatter,
      sections: {},
    };
    const out = renderMemoryIndex({
      topics: [pageNoHeadline],
      people: [],
      areas: [],
    });
    // Should render: - [[empty-topic]] — active _(updated: ...)_
    assert.match(out, /- \[\[empty-topic\]\] — active _\(updated:/);
    assert.ok(!out.includes('active — —'));
  });
});

// ---------------------------------------------------------------------------
// MemoryIndexService (gather + idempotent write)
// ---------------------------------------------------------------------------

describe('MemoryIndexService.refreshMemoryIndex', () => {
  function makeStorage() {
    const store = new Map<string, string>();
    return {
      store,
      read: async (p: string) => store.get(p) ?? null,
      write: async (p: string, c: string) => {
        store.set(p, c);
      },
      writeIfChanged: async (p: string, c: string): Promise<'unchanged' | 'updated'> => {
        const existing = store.get(p) ?? null;
        if (existing === c) return 'unchanged';
        store.set(p, c);
        return 'updated';
      },
      exists: async (p: string) => store.has(p),
      delete: async () => {},
      list: async () => [],
      listSubdirectories: async () => [],
      mkdir: async () => {},
      getModified: async () => null,
    };
  }

  function makeDeps(store: Map<string, string>) {
    const topicMemory = {
      listAll: async () => ({
        topics: [topicPage('a-topic'), topicPage('b-topic')],
        errors: [] as Array<{ path: string; reason: string }>,
      }),
    } as unknown as import('../../src/services/topic-memory.js').TopicMemoryService;

    const entity = {
      listPeople: async () => [person('alice', 'Alice'), person('bob', 'Bob')],
    } as unknown as import('../../src/services/entity.js').EntityService;

    const areaParser = {
      listAreas: async () => [
        { slug: 'area1', name: 'Area 1', recurringMeetings: [], keywords: [] },
        { slug: 'area2', name: 'Area 2', recurringMeetings: [], keywords: [] },
      ],
    } as unknown as import('../../src/services/area-parser.js').AreaParserService;

    const commitments = {
      listOpen: async () => [],
    };

    void store;
    return { topicMemory, entity, areaParser, commitments };
  }

  const paths = {
    memory: '/ws/.arete/memory',
  } as import('../../src/models/workspace.js').WorkspacePaths;

  it('writes index.md on first refresh', async () => {
    const storage = makeStorage();
    const deps = makeDeps(storage.store);
    const svc = new MemoryIndexService(
      storage,
      deps.topicMemory,
      deps.entity,
      deps.areaParser,
      deps.commitments,
    );
    const result = await svc.refreshMemoryIndex(paths);
    assert.strictEqual(result, 'updated');
    const content = storage.store.get('/ws/.arete/memory/index.md');
    assert.ok(content !== undefined);
    assert.match(content, /## Topics \(2\)/);
    assert.match(content, /## People \(2\)/);
    assert.match(content, /## Areas \(2\)/);
  });

  it('returns "unchanged" on second refresh with identical data (idempotency)', async () => {
    const storage = makeStorage();
    const deps = makeDeps(storage.store);
    const svc = new MemoryIndexService(
      storage,
      deps.topicMemory,
      deps.entity,
      deps.areaParser,
      deps.commitments,
    );
    await svc.refreshMemoryIndex(paths);
    const result2 = await svc.refreshMemoryIndex(paths);
    assert.strictEqual(result2, 'unchanged');
  });

  it('gracefully surfaces errors when a source throws', async () => {
    const storage = makeStorage();
    const deps = makeDeps(storage.store);
    const throwingTopicMemory = {
      listAll: async () => {
        throw new Error('kaboom');
      },
    } as unknown as import('../../src/services/topic-memory.js').TopicMemoryService;

    const svc = new MemoryIndexService(
      storage,
      throwingTopicMemory,
      deps.entity,
      deps.areaParser,
      deps.commitments,
    );
    const result = await svc.refreshMemoryIndex(paths);
    assert.strictEqual(result, 'updated');
    const content = storage.store.get('/ws/.arete/memory/index.md')!;
    assert.match(content, /excluded due to errors/);
    // People and Areas should still render — partial-state tolerant.
    assert.match(content, /## People \(2\)/);
    assert.match(content, /## Areas \(2\)/);
  });

  it('falls back to read-then-write when writeIfChanged not available', async () => {
    const store = new Map<string, string>();
    const storage = {
      store,
      read: async (p: string) => store.get(p) ?? null,
      write: async (p: string, c: string) => {
        store.set(p, c);
      },
      exists: async () => false,
      delete: async () => {},
      list: async () => [],
      listSubdirectories: async () => [],
      mkdir: async () => {},
      getModified: async () => null,
      // NOTE: no writeIfChanged — fallback path
    };
    const deps = makeDeps(store);
    const svc = new MemoryIndexService(
      storage,
      deps.topicMemory,
      deps.entity,
      deps.areaParser,
      deps.commitments,
    );
    const first = await svc.refreshMemoryIndex(paths);
    assert.strictEqual(first, 'updated');
    const second = await svc.refreshMemoryIndex(paths);
    assert.strictEqual(second, 'unchanged');
  });
});
