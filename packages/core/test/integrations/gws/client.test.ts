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

    const result = await gwsExec('calendar', 'events list', undefined, undefined, deps);

    assert.deepEqual(result, expected);
  });

  it('builds correct command args with --params JSON', async () => {
    let capturedArgs: string[] = [];
    const deps = makeDeps(async (_command, args) => {
      capturedArgs = args;
      return { stdout: '{}', stderr: '' };
    });

    await gwsExec('calendar', 'events list', { maxResults: 5 }, undefined, deps);

    assert.deepEqual(capturedArgs, [
      'calendar', 'events', 'list', '--format', 'json', '--params', '{"maxResults":5}',
    ]);
  });

  it('splits multi-segment command into path parts', async () => {
    let capturedArgs: string[] = [];
    const deps = makeDeps(async (_command, args) => {
      capturedArgs = args;
      return { stdout: '{}', stderr: '' };
    });

    await gwsExec('gmail', 'users messages list', { userId: 'me', q: 'is:unread' }, undefined, deps);

    assert.deepEqual(capturedArgs, [
      'gmail', 'users', 'messages', 'list', '--format', 'json',
      '--params', '{"userId":"me","q":"is:unread"}',
    ]);
  });

  it('omits --params when no args provided', async () => {
    let capturedArgs: string[] = [];
    const deps = makeDeps(async (_command, args) => {
      capturedArgs = args;
      return { stdout: '{}', stderr: '' };
    });

    await gwsExec('calendar', 'events list', undefined, undefined, deps);

    assert.deepEqual(capturedArgs, ['calendar', 'events', 'list', '--format', 'json']);
    assert.ok(!capturedArgs.includes('--params'));
  });

  it('serializes array values in --params JSON', async () => {
    let capturedArgs: string[] = [];
    const deps = makeDeps(async (_command, args) => {
      capturedArgs = args;
      return { stdout: '{}', stderr: '' };
    });

    await gwsExec('gmail', 'users messages get', {
      userId: 'me',
      id: 'msg-1',
      metadataHeaders: ['From', 'Subject', 'Date'],
    }, undefined, deps);

    const paramsIdx = capturedArgs.indexOf('--params');
    assert.ok(paramsIdx >= 0, 'Should include --params');
    const params = JSON.parse(capturedArgs[paramsIdx + 1]);
    assert.deepEqual(params.metadataHeaders, ['From', 'Subject', 'Date']);
  });

  it('throws GwsNotInstalledError when binary not found (ENOENT)', async () => {
    const deps = makeDeps(async () => {
      const err = new Error('spawn gws ENOENT') as Error & { code: string };
      err.code = 'ENOENT';
      throw err;
    });

    await assert.rejects(
      () => gwsExec('calendar', 'events list', undefined, undefined, deps),
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
      () => gwsExec('gmail', 'users messages list', undefined, undefined, deps),
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
      () => gwsExec('drive', 'files list', undefined, undefined, deps),
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
      () => gwsExec('gmail', 'users messages list', undefined, undefined, deps),
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
      () => gwsExec('calendar', 'events list', undefined, undefined, deps),
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
      () => gwsExec('calendar', 'events list', undefined, undefined, deps),
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
      () => gwsExec('calendar', 'events list', undefined, undefined, deps),
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
      () => gwsExec('calendar', 'events list', undefined, undefined, deps),
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
      () => gwsExec('drive', 'files list', undefined, undefined, deps),
      (err: unknown) => {
        assert.ok(err instanceof GwsExecError);
        assert.ok((err as Error).message.includes('internal server error'));
        return true;
      },
    );
  });
});
