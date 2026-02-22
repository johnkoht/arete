/**
 * Tests for ToolService — tool discovery from workspace tools directory.
 *
 * Uses FileStorageAdapter + real filesystem (mkdtempSync) pattern
 * matching skills.test.ts.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { ToolService } from '../../src/services/tools.js';
import { FileStorageAdapter } from '../../src/storage/file.js';

describe('ToolService', () => {
  let toolsDir: string;
  let service: ToolService;

  beforeEach(() => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'arete-core-tools-'));
    toolsDir = join(tmpDir, 'tools');
    mkdirSync(toolsDir, { recursive: true });
    service = new ToolService(new FileStorageAdapter());
  });

  afterEach(() => {
    // toolsDir is <tmp>/tools — remove the parent
    rmSync(join(toolsDir, '..'), { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // list()
  // -----------------------------------------------------------------------

  describe('list()', () => {
    it('returns tool definitions for subdirs with valid TOOL.md', async () => {
      // Tool A
      const toolADir = join(toolsDir, 'tool-a');
      mkdirSync(toolADir, { recursive: true });
      writeFileSync(
        join(toolADir, 'TOOL.md'),
        [
          '---',
          'name: tool-a',
          'description: First test tool',
          'lifecycle: time-bound',
          'duration: 30 days',
          'triggers:',
          '  - "test trigger"',
          '  - "another trigger"',
          '---',
          '# Tool A',
          'Content here.',
        ].join('\n'),
        'utf8',
      );

      // Tool B
      const toolBDir = join(toolsDir, 'tool-b');
      mkdirSync(toolBDir, { recursive: true });
      writeFileSync(
        join(toolBDir, 'TOOL.md'),
        [
          '---',
          'name: tool-b',
          'description: Second test tool',
          'lifecycle: condition-bound',
          'work_type: planning',
          'category: default',
          'triggers:',
          '  - "plan something"',
          '---',
          '# Tool B',
        ].join('\n'),
        'utf8',
      );

      const tools = await service.list(toolsDir);

      assert.equal(tools.length, 2);

      const a = tools.find(t => t.id === 'tool-a');
      assert.ok(a, 'Should find tool-a');
      assert.equal(a!.name, 'tool-a');
      assert.equal(a!.description, 'First test tool');
      assert.equal(a!.lifecycle, 'time-bound');
      assert.equal(a!.duration, '30 days');
      assert.deepEqual(a!.triggers, ['test trigger', 'another trigger']);
      assert.equal(a!.path, toolADir);

      const b = tools.find(t => t.id === 'tool-b');
      assert.ok(b, 'Should find tool-b');
      assert.equal(b!.name, 'tool-b');
      assert.equal(b!.description, 'Second test tool');
      assert.equal(b!.lifecycle, 'condition-bound');
      assert.equal(b!.workType, 'planning');
      assert.equal(b!.category, 'default');
      assert.deepEqual(b!.triggers, ['plan something']);
    });

    it('returns empty array for non-existent directory', async () => {
      const tools = await service.list(join(toolsDir, 'does-not-exist'));
      assert.deepEqual(tools, []);
    });

    it('handles malformed TOOL.md with no frontmatter', async () => {
      const toolDir = join(toolsDir, 'malformed-tool');
      mkdirSync(toolDir, { recursive: true });
      writeFileSync(join(toolDir, 'TOOL.md'), '# Just Markdown\nNo frontmatter here.', 'utf8');

      const tools = await service.list(toolsDir);

      assert.equal(tools.length, 1);
      const tool = tools[0];
      assert.equal(tool.id, 'malformed-tool');
      assert.equal(tool.name, 'malformed-tool');
      assert.equal(tool.description, '');
      assert.deepEqual(tool.triggers, []);
    });

    it('handles tool directory with no TOOL.md file', async () => {
      const toolDir = join(toolsDir, 'bare-tool');
      mkdirSync(toolDir, { recursive: true });
      // No TOOL.md — just the directory

      const tools = await service.list(toolsDir);

      assert.equal(tools.length, 1);
      const tool = tools[0];
      assert.equal(tool.id, 'bare-tool');
      assert.equal(tool.name, 'bare-tool');
      assert.equal(tool.description, '');
      assert.deepEqual(tool.triggers, []);
      assert.equal(tool.path, toolDir);
    });
  });

  // -----------------------------------------------------------------------
  // get()
  // -----------------------------------------------------------------------

  describe('get()', () => {
    it('returns correct ToolDefinition for existing tool', async () => {
      const toolDir = join(toolsDir, 'my-tool');
      mkdirSync(toolDir, { recursive: true });
      writeFileSync(
        join(toolDir, 'TOOL.md'),
        [
          '---',
          'name: my-tool',
          'description: A specific tool',
          'lifecycle: one-time',
          'triggers:',
          '  - "do the thing"',
          '---',
          '# My Tool',
        ].join('\n'),
        'utf8',
      );

      const tool = await service.get('my-tool', toolsDir);

      assert.ok(tool, 'Should return tool');
      assert.equal(tool!.id, 'my-tool');
      assert.equal(tool!.name, 'my-tool');
      assert.equal(tool!.description, 'A specific tool');
      assert.equal(tool!.lifecycle, 'one-time');
      assert.deepEqual(tool!.triggers, ['do the thing']);
    });

    it('returns null for non-existent tool', async () => {
      const tool = await service.get('nonexistent', toolsDir);
      assert.equal(tool, null);
    });
  });
});
