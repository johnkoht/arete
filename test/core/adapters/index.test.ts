/**
 * Tests for src/core/adapters/index.ts (factory functions)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';

import {
  getAdapter,
  detectAdapter,
  getAdapterFromConfig,
  CursorAdapter,
  ClaudeAdapter,
} from '../../../src/core/adapters/index.js';
import type { AreteConfig } from '../../../src/types.js';

// Helper
function createTmpDir(): string {
  const dir = join(tmpdir(), `arete-test-factory-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('Adapter Factory', () => {
  let tmpDir: string;
  let mockConfig: AreteConfig;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mockConfig = {
      schema: 1,
      version: '1.0.0',
    };
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('getAdapter', () => {
    it('returns CursorAdapter for cursor target', () => {
      const adapter = getAdapter('cursor');
      assert.ok(adapter instanceof CursorAdapter);
      assert.equal(adapter.target, 'cursor');
    });

    it('returns ClaudeAdapter for claude target', () => {
      const adapter = getAdapter('claude');
      assert.ok(adapter instanceof ClaudeAdapter);
      assert.equal(adapter.target, 'claude');
    });
  });

  describe('detectAdapter', () => {
    it('detects CursorAdapter when only .cursor exists', () => {
      const cursorDir = join(tmpDir, '.cursor');
      mkdirSync(cursorDir, { recursive: true });

      const adapter = detectAdapter(tmpDir);
      assert.ok(adapter instanceof CursorAdapter);
      assert.equal(adapter.target, 'cursor');
    });

    it('detects ClaudeAdapter when only .claude exists', () => {
      const claudeDir = join(tmpDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });

      const adapter = detectAdapter(tmpDir);
      assert.ok(adapter instanceof ClaudeAdapter);
      assert.equal(adapter.target, 'claude');
    });

    it('returns CursorAdapter when neither .cursor nor .claude exist (default)', () => {
      const adapter = detectAdapter(tmpDir);
      assert.ok(adapter instanceof CursorAdapter);
      assert.equal(adapter.target, 'cursor');
    });

    it('prioritizes Cursor over Claude when both exist', () => {
      const cursorDir = join(tmpDir, '.cursor');
      const claudeDir = join(tmpDir, '.claude');
      mkdirSync(cursorDir, { recursive: true });
      mkdirSync(claudeDir, { recursive: true });

      const adapter = detectAdapter(tmpDir);
      assert.ok(adapter instanceof CursorAdapter);
      assert.equal(adapter.target, 'cursor');
    });
  });

  describe('getAdapterFromConfig', () => {
    it('returns CursorAdapter when ide_target is cursor', () => {
      const config = { ...mockConfig, ide_target: 'cursor' as const };
      const adapter = getAdapterFromConfig(config, tmpDir);
      assert.ok(adapter instanceof CursorAdapter);
      assert.equal(adapter.target, 'cursor');
    });

    it('returns ClaudeAdapter when ide_target is claude', () => {
      const config = { ...mockConfig, ide_target: 'claude' as const };
      const adapter = getAdapterFromConfig(config, tmpDir);
      assert.ok(adapter instanceof ClaudeAdapter);
      assert.equal(adapter.target, 'claude');
    });

    it('calls detectAdapter when ide_target is undefined', () => {
      const cursorDir = join(tmpDir, '.cursor');
      mkdirSync(cursorDir, { recursive: true });

      const adapter = getAdapterFromConfig(mockConfig, tmpDir);
      assert.ok(adapter instanceof CursorAdapter);
    });

    it('prioritizes config.ide_target over detected directory', () => {
      // Create .cursor directory in workspace
      const cursorDir = join(tmpDir, '.cursor');
      mkdirSync(cursorDir, { recursive: true });

      // But config specifies claude
      const config = { ...mockConfig, ide_target: 'claude' as const };
      const adapter = getAdapterFromConfig(config, tmpDir);

      // Should return Claude despite .cursor existing
      assert.ok(adapter instanceof ClaudeAdapter);
      assert.equal(adapter.target, 'claude');
    });

    it('falls back to Cursor default when no ide_target and no directories', () => {
      const adapter = getAdapterFromConfig(mockConfig, tmpDir);
      assert.ok(adapter instanceof CursorAdapter);
      assert.equal(adapter.target, 'cursor');
    });
  });
});
