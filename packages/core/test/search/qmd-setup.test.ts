import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureQmdCollection,
  generateCollectionName,
} from '../../src/search/qmd-setup.js';
import type { QmdSetupDeps } from '../../src/search/qmd-setup.js';

/**
 * Create mock deps with qmd available and all commands succeeding.
 */
function makeDeps(overrides?: {
  whichStatus?: number;
  addFail?: boolean;
  addError?: string;
  updateFail?: boolean;
  updateError?: string;
  calls?: Array<{ file: string; args: string[]; cwd: string }>;
}): QmdSetupDeps {
  const calls: Array<{ file: string; args: string[]; cwd: string }> = overrides?.calls ?? [];
  return {
    whichSync: () => ({
      status: overrides?.whichStatus ?? 0,
      stdout: '/usr/local/bin/qmd\n',
    }),
    execFileAsync: async (
      file: string,
      args: string[],
      opts: { timeout: number; cwd: string },
    ) => {
      calls.push({ file, args, cwd: opts.cwd });
      if (
        overrides?.addFail &&
        args.includes('collection') &&
        args.includes('add')
      ) {
        throw new Error(overrides.addError ?? 'collection add failed');
      }
      if (overrides?.updateFail && args[0] === 'update') {
        throw new Error(overrides.updateError ?? 'update timed out');
      }
      return { stdout: '', stderr: '' };
    },
  };
}

describe('generateCollectionName', () => {
  it('produces a name from directory basename + hash', () => {
    const name = generateCollectionName('/Users/john/projects/acme-product');
    assert.match(name, /^acme-product-[a-f0-9]{4}$/);
  });

  it('produces different names for same basename in different paths', () => {
    const a = generateCollectionName('/foo/acme');
    const b = generateCollectionName('/bar/acme');
    assert.notEqual(a, b);
    // Both start with acme- but differ in hash
    assert.ok(a.startsWith('acme-'));
    assert.ok(b.startsWith('acme-'));
  });

  it('sanitizes special characters in directory name', () => {
    const name = generateCollectionName('/Users/john/My Project (v2)');
    assert.match(name, /^my-project-v2-[a-f0-9]{4}$/);
  });

  it('handles directory names that are all special characters', () => {
    const name = generateCollectionName('/path/to/!!!');
    assert.match(name, /^workspace-[a-f0-9]{4}$/);
  });

  it('resolves relative paths to absolute before hashing', () => {
    const abs = generateCollectionName(process.cwd());
    const rel = generateCollectionName('.');
    assert.equal(abs, rel);
  });

  it('is deterministic for the same path', () => {
    const a = generateCollectionName('/Users/john/projects/test');
    const b = generateCollectionName('/Users/john/projects/test');
    assert.equal(a, b);
  });
});

describe('ensureQmdCollection', () => {
  it('returns skipped when qmd is not installed', async () => {
    const deps = makeDeps({ whichStatus: 1 });
    const result = await ensureQmdCollection('/workspace', undefined, deps);
    assert.equal(result.skipped, true);
    assert.equal(result.available, false);
    assert.equal(result.created, false);
    assert.equal(result.indexed, false);
  });

  it('creates collection and runs update when no existing collection', async () => {
    const calls: Array<{ file: string; args: string[]; cwd: string }> = [];
    const deps = makeDeps({ calls });
    const result = await ensureQmdCollection('/workspace', undefined, deps);

    assert.equal(result.skipped, false);
    assert.equal(result.available, true);
    assert.equal(result.created, true);
    assert.equal(result.indexed, true);
    assert.ok(result.collectionName);
    assert.equal(result.warning, undefined);

    // Should have called collection add then update
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].args.slice(0, 2), ['collection', 'add']);
    assert.ok(calls[0].args.includes('--mask'));
    assert.ok(calls[0].args.includes('**/*.md'));
    assert.ok(calls[0].args.includes('--name'));
    const nameIndex = calls[0].args.indexOf('--name');
    const collectionNameArg = calls[0].args[nameIndex + 1];
    assert.ok(collectionNameArg?.match(/^[a-z0-9-]+-[a-f0-9]{4}$/), `Expected collection name format, got: ${collectionNameArg}`);
    assert.equal(collectionNameArg, generateCollectionName('/workspace'));
    assert.equal(calls[0].cwd, '/workspace');
    assert.deepEqual(calls[1].args, ['update']);
    assert.equal(calls[1].cwd, '/workspace');
  });

  it('only runs update when existing collection name is provided', async () => {
    const calls: Array<{ file: string; args: string[]; cwd: string }> = [];
    const deps = makeDeps({ calls });
    const result = await ensureQmdCollection('/workspace', 'my-collection', deps);

    assert.equal(result.skipped, false);
    assert.equal(result.created, false);
    assert.equal(result.indexed, true);
    assert.equal(result.collectionName, 'my-collection');

    // Should only have called update, not collection add
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args, ['update']);
  });

  it('returns warning when collection add fails', async () => {
    const deps = makeDeps({ addFail: true, addError: 'permission denied' });
    const result = await ensureQmdCollection('/workspace', undefined, deps);

    assert.equal(result.available, true);
    assert.equal(result.created, false);
    assert.equal(result.indexed, false);
    assert.equal(result.skipped, false);
    assert.ok(result.warning?.includes('permission denied'));
  });

  it('returns warning when update fails after successful create', async () => {
    const deps = makeDeps({ updateFail: true, updateError: 'timeout' });
    const result = await ensureQmdCollection('/workspace', undefined, deps);

    assert.equal(result.available, true);
    assert.equal(result.created, true);
    assert.equal(result.indexed, false);
    assert.ok(result.warning?.includes('timeout'));
  });

  it('returns warning when update fails for existing collection', async () => {
    const deps = makeDeps({ updateFail: true, updateError: 'timeout' });
    const result = await ensureQmdCollection(
      '/workspace',
      'existing-collection',
      deps,
    );

    assert.equal(result.available, true);
    assert.equal(result.created, false);
    assert.equal(result.indexed, false);
    assert.equal(result.collectionName, 'existing-collection');
    assert.ok(result.warning?.includes('timeout'));
  });

  it('passes workspace root as cwd to all qmd commands', async () => {
    const calls: Array<{ file: string; args: string[]; cwd: string }> = [];
    const deps = makeDeps({ calls });
    const workspaceRoot = '/Users/john/projects/acme';
    await ensureQmdCollection(workspaceRoot, undefined, deps);

    for (const call of calls) {
      assert.equal(call.cwd, workspaceRoot);
    }
  });

  it('passes workspace root as path argument to collection add', async () => {
    const calls: Array<{ file: string; args: string[]; cwd: string }> = [];
    const deps = makeDeps({ calls });
    const workspaceRoot = '/Users/john/projects/acme';
    await ensureQmdCollection(workspaceRoot, undefined, deps);

    const addCall = calls.find(
      (c) => c.args.includes('collection') && c.args.includes('add'),
    );
    assert.ok(addCall);
    // The path argument comes after 'add'
    const addIndex = addCall.args.indexOf('add');
    assert.equal(addCall.args[addIndex + 1], workspaceRoot);
  });
});
