/**
 * Tests for Notion integration registry, service wiring, and status detection.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { INTEGRATIONS } from '../../../src/integrations/registry.js';
import { IntegrationService } from '../../../src/services/integrations.js';
import { getDefaultConfig } from '../../../src/config.js';
import type { StorageAdapter } from '../../../src/storage/adapter.js';

// ---------------------------------------------------------------------------
// Helpers (same mock pattern as integrations.test.ts)
// ---------------------------------------------------------------------------

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
    async list() {
      return [];
    },
    async listSubdirectories() {
      return [];
    },
    async mkdir() {
      // no-op
    },
    async getModified() {
      return null;
    },
  };
}

const WORKSPACE = '/test-workspace';
const CRED_PATH = `${WORKSPACE}/.credentials/credentials.yaml`;
const MANIFEST_PATH = `${WORKSPACE}/arete.yaml`;

function createNotionFetchMock(pages: Map<string, { title: string }>): typeof fetch {
  return async (input: URL | RequestInfo): Promise<Response> => {
    const url = String(input);
    const pageMatch = url.match(/\/v1\/pages\/([^/?]+)/);
    const blocksMatch = url.match(/\/v1\/blocks\/([^/?]+)\/children/);
    const requestedId = (pageMatch?.[1] ?? blocksMatch?.[1] ?? '').replace(/-/g, '').toLowerCase();

    for (const [pageId, payload] of pages.entries()) {
      const normalized = pageId.replace(/-/g, '').toLowerCase();
      if (requestedId !== normalized) {
        continue;
      }

      if (pageMatch) {
        return new Response(
          JSON.stringify({
            object: 'page',
            id: pageId,
            created_time: '2026-02-22T10:00:00.000Z',
            last_edited_time: '2026-02-22T12:00:00.000Z',
            url: `https://www.notion.so/${pageId.replace(/-/g, '')}`,
            properties: {
              title: {
                type: 'title',
                title: [{ plain_text: payload.title }],
              },
            },
          }),
          { status: 200 }
        );
      }

      if (blocksMatch) {
        return new Response(
          JSON.stringify({
            object: 'list',
            results: [
              {
                object: 'block',
                id: `${pageId}-paragraph`,
                type: 'paragraph',
                has_children: false,
                paragraph: {
                  rich_text: [
                    {
                      type: 'text',
                      plain_text: `Content for ${payload.title}`,
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
          }),
          { status: 200 }
        );
      }
    }

    return new Response('Not Found', { status: 404 });
  };
}

function makeService(storage: StorageAdapter): IntegrationService {
  return new IntegrationService(storage, getDefaultConfig());
}

// Helper to access private getIntegrationStatus
type StatusAccessor = {
  getIntegrationStatus: (root: string, name: string) => Promise<string | null>;
};

// ---------------------------------------------------------------------------
// Tests: Registry
// ---------------------------------------------------------------------------

describe('Integration registry — notion entry', () => {
  it('has notion in INTEGRATIONS', () => {
    assert.ok(INTEGRATIONS.notion, 'notion must be in INTEGRATIONS');
  });

  it('has correct fields', () => {
    const notion = INTEGRATIONS.notion;
    assert.equal(notion.name, 'notion');
    assert.equal(notion.displayName, 'Notion');
    assert.equal(notion.description, 'Documentation and workspace pages');
    assert.deepEqual(notion.implements, ['documentation']);
    assert.equal(notion.auth.type, 'api_key');
    assert.equal(notion.auth.envVar, 'NOTION_API_KEY');
    assert.equal(notion.auth.configKey, 'api_key');
    assert.equal(notion.status, 'available');
  });
});

// ---------------------------------------------------------------------------
// Tests: getIntegrationStatus for notion
// ---------------------------------------------------------------------------

describe('IntegrationService.getIntegrationStatus — notion', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let service: IntegrationService;
  let savedEnv: string | undefined;

  beforeEach(() => {
    storage = createMockStorage();
    service = makeService(storage);
    savedEnv = process.env.NOTION_API_KEY;
    delete process.env.NOTION_API_KEY;
  });

  afterEach(() => {
    if (savedEnv !== undefined) {
      process.env.NOTION_API_KEY = savedEnv;
    } else {
      delete process.env.NOTION_API_KEY;
    }
  });

  it('returns "active" when arete.yaml has notion status active', async () => {
    storage.files.set(MANIFEST_PATH, `schema: 1
integrations:
  notion:
    status: active
`);

    const status = await (service as unknown as StatusAccessor)
      .getIntegrationStatus(WORKSPACE, 'notion');

    assert.equal(status, 'active');
  });

  it('returns "active" when NOTION_API_KEY env var is set', async () => {
    process.env.NOTION_API_KEY = 'ntn_test_key_123';

    const status = await (service as unknown as StatusAccessor)
      .getIntegrationStatus(WORKSPACE, 'notion');

    assert.equal(status, 'active');
  });

  it('returns "active" when API key is in credentials.yaml', async () => {
    storage.files.set(CRED_PATH, `notion:
  api_key: ntn_secret_key_456
`);

    const status = await (service as unknown as StatusAccessor)
      .getIntegrationStatus(WORKSPACE, 'notion');

    assert.equal(status, 'active');
  });

  it('returns "inactive" when no manifest config and no credentials', async () => {
    const status = await (service as unknown as StatusAccessor)
      .getIntegrationStatus(WORKSPACE, 'notion');

    assert.equal(status, 'inactive');
  });

  it('does not check legacy IDE config files — only manifest + credentials', async () => {
    // Set up a legacy config file that would match fathom pattern
    storage.files.set(`${WORKSPACE}/.arete/integrations/configs/notion.yaml`, `status: active`);

    // Without manifest or credentials, should still be inactive
    const status = await (service as unknown as StatusAccessor)
      .getIntegrationStatus(WORKSPACE, 'notion');

    assert.equal(status, 'inactive', 'Should not read legacy IDE config files for notion');
  });
});

// ---------------------------------------------------------------------------
// Tests: pull routing for notion
// ---------------------------------------------------------------------------

describe('IntegrationService.pull — notion routing', { concurrency: 1 }, () => {
  let storage: ReturnType<typeof createMockStorage>;
  let service: IntegrationService;
  let savedEnv: string | undefined;
  let savedFetch: typeof fetch;

  beforeEach(() => {
    storage = createMockStorage();
    service = makeService(storage);
    savedEnv = process.env.NOTION_API_KEY;
    savedFetch = globalThis.fetch;
    process.env.NOTION_API_KEY = 'ntn_test_key';
  });

  afterEach(() => {
    if (savedEnv !== undefined) {
      process.env.NOTION_API_KEY = savedEnv;
    } else {
      delete process.env.NOTION_API_KEY;
    }
    globalThis.fetch = savedFetch;
  });

  it('routes notion pull and maps NotionPullResult to PullResult', async () => {
    const pageId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    globalThis.fetch = createNotionFetchMock(
      new Map([[pageId, { title: 'Registry Wiring Page' }]])
    );

    const result = await service.pull(WORKSPACE, 'notion', {
      integration: 'notion',
      pages: [pageId, pageId],
      destination: `${WORKSPACE}/resources/notion`,
    });

    assert.equal(result.integration, 'notion');
    assert.equal(result.itemsProcessed, 2);
    assert.ok(result.itemsCreated >= 1);
    assert.equal(result.itemsUpdated, 0);
    assert.deepEqual(result.errors, []);
  });

  it('formats pull errors with pageId prefix from orchestrator results', async () => {
    const result = await service.pull(WORKSPACE, 'notion', {
      integration: 'notion',
      pages: ['missing-page-id'],
      destination: `${WORKSPACE}/resources/notion`,
    });

    assert.equal(result.integration, 'notion');
    assert.equal(result.itemsCreated, 0);
    assert.equal(result.itemsUpdated, 0);
    assert.ok(result.itemsProcessed >= 1);
    assert.ok(result.errors.length >= 1);
    assert.ok(result.errors[0].startsWith('missing-page-id: '));
  });

  it('returns error when notion is not active', async () => {
    delete process.env.NOTION_API_KEY;

    const result = await service.pull(WORKSPACE, 'notion', {
      integration: 'notion',
      pages: ['page-1'],
    });

    assert.equal(result.itemsCreated, 0);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('not active'));
  });
});

// ---------------------------------------------------------------------------
// Tests: list includes notion
// ---------------------------------------------------------------------------

describe('IntegrationService.list — includes notion', () => {
  it('lists notion in available integrations', async () => {
    const storage = createMockStorage();
    const service = makeService(storage);

    const entries = await service.list(WORKSPACE);
    const notion = entries.find((e) => e.name === 'notion');

    assert.ok(notion, 'notion must appear in list');
    assert.equal(notion.displayName, 'Notion');
    assert.deepEqual(notion.implements, ['documentation']);
    assert.equal(notion.status, 'available');
  });
});

// ---------------------------------------------------------------------------
// Tests: notion index.ts exports
// ---------------------------------------------------------------------------

describe('Notion index.ts', () => {
  it('exports pullNotionPages function', async () => {
    const mod = await import('../../../src/integrations/notion/index.js');
    assert.equal(typeof mod.pullNotionPages, 'function');
  });

  it('returns actionable error when API key is missing', async () => {
    const { pullNotionPages } = await import('../../../src/integrations/notion/index.js');
    const result = await pullNotionPages(
      createMockStorage(),
      '/workspace',
      { root: '/workspace' },
      { pages: ['test-page'], destination: 'resources/notion' }
    );

    assert.deepEqual(result.saved, []);
    assert.deepEqual(result.skipped, []);
    assert.equal(result.errors.length, 1);
    assert.ok(result.errors[0].error.includes('API key not found'));
  });
});
