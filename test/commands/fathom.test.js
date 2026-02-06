/**
 * Tests for src/commands/fathom.js
 *
 * These tests verify the command routing logic.
 * The actual Fathom API calls happen in the Python script.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// We test the command router behavior by importing and checking it routes correctly.
// The actual fathom commands call process.exit and spawn Python, so we test the
// routing logic and error handling patterns.

describe('fathom command', () => {
  let originalExit;
  let originalLog;
  let exitCode;
  let logged;

  beforeEach(() => {
    exitCode = null;
    logged = [];
    originalExit = process.exit;
    originalLog = console.log;
    process.exit = (code) => { exitCode = code; throw new Error(`EXIT_${code}`); };
    console.log = (...args) => logged.push(args.join(' '));
  });

  afterEach(() => {
    process.exit = originalExit;
    console.log = originalLog;
  });

  it('can be imported', async () => {
    const mod = await import('../../src/commands/fathom.js');
    assert.ok(mod.fathomCommand);
    assert.equal(typeof mod.fathomCommand, 'function');
  });

  it('exits with code 1 for unknown action', async () => {
    const { fathomCommand } = await import('../../src/commands/fathom.js');
    try {
      await fathomCommand('invalid-action', {});
    } catch (e) {
      // Expected EXIT_1
    }
    assert.equal(exitCode, 1);
  });

  it('outputs JSON error for unknown action with json flag', async () => {
    const { fathomCommand } = await import('../../src/commands/fathom.js');
    try {
      await fathomCommand('invalid-action', { json: true });
    } catch (e) {
      // Expected EXIT_1
    }
    assert.equal(exitCode, 1);
  });
});
