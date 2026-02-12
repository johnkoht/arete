/**
 * Tests for src/commands/template.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';

import { templateListCommand, templateViewCommand } from '../../src/commands/template.js';
import { installCommand } from '../../src/commands/install.js';

function createTmpDir(): string {
  const dir = join(tmpdir(), `arete-test-template-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('template command', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('template list meeting-agendas', () => {
    it('returns JSON with default and custom when run in workspace', async () => {
      await installCommand(tmpDir, { json: true });
      process.chdir(tmpDir);

      let captured = '';
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        captured += args.map(String).join(' ');
      };

      const exit = process.exit;
      let exitCode: number | undefined;
      process.exit = ((code?: number) => {
        exitCode = code ?? 0;
      }) as typeof process.exit;

      await templateListCommand('meeting-agendas', { json: true });
      process.exit = exit;
      console.log = originalLog;

      assert.equal(exitCode, undefined);
      const result = JSON.parse(captured);
      assert.equal(result.success, true);
      assert.ok(Array.isArray(result.default));
      assert.ok(Array.isArray(result.custom));
      assert.ok(result.default.length >= 5);
      assert.equal(result.custom.length, 0);
    });

    it('exits non-zero for unknown kind', async () => {
      await installCommand(tmpDir, { json: true });
      process.chdir(tmpDir);

      let captured = '';
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        captured += args.map(String).join(' ') + '\n';
      };
      let exitCode: number | undefined;
      const exit = process.exit;
      process.exit = ((code?: number) => {
        exitCode = code ?? 0;
      }) as typeof process.exit;

      await templateListCommand('unknown', { json: true });

      process.exit = exit;
      console.log = originalLog;
      assert.equal(exitCode, 1);
      const jsonLine = captured.split('\n').find((l) => l.trim().startsWith('{'));
      assert.ok(jsonLine);
      const result = JSON.parse(jsonLine.trim());
      assert.equal(result.success, false);
      assert.ok(result.error?.includes('Unknown template kind'));
    });
  });

  describe('template view meeting-agenda', () => {
    it('returns template for known type with --json', async () => {
      await installCommand(tmpDir, { json: true });
      process.chdir(tmpDir);

      let captured = '';
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        captured += args.map(String).join(' ');
      };
      let exitCode: number | undefined;
      const exit = process.exit;
      process.exit = ((code?: number) => {
        exitCode = code ?? 0;
      }) as typeof process.exit;

      await templateViewCommand('meeting-agenda', { json: true, type: 'leadership' });

      process.exit = exit;
      console.log = originalLog;
      assert.equal(exitCode, undefined);
      const result = JSON.parse(captured);
      assert.equal(result.success, true);
      assert.equal(result.type, 'leadership');
      assert.ok(result.sections?.length > 0);
    });

    it('exits non-zero when type not found', async () => {
      await installCommand(tmpDir, { json: true });
      process.chdir(tmpDir);

      let captured = '';
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        captured += args[0];
      };
      let exitCode: number | undefined;
      const exit = process.exit;
      process.exit = ((code?: number) => {
        exitCode = code ?? 0;
      }) as typeof process.exit;

      await templateViewCommand('meeting-agenda', { json: true, type: 'nonexistent-type-xyz' });

      process.exit = exit;
      console.log = originalLog;
      assert.equal(exitCode, 1);
      const result = JSON.parse(captured);
      assert.equal(result.success, false);
      assert.ok(result.error?.includes('not found') || result.error?.includes('Template not found'));
    });
  });
});
