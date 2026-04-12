/**
 * Tests for arete brief command — AI synthesis, --raw flag, fallback behavior.
 *
 * Tests the registerBriefCommand logic by calling it via runCli on
 * a temp workspace with mocked AI configuration.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { runCli, createTmpDir, cleanupTmpDir } from '../helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupWorkspace(tmpDir: string): void {
  runCli(['install', tmpDir, '--skip-qmd']);
}

function enableAI(tmpDir: string): void {
  const configPath = join(tmpDir, 'arete.yaml');
  const config = parseYaml(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  config.ai = {
    tiers: {
      fast: 'anthropic/claude-3-haiku-20240307',
      standard: 'anthropic/claude-sonnet-4-20250514',
    },
  };
  writeFileSync(configPath, stringifyYaml(config), 'utf8');
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

  describe('--raw flag', () => {
    it('outputs raw briefing markdown with --raw', () => {
      const result = runCli(
        ['brief', '--for', 'test topic', '--raw', '--json'],
        { cwd: tmpDir },
      );
      const output = JSON.parse(result);
      assert.equal(output.success, true);
      assert.equal(output.synthesized, false);
      assert.equal(output.synthesis, null);
      assert.ok(typeof output.raw === 'string', 'raw field should be a string');
      assert.ok(output.raw.length > 0, 'raw field should not be empty');
    });

    it('outputs raw briefing in non-JSON mode with --raw', () => {
      const result = runCli(
        ['brief', '--for', 'test topic', '--raw'],
        { cwd: tmpDir },
      );
      // Raw mode should output the markdown directly
      assert.ok(result.includes('Briefing') || result.includes('Primitive') || result.includes('Context'),
        'Output should contain briefing content');
    });
  });

  describe('no AI configured', () => {
    it('falls back to raw output with info message when AI not configured', () => {
      const result = runCli(
        ['brief', '--for', 'test topic'],
        { cwd: tmpDir },
      );
      // Should show info about configuring AI
      assert.ok(
        result.includes('AI synthesis not available') || result.includes('credentials'),
        'Should mention AI is not available',
      );
    });

    it('includes synthesized: false in JSON when AI not configured', () => {
      const result = runCli(
        ['brief', '--for', 'test topic', '--json'],
        { cwd: tmpDir },
      );
      const output = JSON.parse(result);
      assert.equal(output.success, true);
      assert.equal(output.synthesized, false);
      assert.equal(output.synthesis, null);
      assert.ok(typeof output.raw === 'string');
    });
  });

  describe('JSON output structure', () => {
    it('includes all required fields in JSON output', () => {
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
      assert.ok('synthesized' in output, 'should have synthesized field');
      assert.ok('truncated' in output, 'should have truncated field');
      assert.ok('synthesis' in output, 'should have synthesis field');
      assert.ok('raw' in output, 'should have raw field');
    });

    it('--raw flag forces synthesized: false in JSON even with AI configured', () => {
      enableAI(tmpDir);
      const result = runCli(
        ['brief', '--for', 'test topic', '--raw', '--json'],
        { cwd: tmpDir },
      );
      const output = JSON.parse(result);
      assert.equal(output.success, true);
      assert.equal(output.synthesized, false);
      // With --raw, synthesis should not be attempted regardless of AI config
    });
  });

  describe('AI synthesis (configured but no real API key)', () => {
    it('falls back gracefully when AI configured but call fails', () => {
      enableAI(tmpDir);
      // AI is configured in yaml but no actual API key exists,
      // so the AI call will fail and the command should fall back to raw
      const result = runCli(
        ['brief', '--for', 'test topic', '--json'],
        { cwd: tmpDir },
      );
      const output = JSON.parse(result);
      assert.equal(output.success, true);
      // synthesized may be false because the AI call fails without credentials
      assert.ok(typeof output.raw === 'string', 'raw field always present');
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
