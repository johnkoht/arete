/**
 * Tests for GwsDocsProvider.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GwsDocsProvider } from '../../../src/integrations/gws/docs.js';
import type { GwsDeps } from '../../../src/integrations/gws/types.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'docs-get.json'), 'utf-8'),
);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeDeps(responses: Record<string, string>): GwsDeps {
  return {
    exec: async (_command: string, args: string[]) => {
      // Detection calls
      if (args.includes('--version')) {
        return { stdout: 'gws version 0.5.2', stderr: '' };
      }
      if (args.includes('status')) {
        return { stdout: JSON.stringify({ authenticated: true }), stderr: '' };
      }

      // CLI calls — match on the key built from service+command
      const key = `${args[0]}_${args[1]}`;
      const stdout = responses[key] ?? '{}';
      return { stdout, stderr: '' };
    },
  };
}

function makeNotInstalledDeps(): GwsDeps {
  return {
    exec: async () => {
      const err = new Error('spawn gws ENOENT') as Error & { code: string };
      err.code = 'ENOENT';
      throw err;
    },
  };
}

function makeUnauthenticatedDeps(): GwsDeps {
  return {
    exec: async (_command: string, args: string[]) => {
      if (args.includes('--version')) {
        return { stdout: 'gws version 0.5.2', stderr: '' };
      }
      if (args.includes('status')) {
        return { stdout: JSON.stringify({ authenticated: false }), stderr: '' };
      }
      return { stdout: '{}', stderr: '' };
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GwsDocsProvider', () => {
  describe('getDoc', () => {
    it('maps response to DocMetadata', async () => {
      const deps = makeDeps({
        docs_get: JSON.stringify(fixture),
      });

      const provider = new GwsDocsProvider(deps);
      const doc = await provider.getDoc('doc-abc-123');

      assert.equal(doc.id, 'doc-abc-123');
      assert.equal(doc.title, 'Q2 Roadmap Draft');
      assert.equal(doc.lastModified, '2026-04-02T14:30:00.000Z');
      assert.equal(doc.lastModifiedBy, 'Jane Smith');
      assert.equal(doc.webViewLink, 'https://docs.google.com/document/d/doc-abc-123/edit');
    });
  });

  describe('getDocContent', () => {
    it('returns text content', async () => {
      const deps = makeDeps({
        docs_export: JSON.stringify({ content: 'This is the document body text.\n\nWith multiple paragraphs.' }),
      });

      const provider = new GwsDocsProvider(deps);
      const content = await provider.getDocContent('doc-abc-123');

      assert.equal(content, 'This is the document body text.\n\nWith multiple paragraphs.');
    });

    it('handles empty content gracefully', async () => {
      const deps = makeDeps({
        docs_export: JSON.stringify({}),
      });

      const provider = new GwsDocsProvider(deps);
      const content = await provider.getDocContent('doc-abc-123');

      assert.equal(content, '');
    });
  });

  describe('isAvailable', () => {
    it('returns true when gws is installed and authenticated', async () => {
      const deps = makeDeps({});
      const provider = new GwsDocsProvider(deps);
      const result = await provider.isAvailable();
      assert.equal(result, true);
    });

    it('returns false when gws is not installed', async () => {
      const deps = makeNotInstalledDeps();
      const provider = new GwsDocsProvider(deps);
      const result = await provider.isAvailable();
      assert.equal(result, false);
    });

    it('returns false when gws is not authenticated', async () => {
      const deps = makeUnauthenticatedDeps();
      const provider = new GwsDocsProvider(deps);
      const result = await provider.isAvailable();
      assert.equal(result, false);
    });
  });
});
