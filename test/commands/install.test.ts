/**
 * Tests for src/commands/install.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';

import { installCommand } from '../../src/commands/install.js';

// Helpers
function createTmpDir(): string {
  const dir = join(tmpdir(), `arete-test-install-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('install command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('arete.yaml manifest', () => {
    it('includes commented-out calendar config example', async () => {
      await installCommand(tmpDir, { json: true });

      const manifestPath = join(tmpDir, 'arete.yaml');
      assert.ok(existsSync(manifestPath), 'arete.yaml should be created');

      const content = readFileSync(manifestPath, 'utf8');
      
      // Check for calendar config comment
      assert.ok(content.includes('# Calendar integration (macOS only)'), 
        'Should include calendar integration comment');
      assert.ok(content.includes('# Uncomment and configure with: arete integration configure calendar'), 
        'Should include configuration instructions');
      assert.ok(content.includes('# calendar:'), 
        'Should include commented calendar key');
      assert.ok(content.includes('#   provider: macos'), 
        'Should include commented provider field');
      assert.ok(content.includes('#   calendars:'), 
        'Should include commented calendars field');
      assert.ok(content.includes('#     - Work'), 
        'Should include example calendar names');
      assert.ok(content.includes('#     - Personal'), 
        'Should include example calendar names');
    });

    it('creates valid YAML with calendar example commented out', async () => {
      await installCommand(tmpDir, { json: true });

      const manifestPath = join(tmpDir, 'arete.yaml');
      const content = readFileSync(manifestPath, 'utf8');
      
      // Parse the YAML to ensure it's valid (comments are stripped by parser)
      const { parse } = await import('yaml');
      const parsed = parse(content);
      
      assert.equal(typeof parsed, 'object', 'Should parse as valid YAML object');
      assert.equal(parsed.schema, 1, 'Should have schema version');
      assert.ok(parsed.integrations !== undefined, 'Should have integrations section');
      
      // Calendar config should NOT be in the parsed object (it's commented out)
      assert.equal(parsed.integrations.calendar, undefined, 
        'Commented calendar config should not be parsed');
    });
  });
});
