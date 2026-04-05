/**
 * Tests for GWS CLI binary detection.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectGws } from '../../../src/integrations/gws/detection.js';
import type { GwsDeps } from '../../../src/integrations/gws/types.js';

function makeDeps(
  execFn: GwsDeps['exec'],
): GwsDeps {
  return { exec: execFn };
}

describe('detectGws', () => {
  it('returns installed: true with version when gws binary found', async () => {
    const deps = makeDeps(async (command, args) => {
      if (args.includes('--version')) {
        return { stdout: 'gws version 0.5.2\n', stderr: '' };
      }
      // auth status
      return { stdout: JSON.stringify({ authenticated: true }), stderr: '' };
    });

    const result = await detectGws(deps);

    assert.equal(result.installed, true);
    assert.equal(result.version, '0.5.2');
  });

  it('returns installed: false when gws binary not found', async () => {
    const deps = makeDeps(async () => {
      const err = new Error('spawn gws ENOENT') as Error & { code: string };
      err.code = 'ENOENT';
      throw err;
    });

    const result = await detectGws(deps);

    assert.equal(result.installed, false);
    assert.equal(result.version, undefined);
    assert.equal(result.authenticated, undefined);
  });

  it('parses version from "gws version X.Y.Z" format', async () => {
    const deps = makeDeps(async (_command, args) => {
      if (args.includes('--version')) {
        return { stdout: 'gws version 1.23.456\n', stderr: '' };
      }
      return { stdout: '{}', stderr: '' };
    });

    const result = await detectGws(deps);

    assert.equal(result.version, '1.23.456');
  });

  it('returns authenticated: true when auth status succeeds', async () => {
    const deps = makeDeps(async (_command, args) => {
      if (args.includes('--version')) {
        return { stdout: 'gws version 0.5.2', stderr: '' };
      }
      if (args.includes('status')) {
        return {
          stdout: JSON.stringify({ authenticated: true, account: 'john@example.com' }),
          stderr: '',
        };
      }
      return { stdout: '', stderr: '' };
    });

    const result = await detectGws(deps);

    assert.equal(result.authenticated, true);
  });

  it('returns authenticated: undefined when auth check fails', async () => {
    let callCount = 0;
    const deps = makeDeps(async (_command, args) => {
      if (args.includes('--version')) {
        return { stdout: 'gws version 0.5.2', stderr: '' };
      }
      // auth status command fails
      throw new Error('auth command not found');
    });

    const result = await detectGws(deps);

    assert.equal(result.installed, true);
    assert.equal(result.authenticated, undefined);
  });

  it('returns installed: false when exec throws non-ENOENT error', async () => {
    const deps = makeDeps(async () => {
      throw new Error('permission denied');
    });

    const result = await detectGws(deps);

    assert.equal(result.installed, false);
  });

  it('does not throw on any error', async () => {
    const deps = makeDeps(async () => {
      throw new Error('unexpected catastrophic failure');
    });

    // Should not throw — just returns installed: false
    const result = await detectGws(deps);
    assert.equal(result.installed, false);
  });
});
