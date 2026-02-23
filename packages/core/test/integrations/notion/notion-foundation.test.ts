/**
 * Tests for Notion integration foundation: types, config, URL resolver.
 *
 * Covers:
 * 1-7: resolvePageId — 7 URL format scenarios
 * 8-10: loadNotionApiKey — env var, credentials.yaml, round-trip
 * 11: Types have no @notionhq/client imports (static check via file read)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { resolvePageId } from '../../../src/integrations/notion/url.js';
import {
  loadNotionApiKey,
  NOTION_API_BASE,
  NOTION_CREDENTIAL_KEY,
  NOTION_CREDENTIAL_FIELD,
} from '../../../src/integrations/notion/config.js';
import type { StorageAdapter } from '../../../src/storage/adapter.js';

// ---------------------------------------------------------------------------
// Helpers
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

const SAMPLE_ID = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

// ---------------------------------------------------------------------------
// resolvePageId
// ---------------------------------------------------------------------------

describe('resolvePageId', () => {
  it('extracts ID from workspace URL', () => {
    const url = `https://www.notion.so/myworkspace/My-Page-Title-${SAMPLE_ID}`;
    assert.equal(resolvePageId(url), SAMPLE_ID);
  });

  it('extracts ID from short URL', () => {
    const url = `https://notion.so/${SAMPLE_ID}`;
    assert.equal(resolvePageId(url), SAMPLE_ID);
  });

  it('extracts ID from URL with query params', () => {
    const url = `https://www.notion.so/myworkspace/Title-${SAMPLE_ID}?v=abc123&pvs=4`;
    assert.equal(resolvePageId(url), SAMPLE_ID);
  });

  it('extracts ID from custom domain (workspace.notion.site)', () => {
    const url = `https://myteam.notion.site/Design-Docs-${SAMPLE_ID}`;
    assert.equal(resolvePageId(url), SAMPLE_ID);
  });

  it('normalizes raw UUID with dashes', () => {
    const uuid = 'a1b2c3d4-e5f6-a7b8-c9d0-e1f2a3b4c5d6';
    assert.equal(resolvePageId(uuid), SAMPLE_ID);
  });

  it('accepts raw 32-char hex without dashes', () => {
    assert.equal(resolvePageId(SAMPLE_ID), SAMPLE_ID);
  });

  it('returns invalid input as-is', () => {
    assert.equal(resolvePageId('not-a-valid-id'), 'not-a-valid-id');
    assert.equal(resolvePageId(''), '');
    assert.equal(resolvePageId('short123'), 'short123');
  });

  it('lowercases hex IDs', () => {
    const upper = 'A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6';
    assert.equal(resolvePageId(upper), SAMPLE_ID);
  });

  it('handles URL with hash fragment', () => {
    const url = `https://notion.so/workspace/Page-${SAMPLE_ID}#section`;
    assert.equal(resolvePageId(url), SAMPLE_ID);
  });
});

// ---------------------------------------------------------------------------
// loadNotionApiKey
// ---------------------------------------------------------------------------

describe('loadNotionApiKey', () => {
  const originalEnv = process.env.NOTION_API_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NOTION_API_KEY = originalEnv;
    } else {
      delete process.env.NOTION_API_KEY;
    }
  });

  it('loads from NOTION_API_KEY env var (priority)', async () => {
    process.env.NOTION_API_KEY = 'ntn_env_token_123';
    const storage = createMockStorage();
    const key = await loadNotionApiKey(storage, '/workspace');
    assert.equal(key, 'ntn_env_token_123');
  });

  it('trims env var whitespace', async () => {
    process.env.NOTION_API_KEY = '  ntn_token  ';
    const storage = createMockStorage();
    const key = await loadNotionApiKey(storage, '/workspace');
    assert.equal(key, 'ntn_token');
  });

  it('loads from credentials.yaml when env var is unset', async () => {
    delete process.env.NOTION_API_KEY;
    const storage = createMockStorage();
    const credPath = join('/workspace', '.credentials', 'credentials.yaml');
    const yamlContent = stringifyYaml({
      notion: { api_key: 'ntn_yaml_token_456' },
    });
    storage.files.set(credPath, yamlContent);

    const key = await loadNotionApiKey(storage, '/workspace');
    assert.equal(key, 'ntn_yaml_token_456');
  });

  it('returns null when no workspace root', async () => {
    delete process.env.NOTION_API_KEY;
    const storage = createMockStorage();
    const key = await loadNotionApiKey(storage, null);
    assert.equal(key, null);
  });

  it('returns null when credentials.yaml does not exist', async () => {
    delete process.env.NOTION_API_KEY;
    const storage = createMockStorage();
    const key = await loadNotionApiKey(storage, '/workspace');
    assert.equal(key, null);
  });

  it('returns null for malformed YAML', async () => {
    delete process.env.NOTION_API_KEY;
    const storage = createMockStorage();
    const credPath = join('/workspace', '.credentials', 'credentials.yaml');
    storage.files.set(credPath, ': : : invalid yaml [[[');

    const key = await loadNotionApiKey(storage, '/workspace');
    assert.equal(key, null);
  });

  it('round-trips: structure configure writes can be read back', async () => {
    // Simulates what a configure command would write using the exported constants
    delete process.env.NOTION_API_KEY;
    const storage = createMockStorage();
    const credPath = join('/workspace', '.credentials', 'credentials.yaml');

    // Write using the same constants the configure command would use
    const credentials: Record<string, Record<string, string>> = {
      [NOTION_CREDENTIAL_KEY]: {
        [NOTION_CREDENTIAL_FIELD]: 'ntn_roundtrip_789',
      },
    };
    storage.files.set(credPath, stringifyYaml(credentials));

    // Read back via loadNotionApiKey
    const key = await loadNotionApiKey(storage, '/workspace');
    assert.equal(key, 'ntn_roundtrip_789');
  });

  it('preserves other credentials when notion section exists', async () => {
    delete process.env.NOTION_API_KEY;
    const storage = createMockStorage();
    const credPath = join('/workspace', '.credentials', 'credentials.yaml');

    // Multi-integration credentials file
    const yamlContent = stringifyYaml({
      fathom: { api_key: 'fathom_token' },
      notion: { api_key: 'ntn_multi_token' },
    });
    storage.files.set(credPath, yamlContent);

    const key = await loadNotionApiKey(storage, '/workspace');
    assert.equal(key, 'ntn_multi_token');
  });
});

// ---------------------------------------------------------------------------
// Config constants
// ---------------------------------------------------------------------------

describe('Notion config constants', () => {
  it('exports expected API base URL', () => {
    assert.equal(NOTION_API_BASE, 'https://api.notion.com');
  });

  it('exports credential key and field', () => {
    assert.equal(NOTION_CREDENTIAL_KEY, 'notion');
    assert.equal(NOTION_CREDENTIAL_FIELD, 'api_key');
  });
});

// ---------------------------------------------------------------------------
// Static analysis: no @notionhq/client imports
// ---------------------------------------------------------------------------

describe('Notion types static checks', () => {
  it('types.ts has no @notionhq/client imports', async () => {
    const typesPath = join(
      import.meta.dirname,
      '..',
      '..',
      '..',
      'src',
      'integrations',
      'notion',
      'types.ts'
    );
    const content = await readFile(typesPath, 'utf-8');
    assert.equal(
      content.includes('@notionhq/client'),
      false,
      'types.ts must not import from @notionhq/client'
    );
  });

  it('config.ts has no @notionhq/client imports', async () => {
    const configPath = join(
      import.meta.dirname,
      '..',
      '..',
      '..',
      'src',
      'integrations',
      'notion',
      'config.ts'
    );
    const content = await readFile(configPath, 'utf-8');
    assert.equal(
      content.includes('@notionhq/client'),
      false,
      'config.ts must not import from @notionhq/client'
    );
  });

  it('url.ts has no @notionhq/client imports', async () => {
    const urlPath = join(
      import.meta.dirname,
      '..',
      '..',
      '..',
      'src',
      'integrations',
      'notion',
      'url.ts'
    );
    const content = await readFile(urlPath, 'utf-8');
    assert.equal(
      content.includes('@notionhq/client'),
      false,
      'url.ts must not import from @notionhq/client'
    );
  });
});
