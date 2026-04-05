/**
 * Tests for GWS CLI exec wrapper.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gwsExec } from '../../../src/integrations/gws/client.js';
import {
  GwsNotInstalledError,
  GwsAuthError,
  GwsTimeoutError,
  GwsExecError,
} from '../../../src/integrations/gws/types.js';
import type { GwsDeps } from '../../../src/integrations/gws/types.js';

function makeDeps(
  execFn: GwsDeps['exec'],
): GwsDeps {
  return { exec: execFn };
}

describe('gwsExec', () => {
  it('returns parsed JSON from stdout', async () => {
    const expected = { events: [{ id: 'event-1', summary: 'Team Standup' }] };
    const deps = makeDeps(async () => ({
      stdout: JSON.stringify(expected),
      stderr: '',
    }));

    const result = await gwsExec('calendar', 'events', undefined, undefined, deps);

    assert.deepEqual(result, expected);
  });

  it('builds correct command args', async () => {
    let capturedArgs: string[] = [];
    const deps = makeDeps(async (_command, args) => {
      capturedArgs = args;
      return { stdout: '{}', stderr: '' };
    });

    await gwsExec('calendar', 'events', { maxResults: 5 }, undefined, deps);

    assert.deepEqual(capturedArgs, [
      'calendar', 'events', '--format', 'json', '--maxResults', '5',
    ]);
  });

  it('passes args as --key flags without camelCase conversion', async () => {
    let capturedArgs: string[] = [];
    const deps = makeDeps(async (_command, args) => {
      capturedArgs = args;
      return { stdout: '{}', stderr: '' };
    });

    await gwsExec('gmail', 'list', { maxResults: 10, query: 'is:unread' }, undefined, deps);

    // Keys are passed as-is (no camelCase→kebab-case conversion)
    assert.ok(capturedArgs.includes('--maxResults'));
    assert.ok(capturedArgs.includes('10'));
    assert.ok(capturedArgs.includes('--query'));
    assert.ok(capturedArgs.includes('is:unread'));
  });

  it('throws GwsNotInstalledError when binary not found (ENOENT)', async () => {
    const deps = makeDeps(async () => {
      const err = new Error('spawn gws ENOENT') as Error & { code: string };
      err.code = 'ENOENT';
      throw err;
    });

    await assert.rejects(
      () => gwsExec('calendar', 'events', undefined, undefined, deps),
      (err: unknown) => {
        assert.ok(err instanceof GwsNotInstalledError);
        return true;
      },
    );
  });

  it('throws GwsAuthError when stderr contains auth error', async () => {
    const deps = makeDeps(async () => {
      const err = new Error('gws failed') as Error & { stderr: string };
      err.stderr = 'Error: unauthenticated - please run gws auth login';
      throw err;
    });

    await assert.rejects(
      () => gwsExec('gmail', 'list', undefined, undefined, deps),
      (err: unknown) => {
        assert.ok(err instanceof GwsAuthError);
        return true;
      },
    );
  });

  it('throws GwsAuthError when stderr contains "login required"', async () => {
    const deps = makeDeps(async () => {
      const err = new Error('gws failed') as Error & { stderr: string };
      err.stderr = 'login required to access this resource';
      throw err;
    });

    await assert.rejects(
      () => gwsExec('drive', 'list', undefined, undefined, deps),
      (err: unknown) => {
        assert.ok(err instanceof GwsAuthError);
        return true;
      },
    );
  });

  it('throws GwsAuthError when stderr contains "token expired"', async () => {
    const deps = makeDeps(async () => {
      const err = new Error('gws failed') as Error & { stderr: string };
      err.stderr = 'token expired, please re-authenticate';
      throw err;
    });

    await assert.rejects(
      () => gwsExec('gmail', 'list', undefined, undefined, deps),
      (err: unknown) => {
        assert.ok(err instanceof GwsAuthError);
        return true;
      },
    );
  });

  it('throws GwsTimeoutError when process is killed', async () => {
    const deps = makeDeps(async () => {
      const err = new Error('process killed') as Error & { killed: boolean };
      err.killed = true;
      throw err;
    });

    await assert.rejects(
      () => gwsExec('calendar', 'events', undefined, undefined, deps),
      (err: unknown) => {
        assert.ok(err instanceof GwsTimeoutError);
        return true;
      },
    );
  });

  it('throws GwsTimeoutError when signal is SIGTERM', async () => {
    const deps = makeDeps(async () => {
      const err = new Error('process signaled') as Error & { signal: string };
      err.signal = 'SIGTERM';
      throw err;
    });

    await assert.rejects(
      () => gwsExec('calendar', 'events', undefined, undefined, deps),
      (err: unknown) => {
        assert.ok(err instanceof GwsTimeoutError);
        return true;
      },
    );
  });

  it('throws GwsExecError when JSON parse fails', async () => {
    const deps = makeDeps(async () => ({
      stdout: 'this is not valid json',
      stderr: '',
    }));

    await assert.rejects(
      () => gwsExec('calendar', 'events', undefined, undefined, deps),
      (err: unknown) => {
        assert.ok(err instanceof GwsExecError);
        return true;
      },
    );
  });

  it('includes raw stdout in GwsExecError for parse failures', async () => {
    const badOutput = '<html>Error page</html>';
    const deps = makeDeps(async () => ({
      stdout: badOutput,
      stderr: '',
    }));

    await assert.rejects(
      () => gwsExec('calendar', 'events', undefined, undefined, deps),
      (err: unknown) => {
        assert.ok(err instanceof GwsExecError);
        assert.ok((err as Error).message.includes(badOutput));
        return true;
      },
    );
  });

  it('throws GwsExecError with stderr on generic failure', async () => {
    const deps = makeDeps(async () => {
      const err = new Error('something went wrong') as Error & { stderr: string };
      err.stderr = 'internal server error';
      throw err;
    });

    await assert.rejects(
      () => gwsExec('drive', 'list', undefined, undefined, deps),
      (err: unknown) => {
        assert.ok(err instanceof GwsExecError);
        assert.ok((err as Error).message.includes('internal server error'));
        return true;
      },
    );
  });

  it('handles boolean args correctly', async () => {
    let capturedArgs: string[] = [];
    const deps = makeDeps(async (_command, args) => {
      capturedArgs = args;
      return { stdout: '{}', stderr: '' };
    });

    await gwsExec('gmail', 'list', { verbose: true, silent: false }, undefined, deps);

    // verbose: true → --verbose is present
    assert.ok(capturedArgs.includes('--verbose'));
    // silent: false → --silent is NOT present
    assert.ok(!capturedArgs.includes('--silent'));
  });

  it('handles single-character args as short flags', async () => {
    let capturedArgs: string[] = [];
    const deps = makeDeps(async (_command, args) => {
      capturedArgs = args;
      return { stdout: '{}', stderr: '' };
    });

    await gwsExec('gmail', 'list', { n: 5 }, undefined, deps);

    assert.ok(capturedArgs.includes('-n'));
    assert.ok(capturedArgs.includes('5'));
  });
});
