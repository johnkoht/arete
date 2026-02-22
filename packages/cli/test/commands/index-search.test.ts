/**
 * Tests for arete index command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

/** Install a workspace and optionally inject a qmd_collection into arete.yaml */
function setupWorkspace(tmpDir: string, collectionName?: string): void {
  runCli(['install', tmpDir, '--skip-qmd']);

  if (collectionName) {
    const configPath = join(tmpDir, 'arete.yaml');
    const config = parseYaml(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    config.qmd_collection = collectionName;
    writeFileSync(configPath, stringifyYaml(config), 'utf8');
  }
}

describe('index command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-index');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  describe('default run with collection configured', () => {
    it('exits 0 and shows appropriate output (qmd not installed via fallback)', () => {
      // ARETE_SEARCH_FALLBACK=1 is inherited from test process env,
      // so refreshQmdIndex always returns { skipped: true }
      setupWorkspace(tmpDir, 'my-test-collection');

      const { code, stdout } = runCliRaw(['index'], { cwd: tmpDir });

      assert.equal(code, 0, 'Should exit 0 (non-fatal when qmd not installed)');
      assert.ok(
        stdout.includes('qmd not installed') || stdout.includes('Search index updated'),
        `Should show relevant output, got: ${stdout}`,
      );
    });
  });

  describe('--status flag', () => {
    it('prints collection name when configured, does NOT call refreshQmdIndex', () => {
      setupWorkspace(tmpDir, 'my-docs-collection');

      const { code, stdout } = runCliRaw(['index', '--status'], { cwd: tmpDir });

      assert.equal(code, 0, 'Should exit 0');
      assert.ok(
        stdout.includes('my-docs-collection'),
        `Should display collection name, got: ${stdout}`,
      );
      // Should NOT show "Search index updated" or "qmd not installed" (no refresh called)
      assert.ok(
        !stdout.includes('Search index updated'),
        'Should not attempt to update index with --status',
      );
      assert.ok(
        !stdout.includes('qmd not installed'),
        'Should not attempt to update index with --status',
      );
    });

    it('shows "No collection configured" message when no collection set', () => {
      setupWorkspace(tmpDir); // no collection

      const { code, stdout } = runCliRaw(['index', '--status'], { cwd: tmpDir });

      assert.equal(code, 0, 'Should exit 0');
      assert.ok(
        stdout.includes('No collection configured'),
        `Should show no-collection message, got: ${stdout}`,
      );
    });
  });

  describe('default run with ARETE_SEARCH_FALLBACK=1 and collection configured', () => {
    it('shows "qmd not installed" message and exits 0', () => {
      // ARETE_SEARCH_FALLBACK=1 is always set in test environment (inherited by runCli)
      setupWorkspace(tmpDir, 'test-collection');

      const { code, stdout } = runCliRaw(['index'], { cwd: tmpDir });

      assert.equal(code, 0, 'Should exit 0 (non-fatal)');
      assert.ok(
        stdout.includes('qmd not installed'),
        `Should show "qmd not installed" message, got: ${stdout}`,
      );
    });
  });

  describe('default run with no collection configured', () => {
    it('shows "No collection configured" message and exits 0 without calling refreshQmdIndex', () => {
      setupWorkspace(tmpDir); // no collection injected

      const { code, stdout } = runCliRaw(['index'], { cwd: tmpDir });

      assert.equal(code, 0, 'Should exit 0');
      assert.ok(
        stdout.includes('No collection configured'),
        `Should show no-collection message, got: ${stdout}`,
      );
      // Should not mention qmd at all (refreshQmdIndex not called)
      assert.ok(
        !stdout.includes('qmd not installed'),
        'Should not call refreshQmdIndex when no collection configured',
      );
    });
  });
});
