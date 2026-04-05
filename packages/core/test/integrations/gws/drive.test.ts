/**
 * Tests for GwsDriveProvider.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GwsDriveProvider } from '../../../src/integrations/gws/drive.js';
import type { GwsDeps } from '../../../src/integrations/gws/types.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'drive-files.json'), 'utf-8'),
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

      // Drive CLI calls — match on the key built from service+command
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

describe('GwsDriveProvider', () => {
  describe('search', () => {
    it('calls gwsExec with correct args', async () => {
      const capturedArgs: string[][] = [];
      const deps: GwsDeps = {
        exec: async (_command: string, args: string[]) => {
          capturedArgs.push(args);
          return { stdout: JSON.stringify({ files: [] }), stderr: '' };
        },
      };

      const provider = new GwsDriveProvider(deps);
      await provider.search('name contains "roadmap"', { maxResults: 10 });

      const driveCall = capturedArgs.find((a) => a[0] === 'drive');
      assert.ok(driveCall, 'Expected a drive CLI call');
      assert.equal(driveCall[1], 'files');
      assert.ok(driveCall.includes('-q'), 'Should include -q flag');
      assert.ok(driveCall.includes('name contains "roadmap"'), 'Should include the query value');
      assert.ok(driveCall.includes('--maxResults'), 'Should include --maxResults flag');
      assert.ok(driveCall.includes('10'), 'Should include maxResults value');
    });

    it('maps response to DriveFile array', async () => {
      const deps = makeDeps({
        drive_files: JSON.stringify(fixture),
      });

      const provider = new GwsDriveProvider(deps);
      const files = await provider.search('test query');

      assert.equal(files.length, 3);

      assert.equal(files[0].id, 'file-1');
      assert.equal(files[0].name, 'Q2 Roadmap Draft');
      assert.equal(files[0].mimeType, 'application/vnd.google-apps.document');
      assert.equal(files[0].modifiedTime, '2026-04-02T14:30:00.000Z');
      assert.deepEqual(files[0].owners, ['jane@example.com']);
      assert.equal(files[0].webViewLink, 'https://docs.google.com/document/d/file-1/edit');

      assert.equal(files[1].id, 'file-2');
      assert.equal(files[1].name, 'Budget Spreadsheet 2026');

      assert.equal(files[2].id, 'file-3');
      assert.equal(files[2].webViewLink, undefined);
    });

    it('handles empty results', async () => {
      const deps = makeDeps({
        drive_files: JSON.stringify({ files: [] }),
      });

      const provider = new GwsDriveProvider(deps);
      const files = await provider.search('nonexistent');

      assert.equal(files.length, 0);
    });
  });

  describe('getFile', () => {
    it('returns single file', async () => {
      const singleFile = fixture.files[0];
      const deps = makeDeps({
        drive_files: JSON.stringify(singleFile),
      });

      const provider = new GwsDriveProvider(deps);
      const file = await provider.getFile('file-1');

      assert.equal(file.id, 'file-1');
      assert.equal(file.name, 'Q2 Roadmap Draft');
      assert.equal(file.mimeType, 'application/vnd.google-apps.document');
      assert.deepEqual(file.owners, ['jane@example.com']);
    });
  });

  describe('isAvailable', () => {
    it('returns true when gws is installed and authenticated', async () => {
      const deps = makeDeps({});
      const provider = new GwsDriveProvider(deps);
      const result = await provider.isAvailable();
      assert.equal(result, true);
    });

    it('returns false when gws is not installed', async () => {
      const deps = makeNotInstalledDeps();
      const provider = new GwsDriveProvider(deps);
      const result = await provider.isAvailable();
      assert.equal(result, false);
    });

    it('returns false when gws is not authenticated', async () => {
      const deps = makeUnauthenticatedDeps();
      const provider = new GwsDriveProvider(deps);
      const result = await provider.isAvailable();
      assert.equal(result, false);
    });
  });
});
