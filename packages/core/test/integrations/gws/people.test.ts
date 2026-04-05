/**
 * Tests for GwsDirectoryProvider.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GwsDirectoryProvider } from '../../../src/integrations/gws/people.js';
import type { GwsDeps } from '../../../src/integrations/gws/types.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const lookupFixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'people-lookup.json'), 'utf-8'),
);
const searchFixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'people-search.json'), 'utf-8'),
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

describe('GwsDirectoryProvider', () => {
  describe('lookupPerson', () => {
    it('returns DirectoryPerson with full data', async () => {
      const deps = makeDeps({
        people_get: JSON.stringify(lookupFixture),
      });

      const provider = new GwsDirectoryProvider(deps);
      const person = await provider.lookupPerson('jane@example.com');

      assert.ok(person);
      assert.equal(person.email, 'jane@example.com');
      assert.equal(person.name, 'Jane Smith');
      assert.equal(person.title, 'Senior Engineer');
      assert.equal(person.department, 'Engineering');
      assert.equal(person.manager, 'bob@example.com');
      assert.equal(person.photoUrl, 'https://photos.example.com/jane.jpg');
    });

    it('returns null when not found', async () => {
      const deps = makeDeps({
        people_get: JSON.stringify({}),
      });

      const provider = new GwsDirectoryProvider(deps);
      const person = await provider.lookupPerson('nobody@example.com');

      assert.equal(person, null);
    });
  });

  describe('searchDirectory', () => {
    it('returns array of results', async () => {
      const deps = makeDeps({
        people_search: JSON.stringify(searchFixture),
      });

      const provider = new GwsDirectoryProvider(deps);
      const results = await provider.searchDirectory('Jane');

      assert.equal(results.length, 2);
      assert.equal(results[0].email, 'jane@example.com');
      assert.equal(results[0].name, 'Jane Smith');
      assert.equal(results[0].title, 'Senior Engineer');
      assert.equal(results[1].email, 'jane.doe@example.com');
      assert.equal(results[1].name, 'Jane Doe');
      assert.equal(results[1].title, 'Product Manager');
    });

    it('handles empty results', async () => {
      const deps = makeDeps({
        people_search: JSON.stringify({ people: [] }),
      });

      const provider = new GwsDirectoryProvider(deps);
      const results = await provider.searchDirectory('nonexistent');

      assert.equal(results.length, 0);
    });
  });

  describe('isAvailable', () => {
    it('returns true when gws is installed and authenticated', async () => {
      const deps = makeDeps({});
      const provider = new GwsDirectoryProvider(deps);
      const result = await provider.isAvailable();
      assert.equal(result, true);
    });

    it('returns false when gws is not installed', async () => {
      const deps = makeNotInstalledDeps();
      const provider = new GwsDirectoryProvider(deps);
      const result = await provider.isAvailable();
      assert.equal(result, false);
    });

    it('returns false when gws is not authenticated', async () => {
      const deps = makeUnauthenticatedDeps();
      const provider = new GwsDirectoryProvider(deps);
      const result = await provider.isAvailable();
      assert.equal(result, false);
    });
  });
});
