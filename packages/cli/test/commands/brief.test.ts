/**
 * Tests for arete brief command — raw context assembly.
 *
 * Phase 8 followup-2: brief no longer performs LLM synthesis. The command
 * always returns raw assembled context. --raw flag is a hidden no-op kept
 * for backward compat.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { runCli, createTmpDir, cleanupTmpDir } from '../helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupWorkspace(tmpDir: string): void {
  runCli(['install', tmpDir, '--skip-qmd']);
}

function addContextFile(tmpDir: string): void {
  const contextDir = join(tmpDir, 'context');
  mkdirSync(contextDir, { recursive: true });
  writeFileSync(
    join(contextDir, 'business-overview.md'),
    '---\ntitle: Business Overview\n---\n\n# Business Overview\n\nWe build tools for PMs.\n',
    'utf8',
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('arete brief command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-brief-test');
    setupWorkspace(tmpDir);
    addContextFile(tmpDir);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  describe('raw context output (always)', () => {
    it('outputs raw briefing markdown in non-JSON mode', () => {
      const result = runCli(
        ['brief', '--for', 'test topic'],
        { cwd: tmpDir },
      );
      // Should output the markdown directly
      assert.ok(
        result.includes('Briefing') || result.includes('Primitive') || result.includes('Context'),
        'Output should contain briefing content',
      );
    });

    it('outputs raw briefing in JSON mode with raw field', () => {
      const result = runCli(
        ['brief', '--for', 'test topic', '--json'],
        { cwd: tmpDir },
      );
      const output = JSON.parse(result);
      assert.equal(output.success, true);
      assert.ok(typeof output.raw === 'string', 'raw field should be a string');
      assert.ok(output.raw.length > 0, 'raw field should not be empty');
    });
  });

  describe('JSON output structure', () => {
    it('includes the post-removal fields and omits synthesis fields', () => {
      const result = runCli(
        ['brief', '--for', 'test topic', '--json'],
        { cwd: tmpDir },
      );
      const output = JSON.parse(result);
      assert.equal(output.success, true);
      assert.ok('task' in output, 'should have task field');
      assert.ok('confidence' in output, 'should have confidence field');
      assert.ok('assembledAt' in output, 'should have assembledAt field');
      assert.ok('contextFiles' in output, 'should have contextFiles field');
      assert.ok('memoryResults' in output, 'should have memoryResults field');
      assert.ok('entities' in output, 'should have entities field');
      assert.ok('gaps' in output, 'should have gaps field');
      assert.ok('raw' in output, 'should have raw field');
      // Synthesis fields must not be present
      assert.ok(!('synthesized' in output), 'synthesized field should be removed');
      assert.ok(!('synthesis' in output), 'synthesis field should be removed');
      assert.ok(!('truncated' in output), 'truncated field should be removed');
    });
  });

  describe('--raw flag (hidden no-op for backward compat)', () => {
    it('accepts --raw and still returns raw context', () => {
      const result = runCli(
        ['brief', '--for', 'test topic', '--raw', '--json'],
        { cwd: tmpDir },
      );
      const output = JSON.parse(result);
      assert.equal(output.success, true);
      assert.ok(typeof output.raw === 'string', 'raw field should be a string');
      // No synthesis fields under --raw either
      assert.ok(!('synthesized' in output), 'synthesized field should be removed');
    });
  });

  describe('error handling', () => {
    it('errors when --for is missing', () => {
      // Commander will handle this since --for is required
      try {
        runCli(['brief', '--json'], { cwd: tmpDir });
        assert.fail('Should have thrown');
      } catch {
        // Expected — commander exits with error for missing required option
      }
    });
  });
});
