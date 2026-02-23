/**
 * Tests for Notion save module and pullNotionPages orchestrator.
 *
 * Covers:
 * - saveNotionPage: frontmatter fields, slugified filename, force mode
 * - findDuplicateByPageId: dedup detection, no false positives
 * - notionPageFilename: slugification edge cases
 * - pullNotionPages: end-to-end, partial success, empty pages, dedup, no API key
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { StorageAdapter } from '../../../src/storage/adapter.js';
import type { NotionPageResult } from '../../../src/integrations/notion/types.js';
import {
  saveNotionPage,
  findDuplicateByPageId,
  notionPageFilename,
} from '../../../src/integrations/notion/save.js';
import { pullNotionPages } from '../../../src/integrations/notion/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockStorage(): StorageAdapter & { files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  return {
    files,
    dirs,
    async read(path: string) {
      return files.get(path) ?? null;
    },
    async write(path: string, content: string) {
      files.set(path, content);
    },
    async exists(path: string) {
      return files.has(path) || dirs.has(path);
    },
    async delete(path: string) {
      files.delete(path);
    },
    async list(dir: string, options?: { extensions?: string[] }) {
      const result: string[] = [];
      for (const key of files.keys()) {
        if (!key.startsWith(dir)) continue;
        if (options?.extensions) {
          const matches = options.extensions.some((ext) => key.endsWith(ext));
          if (!matches) continue;
        }
        result.push(key);
      }
      return result;
    },
    async listSubdirectories() {
      return [];
    },
    async mkdir(dir: string) {
      dirs.add(dir);
    },
    async getModified() {
      return null;
    },
  };
}

function makePage(overrides?: Partial<NotionPageResult>): NotionPageResult {
  return {
    id: 'abc12345-6789-0abc-def1-234567890abc',
    title: 'My Test Page',
    url: 'https://www.notion.so/workspace/My-Test-Page-abc1234567890abcdef1234567890abc',
    createdTime: '2026-02-22T10:00:00.000Z',
    lastEditedTime: '2026-02-22T12:00:00.000Z',
    markdown: '# My Test Page\n\nSome content here.\n',
    properties: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// notionPageFilename
// ---------------------------------------------------------------------------

describe('notionPageFilename', () => {
  it('slugifies a normal title', () => {
    assert.equal(notionPageFilename('My Test Page'), 'my-test-page.md');
  });

  it('handles special characters', () => {
    assert.equal(
      notionPageFilename('PRD: Feature #1 (v2.0)'),
      'prd-feature-1-v20.md'
    );
  });

  it('handles empty title → untitled', () => {
    assert.equal(notionPageFilename(''), 'untitled.md');
  });

  it('handles unicode/emoji title', () => {
    assert.equal(notionPageFilename('📋 Sprint Planning'), 'sprint-planning.md');
  });

  it('collapses multiple hyphens', () => {
    assert.equal(notionPageFilename('A   --  B'), 'a-b.md');
  });

  it('trims leading/trailing hyphens', () => {
    assert.equal(notionPageFilename(' - Hello World - '), 'hello-world.md');
  });
});

// ---------------------------------------------------------------------------
// saveNotionPage
// ---------------------------------------------------------------------------

describe('saveNotionPage', () => {
  let storage: ReturnType<typeof createMockStorage>;
  const dest = '/workspace/resources/notes';

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('saves a page with correct frontmatter fields', async () => {
    const page = makePage();
    const result = await saveNotionPage(storage, page, dest);

    assert.ok(result);
    assert.equal(result, join(dest, 'my-test-page.md'));

    const content = storage.files.get(result);
    assert.ok(content);

    // Verify frontmatter fields
    assert.ok(content.startsWith('---\n'));
    assert.ok(content.includes('title: My Test Page'));
    assert.ok(content.includes('source: notion'));
    assert.ok(content.includes(`source_url: ${page.url}`));
    assert.ok(content.includes(`notion_page_id: ${page.id}`));
    assert.ok(content.includes('fetched_at:'));
    assert.ok(content.includes('\n---\n'));

    // Verify markdown body follows frontmatter
    assert.ok(content.includes('# My Test Page'));
    assert.ok(content.includes('Some content here.'));
  });

  it('skips when duplicate notion_page_id exists', async () => {
    // Pre-populate with existing file containing same page ID
    const existingContent = `---\ntitle: Old Page\nsource: notion\nnotion_page_id: "${makePage().id}"\n---\n\nOld content\n`;
    storage.files.set(join(dest, 'old-page.md'), existingContent);
    storage.dirs.add(dest);

    const result = await saveNotionPage(storage, makePage(), dest);
    assert.equal(result, null);
  });

  it('saves when force=true even with duplicate', async () => {
    const page = makePage();
    const existingContent = `---\ntitle: Old Page\nsource: notion\nnotion_page_id: "${page.id}"\n---\n\nOld content\n`;
    storage.files.set(join(dest, 'old-page.md'), existingContent);
    storage.dirs.add(dest);

    const result = await saveNotionPage(storage, page, dest, { force: true });
    assert.ok(result);
  });

  it('creates destination directory', async () => {
    await saveNotionPage(storage, makePage(), dest);
    assert.ok(storage.dirs.has(dest));
  });

  it('handles page with empty markdown', async () => {
    const page = makePage({ markdown: '' });
    const result = await saveNotionPage(storage, page, dest);
    assert.ok(result);

    const content = storage.files.get(result!);
    assert.ok(content);
    assert.ok(content.includes('notion_page_id:'));
  });
});

// ---------------------------------------------------------------------------
// findDuplicateByPageId
// ---------------------------------------------------------------------------

describe('findDuplicateByPageId', () => {
  let storage: ReturnType<typeof createMockStorage>;
  const dir = '/workspace/resources/notes';

  beforeEach(() => {
    storage = createMockStorage();
    storage.dirs.add(dir);
  });

  it('finds duplicate when notion_page_id matches', async () => {
    const filePath = join(dir, 'existing.md');
    storage.files.set(filePath, '---\ntitle: Test\nnotion_page_id: abc123\n---\n\nContent\n');

    const result = await findDuplicateByPageId(storage, dir, 'abc123');
    assert.equal(result, filePath);
  });

  it('returns null when no match', async () => {
    storage.files.set(join(dir, 'existing.md'), '---\ntitle: Test\nnotion_page_id: xyz789\n---\n\nContent\n');

    const result = await findDuplicateByPageId(storage, dir, 'abc123');
    assert.equal(result, null);
  });

  it('returns null for non-existent directory', async () => {
    const result = await findDuplicateByPageId(storage, '/nonexistent', 'abc123');
    assert.equal(result, null);
  });

  it('ignores files without frontmatter', async () => {
    storage.files.set(join(dir, 'plain.md'), '# No Frontmatter\n\nJust content.\n');

    const result = await findDuplicateByPageId(storage, dir, 'abc123');
    assert.equal(result, null);
  });

  it('handles quoted notion_page_id values', async () => {
    storage.files.set(
      join(dir, 'quoted.md'),
      '---\ntitle: Test\nnotion_page_id: "abc123"\n---\n\nContent\n'
    );

    const result = await findDuplicateByPageId(storage, dir, 'abc123');
    assert.equal(result, join(dir, 'quoted.md'));
  });
});

// ---------------------------------------------------------------------------
// pullNotionPages (orchestrator)
// ---------------------------------------------------------------------------

describe('pullNotionPages', { concurrency: 1 }, () => {
  let storage: ReturnType<typeof createMockStorage>;
  let savedFetch: typeof fetch;
  const workspaceRoot = '/workspace';
  const dest = '/workspace/resources/notes';
  const paths = { resources: '/workspace/resources' };

  function createMockFetch(pageResponses: Map<string, { page: Record<string, unknown>; blocks: Record<string, unknown> }>): typeof fetch {
    return async (input: URL | RequestInfo): Promise<Response> => {
      const url = String(input);
      const pageMatch = url.match(/\/v1\/pages\/([^/?]+)/);
      const blocksMatch = url.match(/\/v1\/blocks\/([^/?]+)\/children/);
      const requestedId = (pageMatch?.[1] ?? blocksMatch?.[1] ?? '').replace(/-/g, '').toLowerCase();

      for (const [pageId, data] of pageResponses.entries()) {
        const normalized = pageId.replace(/-/g, '').toLowerCase();
        if (requestedId !== normalized) {
          continue;
        }

        if (pageMatch) {
          return new Response(JSON.stringify(data.page), { status: 200 });
        }

        if (blocksMatch) {
          return new Response(JSON.stringify(data.blocks), { status: 200 });
        }
      }

      return new Response('Not Found', { status: 404 });
    };
  }

  function makePageResponse(id: string, title: string): { page: Record<string, unknown>; blocks: Record<string, unknown> } {
    return {
      page: {
        object: 'page',
        id,
        created_time: '2026-02-22T10:00:00.000Z',
        last_edited_time: '2026-02-22T12:00:00.000Z',
        url: `https://www.notion.so/${id.replace(/-/g, '')}`,
        properties: {
          title: {
            type: 'title',
            title: [{ plain_text: title }],
          },
        },
      },
      blocks: {
        object: 'list',
        results: [
          {
            object: 'block',
            id: `${id}-paragraph`,
            type: 'paragraph',
            has_children: false,
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  plain_text: `Content of ${title}`,
                  href: null,
                  annotations: {
                    bold: false,
                    italic: false,
                    strikethrough: false,
                    underline: false,
                    code: false,
                    color: 'default',
                  },
                },
              ],
            },
          },
        ],
        has_more: false,
        next_cursor: null,
      },
    };
  }

  beforeEach(() => {
    storage = createMockStorage();
    savedFetch = globalThis.fetch;
    const credPath = join(workspaceRoot, '.credentials', 'credentials.yaml');
    storage.files.set(credPath, 'notion:\n  api_key: "ntn_test_key_123"');
  });

  it('returns error when API key not found', async () => {
    const emptyStorage = createMockStorage();
    const result = await pullNotionPages(emptyStorage, workspaceRoot, paths, {
      pages: ['abc123'],
      destination: dest,
    });

    assert.equal(result.saved.length, 0);
    assert.equal(result.errors.length, 1);
    assert.ok(result.errors[0].error.includes('API key not found'));
  });

  it('pulls a single page end-to-end', async () => {
    const pageId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    globalThis.fetch = createMockFetch(
      new Map([[pageId, makePageResponse(pageId, 'Test Page')]])
    );

    const result = await pullNotionPages(storage, workspaceRoot, paths, {
      pages: [pageId],
      destination: dest,
    });

    assert.equal(result.saved.length, 1);
    assert.equal(result.skipped.length, 0);
    assert.equal(result.errors.length, 0);

    const savedPath = result.saved[0];
    const content = storage.files.get(savedPath);
    assert.ok(content);
    assert.ok(content.includes('source: notion'));
    assert.ok(content.includes(`notion_page_id: ${pageId}`));
    assert.ok(content.includes('Content of Test Page'));
  });

  it('handles partial success (some pages fail)', async () => {
    const goodPageId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
    globalThis.fetch = createMockFetch(
      new Map([[goodPageId, makePageResponse(goodPageId, 'Good Page')]])
    );

    const result = await pullNotionPages(storage, workspaceRoot, paths, {
      pages: [goodPageId, 'missing-page-id'],
      destination: dest,
    });

    assert.equal(result.saved.length, 1);
    assert.equal(result.skipped.length, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].pageId, 'missing-page-id');
    assert.ok(result.errors[0].error.includes('Page not found'));
  });

  it('skips duplicate pages in batch', async () => {
    const pageId = 'cccccccc-dddd-eeee-ffff-000000000000';
    globalThis.fetch = createMockFetch(
      new Map([[pageId, makePageResponse(pageId, 'Duplicate Page')]])
    );

    const result = await pullNotionPages(storage, workspaceRoot, paths, {
      pages: [pageId, pageId],
      destination: dest,
    });

    assert.equal(result.saved.length, 1);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0], pageId.replace(/-/g, '').toLowerCase());
    assert.equal(result.errors.length, 0);
  });

  it('handles empty pages list', async () => {
    const result = await pullNotionPages(storage, workspaceRoot, paths, {
      pages: [],
      destination: dest,
    });

    assert.equal(result.saved.length, 0);
    assert.equal(result.skipped.length, 0);
    assert.equal(result.errors.length, 0);
  });

  afterEach(() => {
    globalThis.fetch = savedFetch;
  });
});
