/**
 * Tests for GwsSheetsProvider.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GwsSheetsProvider } from '../../../src/integrations/gws/sheets.js';
import type { GwsDeps } from '../../../src/integrations/gws/types.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sheetsGetFixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'sheets-get.json'), 'utf-8'),
);
const sheetsValuesFixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'sheets-values.json'), 'utf-8'),
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

describe('GwsSheetsProvider', () => {
  describe('getSpreadsheet', () => {
    it('returns metadata with sheet names', async () => {
      const deps = makeDeps({
        sheets_get: JSON.stringify(sheetsGetFixture),
      });

      const provider = new GwsSheetsProvider(deps);
      const result = await provider.getSpreadsheet('sheet-abc-123');

      assert.equal(result.id, 'sheet-abc-123');
      assert.equal(result.title, 'Q2 Budget Tracker');
      assert.deepEqual(result.sheets, ['Summary', 'Details', 'Charts']);
    });

    it('handles empty spreadsheet', async () => {
      const deps = makeDeps({
        sheets_get: JSON.stringify({
          spreadsheetId: 'empty-sheet',
          properties: { title: 'Empty' },
          sheets: [],
        }),
      });

      const provider = new GwsSheetsProvider(deps);
      const result = await provider.getSpreadsheet('empty-sheet');

      assert.equal(result.id, 'empty-sheet');
      assert.equal(result.title, 'Empty');
      assert.deepEqual(result.sheets, []);
    });
  });

  describe('getRange', () => {
    it('returns 2D values array', async () => {
      const deps = makeDeps({
        sheets_values: JSON.stringify(sheetsValuesFixture),
      });

      const provider = new GwsSheetsProvider(deps);
      const result = await provider.getRange('sheet-abc-123', 'Summary!A1:C3');

      assert.equal(result.range, 'Summary!A1:C3');
      assert.equal(result.values.length, 3);
      assert.deepEqual(result.values[0], ['Name', 'Amount', 'Status']);
      assert.deepEqual(result.values[1], ['Engineering', '150000', 'Approved']);
    });

    it('handles empty range', async () => {
      const deps = makeDeps({
        sheets_values: JSON.stringify({ range: 'Sheet1!A1:A1' }),
      });

      const provider = new GwsSheetsProvider(deps);
      const result = await provider.getRange('sheet-abc-123', 'Sheet1!A1:A1');

      assert.equal(result.range, 'Sheet1!A1:A1');
      assert.deepEqual(result.values, []);
    });
  });

  describe('isAvailable', () => {
    it('returns true when gws is installed and authenticated', async () => {
      const deps = makeDeps({});
      const provider = new GwsSheetsProvider(deps);
      const result = await provider.isAvailable();
      assert.equal(result, true);
    });

    it('returns false when gws is not installed', async () => {
      const deps = makeNotInstalledDeps();
      const provider = new GwsSheetsProvider(deps);
      const result = await provider.isAvailable();
      assert.equal(result, false);
    });

    it('returns false when gws is not authenticated', async () => {
      const deps = makeUnauthenticatedDeps();
      const provider = new GwsSheetsProvider(deps);
      const result = await provider.isAvailable();
      assert.equal(result, false);
    });
  });
});
