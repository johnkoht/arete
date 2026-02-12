/**
 * Tests for src/integrations/fathom/index.ts
 *
 * These tests verify the command routing logic.
 * The actual Fathom API calls use the Node client (src/integrations/fathom/client.js).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

describe('fathom command', () => {
  let originalExit: typeof process.exit;
  let originalLog: typeof console.log;
  let exitCode: number | null;
  let logged: string[];

  beforeEach(() => {
    exitCode = null;
    logged = [];
    originalExit = process.exit;
    originalLog = console.log;
    process.exit = ((code: number) => { exitCode = code; throw new Error(`EXIT_${code}`); }) as never;
    console.log = ((...args: unknown[]) => logged.push(args.join(' '))) as typeof console.log;
  });

  afterEach(() => {
    process.exit = originalExit;
    console.log = originalLog;
  });

  it('can be imported from new location', async () => {
    const mod = await import('../../src/integrations/fathom/index.js');
    assert.ok(mod.fathomCommand);
    assert.equal(typeof mod.fathomCommand, 'function');
  });

  it('exits with code 1 for unknown action', async () => {
    const { fathomCommand } = await import('../../src/integrations/fathom/index.js');
    try {
      await fathomCommand('invalid-action', {});
    } catch {
      // Expected EXIT_1
    }
    assert.equal(exitCode, 1);
  });

  it('outputs JSON error for unknown action with json flag', async () => {
    const { fathomCommand } = await import('../../src/integrations/fathom/index.js');
    try {
      await fathomCommand('invalid-action', { json: true });
    } catch {
      // Expected EXIT_1
    }
    assert.equal(exitCode, 1);
  });

  it('exits with code 1 for get with placeholder id', async () => {
    const { fathomCommand } = await import('../../src/integrations/fathom/index.js');
    try {
      await fathomCommand('get', { id: '<id>' });
    } catch {
      // Expected EXIT_1
    }
    assert.equal(exitCode, 1);
  });
});

describe('pullFathomById', () => {
  it('returns error when id is a placeholder', async () => {
    const { pullFathomById } = await import('../../src/integrations/fathom/index.js');
    const r = await pullFathomById('<recording_id>', false);
    assert.equal(r.success, false);
    assert.ok(r.error?.includes('numeric'));
  });

  it('returns error when id is empty', async () => {
    const { pullFathomById } = await import('../../src/integrations/fathom/index.js');
    const r = await pullFathomById('', false);
    assert.equal(r.success, false);
  });
});
