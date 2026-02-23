/**
 * Tests for Notion API client: rate limiting, retry, error handling,
 * pagination, iterative block fetching, max depth cutoff.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NotionClient, RateLimiter, MAX_DEPTH, type PageMetadata } from '../../../src/integrations/notion/client.js';

// ---------------------------------------------------------------------------
// Mock fetch helper
// ---------------------------------------------------------------------------

type MockResponse = {
  status: number;
  statusText?: string;
  body: unknown;
};

function createMockFetch(responses: MockResponse[]): typeof fetch & { calls: Array<{ url: string; init: RequestInit }> } {
  const queue = [...responses];
  const calls: Array<{ url: string; init: RequestInit }> = [];

  const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init: init ?? {} });

    const resp = queue.shift();
    if (!resp) throw new Error(`No more mock responses (call #${calls.length})`);

    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      statusText: resp.statusText ?? 'OK',
      json: async () => resp.body,
      text: async () => (typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.body)),
    } as Response;
  }) as typeof fetch & { calls: Array<{ url: string; init: RequestInit }> };

  mockFetch.calls = calls;
  return mockFetch;
}

// ---------------------------------------------------------------------------
// Page fixture
// ---------------------------------------------------------------------------

function makePageResponse(overrides?: Partial<Record<string, unknown>>) {
  return {
    object: 'page',
    id: 'abc12345-def6-7890-abcd-ef1234567890',
    created_time: '2026-01-15T10:00:00.000Z',
    last_edited_time: '2026-02-20T14:30:00.000Z',
    url: 'https://www.notion.so/workspace/My-Page-abc12345',
    properties: {
      title: {
        id: 'title',
        type: 'title',
        title: [{ plain_text: 'My Test Page' }],
      },
    },
    ...overrides,
  };
}

function makeBlocksResponse(
  blocks: Array<{ id: string; type: string; has_children?: boolean; content?: string }>,
  hasMore = false,
  nextCursor: string | null = null
) {
  return {
    object: 'list',
    results: blocks.map((b) => ({
      object: 'block',
      id: b.id,
      type: b.type,
      has_children: b.has_children ?? false,
      [b.type]: {
        rich_text: b.content
          ? [{ type: 'text', plain_text: b.content, href: null, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' } }]
          : [],
      },
    })),
    has_more: hasMore,
    next_cursor: nextCursor,
  };
}

function createNoOpRateLimiter(): RateLimiter {
  const rl = new RateLimiter(1000, 1000); // effectively unlimited
  rl.delay = async () => {}; // no-op
  return rl;
}

function createClient(mockFetch: typeof fetch, rateLimiter?: RateLimiter): NotionClient {
  const client = new NotionClient('ntn_test_key', {
    fetchFn: mockFetch,
    rateLimiter: rateLimiter ?? createNoOpRateLimiter(),
  });
  // Override delay so retries don't actually wait
  client.delayFn = async () => {};
  return client;
}

// ---------------------------------------------------------------------------
// getPage
// ---------------------------------------------------------------------------

describe('NotionClient.getPage', () => {
  it('fetches page metadata successfully', async () => {
    const mockFetch = createMockFetch([
      { status: 200, body: makePageResponse() },
    ]);
    const client = createClient(mockFetch);

    const page = await client.getPage('abc12345');
    assert.equal(page.title, 'My Test Page');
    assert.equal(page.id, 'abc12345-def6-7890-abcd-ef1234567890');
    assert.equal(page.url, 'https://www.notion.so/workspace/My-Page-abc12345');
    assert.equal(page.lastEditedTime, '2026-02-20T14:30:00.000Z');
    assert.equal(page.createdTime, '2026-01-15T10:00:00.000Z');
  });

  it('sends correct auth and version headers', async () => {
    const mockFetch = createMockFetch([
      { status: 200, body: makePageResponse() },
    ]);
    const client = createClient(mockFetch);

    await client.getPage('abc');
    assert.equal(mockFetch.calls.length, 1);
    const headers = mockFetch.calls[0].init.headers as Record<string, string>;
    assert.equal(headers['Authorization'], 'Bearer ntn_test_key');
    assert.equal(headers['Notion-Version'], '2022-06-28');
  });

  it('returns "Untitled" when no title property exists', async () => {
    const mockFetch = createMockFetch([
      { status: 200, body: makePageResponse({ properties: {} }) },
    ]);
    const client = createClient(mockFetch);

    const page = await client.getPage('abc');
    assert.equal(page.title, 'Untitled');
  });

  it('extracts title from non-standard property name', async () => {
    const mockFetch = createMockFetch([
      {
        status: 200,
        body: makePageResponse({
          properties: {
            Name: {
              id: 'name',
              type: 'title',
              title: [{ plain_text: 'Custom Title' }],
            },
          },
        }),
      },
    ]);
    const client = createClient(mockFetch);

    const page = await client.getPage('abc');
    assert.equal(page.title, 'Custom Title');
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('NotionClient error handling', () => {
  it('404 returns actionable page-not-shared error', async () => {
    const mockFetch = createMockFetch([
      { status: 404, statusText: 'Not Found', body: {} },
    ]);
    const client = createClient(mockFetch);

    await assert.rejects(
      () => client.getPage('nonexistent'),
      (err: Error) => {
        assert.ok(err.message.includes('Page not found'));
        assert.ok(err.message.includes('shared with your Notion integration'));
        assert.ok(err.message.includes("'Connect to'"));
        return true;
      }
    );
  });

  it('401 returns invalid token error with link', async () => {
    const mockFetch = createMockFetch([
      { status: 401, statusText: 'Unauthorized', body: {} },
    ]);
    const client = createClient(mockFetch);

    await assert.rejects(
      () => client.getPage('abc'),
      (err: Error) => {
        assert.ok(err.message.includes('Invalid Notion API token'));
        assert.ok(err.message.includes('notion.so/profile/integrations'));
        return true;
      }
    );
  });

  it('500 includes status code in error', async () => {
    const mockFetch = createMockFetch([
      { status: 500, statusText: 'Internal Server Error', body: 'server broke' },
    ]);
    const client = createClient(mockFetch);

    await assert.rejects(
      () => client.getPage('abc'),
      (err: Error) => {
        assert.ok(err.message.includes('500'));
        return true;
      }
    );
  });

  it('throws on empty API key', () => {
    assert.throws(() => new NotionClient(''), /API key is required/);
    assert.throws(() => new NotionClient('  '), /API key is required/);
  });
});

// ---------------------------------------------------------------------------
// 429 Retry with exponential backoff
// ---------------------------------------------------------------------------

describe('NotionClient 429 retry', () => {
  it('retries on 429 with exponential backoff and succeeds', async () => {
    const mockFetch = createMockFetch([
      { status: 429, statusText: 'Too Many Requests', body: {} },
      { status: 429, statusText: 'Too Many Requests', body: {} },
      { status: 200, body: makePageResponse() },
    ]);
    const delays: number[] = [];
    const client = createClient(mockFetch);
    client.delayFn = async (ms: number) => { delays.push(ms); };

    const page = await client.getPage('abc');
    assert.equal(page.title, 'My Test Page');
    assert.equal(mockFetch.calls.length, 3);
    // Exponential backoff: 1000, 2000
    assert.deepEqual(delays, [1000, 2000]);
  });

  it('fails after max retries on persistent 429', async () => {
    const mockFetch = createMockFetch([
      { status: 429, statusText: 'Too Many Requests', body: {} },
      { status: 429, statusText: 'Too Many Requests', body: {} },
      { status: 429, statusText: 'Too Many Requests', body: {} },
      { status: 429, statusText: 'Too Many Requests', body: {} }, // 4th = final failure
    ]);
    const client = createClient(mockFetch);

    await assert.rejects(
      () => client.getPage('abc'),
      (err: Error) => {
        assert.ok(err.message.includes('rate limited'));
        assert.ok(err.message.includes('3 retries'));
        return true;
      }
    );
    // 1 initial + 3 retries = 4 calls
    assert.equal(mockFetch.calls.length, 4);
  });

  it('backoff delays are 1s, 2s, 4s', async () => {
    const mockFetch = createMockFetch([
      { status: 429, statusText: 'Too Many Requests', body: {} },
      { status: 429, statusText: 'Too Many Requests', body: {} },
      { status: 429, statusText: 'Too Many Requests', body: {} },
      { status: 200, body: makePageResponse() },
    ]);
    const delays: number[] = [];
    const client = createClient(mockFetch);
    client.delayFn = async (ms: number) => { delays.push(ms); };

    await client.getPage('abc');
    assert.deepEqual(delays, [1000, 2000, 4000]);
  });
});

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------

describe('RateLimiter', () => {
  it('allows requests within limit', async () => {
    const limiter = new RateLimiter(3, 1000);
    let time = 0;
    limiter.nowFn = () => time;
    limiter.delay = async () => { time += 1001; }; // Fast-forward on delay

    // 3 requests should go through without delay
    await limiter.waitIfNeeded();
    await limiter.waitIfNeeded();
    await limiter.waitIfNeeded();
    // time should still be 0 (no delay needed)
    assert.equal(time, 0);
  });

  it('delays when rate limit is reached', async () => {
    const limiter = new RateLimiter(3, 1000);
    let time = 0;
    let delayedMs = 0;
    limiter.nowFn = () => time;
    limiter.delay = async (ms: number) => {
      delayedMs += ms;
      time += ms; // Simulate time passing
    };

    // Fill up the bucket
    await limiter.waitIfNeeded(); // t=0
    await limiter.waitIfNeeded(); // t=0
    await limiter.waitIfNeeded(); // t=0

    // 4th request should trigger delay
    await limiter.waitIfNeeded();
    assert.ok(delayedMs > 0, 'Should have delayed');
  });

  it('does not delay after window expires', async () => {
    const limiter = new RateLimiter(3, 1000);
    let time = 0;
    let delayed = false;
    limiter.nowFn = () => time;
    limiter.delay = async (ms: number) => {
      delayed = true;
      time += ms;
    };

    // 3 requests at t=0
    await limiter.waitIfNeeded();
    await limiter.waitIfNeeded();
    await limiter.waitIfNeeded();

    // Advance past window
    time = 1001;
    delayed = false;

    // Should not delay — old timestamps are pruned
    await limiter.waitIfNeeded();
    assert.equal(delayed, false);
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

describe('NotionClient.getPageBlocks pagination', () => {
  it('returns blocks with pagination cursor', async () => {
    const mockFetch = createMockFetch([
      { status: 200, body: makeBlocksResponse([{ id: 'b1', type: 'paragraph', content: 'Hello' }], true, 'cursor-1') },
    ]);
    const client = createClient(mockFetch);

    const result = await client.getPageBlocks('page-1');
    assert.equal(result.results.length, 1);
    assert.equal(result.has_more, true);
    assert.equal(result.next_cursor, 'cursor-1');
  });

  it('passes start_cursor as query param', async () => {
    const mockFetch = createMockFetch([
      { status: 200, body: makeBlocksResponse([{ id: 'b2', type: 'paragraph' }]) },
    ]);
    const client = createClient(mockFetch);

    await client.getPageBlocks('page-1', 'my-cursor');
    const url = mockFetch.calls[0].url;
    assert.ok(url.includes('start_cursor=my-cursor'), `URL should include cursor: ${url}`);
  });
});

// ---------------------------------------------------------------------------
// getAllPageBlocks — iterative fetching
// ---------------------------------------------------------------------------

describe('NotionClient.getAllPageBlocks', () => {
  it('returns flat list with depth metadata', async () => {
    const mockFetch = createMockFetch([
      // Top-level blocks
      {
        status: 200,
        body: makeBlocksResponse([
          { id: 'b1', type: 'heading_1', content: 'Title' },
          { id: 'b2', type: 'paragraph', content: 'Text', has_children: true },
        ]),
      },
      // Children of b2
      {
        status: 200,
        body: makeBlocksResponse([
          { id: 'b2-1', type: 'paragraph', content: 'Nested' },
        ]),
      },
    ]);
    const client = createClient(mockFetch);

    const blocks = await client.getAllPageBlocks('page-1');
    assert.equal(blocks.length, 3);

    assert.equal(blocks[0].id, 'b1');
    assert.equal(blocks[0].depth, 0);
    assert.equal(blocks[0].type, 'heading_1');

    assert.equal(blocks[1].id, 'b2');
    assert.equal(blocks[1].depth, 0);
    assert.equal(blocks[1].has_children, true);

    assert.equal(blocks[2].id, 'b2-1');
    assert.equal(blocks[2].depth, 1);
  });

  it('handles multi-page pagination for top-level blocks', async () => {
    const mockFetch = createMockFetch([
      // Page 1
      {
        status: 200,
        body: makeBlocksResponse(
          [{ id: 'b1', type: 'paragraph', content: 'First' }],
          true,
          'cursor-2'
        ),
      },
      // Page 2
      {
        status: 200,
        body: makeBlocksResponse([
          { id: 'b2', type: 'paragraph', content: 'Second' },
        ]),
      },
    ]);
    const client = createClient(mockFetch);

    const blocks = await client.getAllPageBlocks('page-1');
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].id, 'b1');
    assert.equal(blocks[1].id, 'b2');
  });

  it('stops at MAX_DEPTH and adds placeholder', async () => {
    // Simulate a block at depth 0 with children, using maxDepth=1
    const mockFetch = createMockFetch([
      // Top-level: one block with children
      {
        status: 200,
        body: makeBlocksResponse([
          { id: 'b1', type: 'paragraph', has_children: true },
        ]),
      },
      // Children at depth 1 — one with children
      {
        status: 200,
        body: makeBlocksResponse([
          { id: 'b1-1', type: 'paragraph', has_children: true },
        ]),
      },
      // Should NOT fetch b1-1's children (depth 2 > maxDepth 1)
    ]);
    const client = createClient(mockFetch);

    const blocks = await client.getAllPageBlocks('page-1', 1);
    assert.equal(blocks.length, 3); // b1, b1-1, placeholder

    assert.equal(blocks[0].id, 'b1');
    assert.equal(blocks[0].depth, 0);

    assert.equal(blocks[1].id, 'b1-1');
    assert.equal(blocks[1].depth, 1);

    // Placeholder at depth 2
    assert.equal(blocks[2].type, 'depth_limit_placeholder');
    assert.equal(blocks[2].depth, 2);
    assert.equal(blocks[2].id, 'b1-1-depth-placeholder');
  });

  it('uses default MAX_DEPTH of 5', () => {
    assert.equal(MAX_DEPTH, 5);
  });

  it('extracts rich_text from block data', async () => {
    const mockFetch = createMockFetch([
      {
        status: 200,
        body: makeBlocksResponse([
          { id: 'b1', type: 'paragraph', content: 'Hello world' },
        ]),
      },
    ]);
    const client = createClient(mockFetch);

    const blocks = await client.getAllPageBlocks('page-1');
    assert.equal(blocks[0].rich_text.length, 1);
    assert.equal(blocks[0].rich_text[0].plain_text, 'Hello world');
  });

  it('returns empty list for page with no blocks', async () => {
    const mockFetch = createMockFetch([
      { status: 200, body: makeBlocksResponse([]) },
    ]);
    const client = createClient(mockFetch);

    const blocks = await client.getAllPageBlocks('page-1');
    assert.equal(blocks.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Static analysis
// ---------------------------------------------------------------------------

describe('Notion client static checks', () => {
  it('client.ts has no @notionhq/client imports', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const clientPath = join(
      import.meta.dirname, '..', '..', '..', 'src', 'integrations', 'notion', 'client.ts'
    );
    const content = await readFile(clientPath, 'utf-8');
    assert.equal(
      content.includes('@notionhq/client'),
      false,
      'client.ts must not import from @notionhq/client'
    );
  });

  it('client.ts has no any type annotations', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const clientPath = join(
      import.meta.dirname, '..', '..', '..', 'src', 'integrations', 'notion', 'client.ts'
    );
    const content = await readFile(clientPath, 'utf-8');
    // Match `: any` or `as any` but not in comments
    const lines = content.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    const hasAny = lines.some((l) => /:\s*any\b|as\s+any\b/.test(l));
    assert.equal(hasAny, false, 'client.ts must not use any type');
  });
});
