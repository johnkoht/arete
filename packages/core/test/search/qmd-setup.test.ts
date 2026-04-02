import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  embedQmdIndex,
  ensureQmdCollection,
  ensureQmdCollections,
  generateCollectionName,
  generateScopedCollectionName,
  refreshQmdIndex,
  ALL_SCOPES,
  SCOPE_PATHS,
} from '../../src/search/qmd-setup.js';
import type { QmdSetupDeps, QmdCollectionsDeps } from '../../src/search/qmd-setup.js';
import type { QmdScope, QmdCollections } from '../../src/models/workspace.js';

/**
 * Create mock deps with qmd available and all commands succeeding.
 */
function makeDeps(overrides?: {
  whichStatus?: number;
  addFail?: boolean;
  addError?: string;
  updateFail?: boolean;
  updateError?: string;
  embedFail?: boolean;
  embedError?: string;
  listOutput?: string; // Output from `qmd collection list`
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
      if (overrides?.embedFail && args[0] === 'embed') {
        throw new Error(overrides.embedError ?? 'embed failed');
      }
      // Handle `qmd collection list` — return configured collections
      if (args.includes('collection') && args.includes('list')) {
        return { stdout: overrides?.listOutput ?? '', stderr: '' };
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

  it('creates collection, runs update, and embeds when no existing collection', async () => {
    const calls: Array<{ file: string; args: string[]; cwd: string }> = [];
    const deps = makeDeps({ calls });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      const result = await ensureQmdCollection('/workspace', undefined, deps);

      assert.equal(result.skipped, false);
      assert.equal(result.available, true);
      assert.equal(result.created, true);
      assert.equal(result.indexed, true);
      assert.equal(result.embedded, true);
      assert.ok(result.collectionName);
      assert.equal(result.warning, undefined);
      assert.equal(result.embedWarning, undefined);

      // Should have called collection add, then update, then embed
      assert.equal(calls.length, 3);
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
      assert.deepEqual(calls[2].args, ['embed']);
      assert.equal(calls[2].cwd, '/workspace');
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });

  it('runs update and embed when existing collection name is provided and exists in qmd', async () => {
    const calls: Array<{ file: string; args: string[]; cwd: string }> = [];
    // Mock qmd collection list to return the existing collection
    const deps = makeDeps({ calls, listOutput: 'my-collection\nother-collection\n' });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      const result = await ensureQmdCollection('/workspace', 'my-collection', deps);

      assert.equal(result.skipped, false);
      assert.equal(result.created, false);
      assert.equal(result.indexed, true);
      assert.equal(result.embedded, true);
      assert.equal(result.collectionName, 'my-collection');

      // Should have called collection list, then update, then embed
      assert.equal(calls.length, 3);
      assert.deepEqual(calls[0].args, ['collection', 'list']);
      assert.deepEqual(calls[1].args, ['update']);
      assert.deepEqual(calls[2].args, ['embed']);
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });

  it('creates collection and embeds when name is in config but not in qmd', async () => {
    const calls: Array<{ file: string; args: string[]; cwd: string }> = [];
    // Mock qmd collection list to return empty (collection doesn't exist)
    const deps = makeDeps({ calls, listOutput: '' });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      const result = await ensureQmdCollection('/workspace', 'my-collection', deps);

      assert.equal(result.skipped, false);
      assert.equal(result.created, true);
      assert.equal(result.indexed, true);
      assert.equal(result.embedded, true);
      assert.equal(result.collectionName, 'my-collection');

      // Should have called collection list, then collection add, then update, then embed
      assert.equal(calls.length, 4);
      assert.deepEqual(calls[0].args, ['collection', 'list']);
      assert.ok(calls[1].args.includes('collection') && calls[1].args.includes('add'));
      assert.deepEqual(calls[2].args, ['update']);
      assert.deepEqual(calls[3].args, ['embed']);
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
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
    // Mock qmd collection list to show the collection exists
    const deps = makeDeps({
      updateFail: true,
      updateError: 'timeout',
      listOutput: 'existing-collection\n',
    });
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

  it('returns embedWarning when embed fails after successful create and update', async () => {
    const deps = makeDeps({ embedFail: true, embedError: 'model download failed' });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      const result = await ensureQmdCollection('/workspace', undefined, deps);

      assert.equal(result.available, true);
      assert.equal(result.created, true);
      assert.equal(result.indexed, true);
      assert.equal(result.embedded, false);
      assert.equal(result.warning, undefined);
      assert.ok(result.embedWarning?.includes('model download failed'));
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });

  it('returns embedWarning when embed fails for existing collection', async () => {
    // Mock qmd collection list to show the collection exists
    const deps = makeDeps({
      embedFail: true,
      embedError: 'model download failed',
      listOutput: 'existing-collection\n',
    });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      const result = await ensureQmdCollection(
        '/workspace',
        'existing-collection',
        deps,
      );

      assert.equal(result.available, true);
      assert.equal(result.created, false);
      assert.equal(result.indexed, true);
      assert.equal(result.embedded, false);
      assert.equal(result.warning, undefined);
      assert.ok(result.embedWarning?.includes('model download failed'));
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
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

describe('refreshQmdIndex', () => {
  it('skips when qmd is not on PATH', async () => {
    const deps = makeDeps({ whichStatus: 1 });
    const result = await refreshQmdIndex('/workspace', 'my-collection', deps);
    assert.equal(result.skipped, true);
    assert.equal(result.indexed, false);
    assert.equal(result.warning, undefined);
  });

  it('skips when existingCollectionName is undefined', async () => {
    const deps = makeDeps();
    const result = await refreshQmdIndex('/workspace', undefined, deps);
    assert.equal(result.skipped, true);
    assert.equal(result.indexed, false);
  });

  it('skips when existingCollectionName is empty string', async () => {
    const deps = makeDeps();
    const result = await refreshQmdIndex('/workspace', '', deps);
    assert.equal(result.skipped, true);
    assert.equal(result.indexed, false);
  });

  it('skips when ARETE_SEARCH_FALLBACK env var is set', async () => {
    const deps = makeDeps();
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      process.env.ARETE_SEARCH_FALLBACK = '1';
      const result = await refreshQmdIndex('/workspace', 'my-collection', deps);
      assert.equal(result.skipped, true);
      assert.equal(result.indexed, false);
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });

  it('runs qmd update and embed, returns indexed:true and embedded:true on success', async () => {
    const calls: Array<{ file: string; args: string[]; cwd: string }> = [];
    const deps = makeDeps({ calls });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      const result = await refreshQmdIndex('/workspace', 'my-collection', deps);
      assert.equal(result.skipped, false);
      assert.equal(result.indexed, true);
      assert.equal(result.embedded, true);
      assert.equal(result.warning, undefined);
      assert.equal(result.embedWarning, undefined);
      // Should have called update then embed
      assert.equal(calls.length, 2);
      assert.equal(calls[0].file, 'qmd');
      assert.deepEqual(calls[0].args, ['update']);
      assert.equal(calls[0].cwd, '/workspace');
      assert.deepEqual(calls[1].args, ['embed']);
      assert.equal(calls[1].cwd, '/workspace');
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });

  it('returns indexed:true with embedWarning when embed fails', async () => {
    const calls: Array<{ file: string; args: string[]; cwd: string }> = [];
    const deps = makeDeps({ calls, embedFail: true, embedError: 'model download failed' });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      const result = await refreshQmdIndex('/workspace', 'my-collection', deps);
      assert.equal(result.skipped, false);
      assert.equal(result.indexed, true);
      assert.equal(result.embedded, false);
      assert.equal(result.warning, undefined);
      assert.ok(result.embedWarning?.includes('model download failed'));
      // Both commands were called
      assert.equal(calls.length, 2);
      assert.deepEqual(calls[0].args, ['update']);
      assert.deepEqual(calls[1].args, ['embed']);
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });

  it('returns warning and skipped:false on qmd update failure', async () => {
    const deps = makeDeps({ updateFail: true, updateError: 'update timed out' });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      const result = await refreshQmdIndex('/workspace', 'my-collection', deps);
      assert.equal(result.skipped, false);
      assert.equal(result.indexed, false);
      assert.ok(result.warning?.includes('update timed out'));
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });
});

describe('embedQmdIndex', () => {
  it('skips when qmd is not on PATH', async () => {
    const deps = makeDeps({ whichStatus: 1 });
    const result = await embedQmdIndex('/workspace', 'my-collection', deps);
    assert.equal(result.skipped, true);
    assert.equal(result.embedded, false);
    assert.equal(result.warning, undefined);
  });

  it('skips when existingCollectionName is undefined', async () => {
    const deps = makeDeps();
    const result = await embedQmdIndex('/workspace', undefined, deps);
    assert.equal(result.skipped, true);
    assert.equal(result.embedded, false);
  });

  it('skips when existingCollectionName is empty string', async () => {
    const deps = makeDeps();
    const result = await embedQmdIndex('/workspace', '', deps);
    assert.equal(result.skipped, true);
    assert.equal(result.embedded, false);
  });

  it('skips when ARETE_SEARCH_FALLBACK env var is set', async () => {
    const deps = makeDeps();
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      process.env.ARETE_SEARCH_FALLBACK = '1';
      const result = await embedQmdIndex('/workspace', 'my-collection', deps);
      assert.equal(result.skipped, true);
      assert.equal(result.embedded, false);
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });

  it('runs qmd embed and returns embedded:true on success', async () => {
    const calls: Array<{ file: string; args: string[]; cwd: string }> = [];
    const deps = makeDeps({ calls });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      const result = await embedQmdIndex('/workspace', 'my-collection', deps);
      assert.equal(result.skipped, false);
      assert.equal(result.embedded, true);
      assert.equal(result.warning, undefined);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].file, 'qmd');
      assert.deepEqual(calls[0].args, ['embed']);
      assert.equal(calls[0].cwd, '/workspace');
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });

  it('returns warning and skipped:false on qmd embed failure', async () => {
    const deps = makeDeps({ embedFail: true, embedError: 'model download failed' });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      const result = await embedQmdIndex('/workspace', 'my-collection', deps);
      assert.equal(result.skipped, false);
      assert.equal(result.embedded, false);
      assert.ok(result.warning?.includes('model download failed'));
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });
});

// ============================================================================
// Multi-collection support tests
// ============================================================================

describe('generateScopedCollectionName', () => {
  it('produces format arete-<hash>-<scope>', () => {
    const name = generateScopedCollectionName('/Users/john/projects/acme', 'memory');
    assert.match(name, /^arete-[a-f0-9]{4}-memory$/);
  });

  it('produces different names for different scopes', () => {
    const root = '/Users/john/projects/acme';
    const memory = generateScopedCollectionName(root, 'memory');
    const all = generateScopedCollectionName(root, 'all');
    const meetings = generateScopedCollectionName(root, 'meetings');

    assert.notEqual(memory, all);
    assert.notEqual(memory, meetings);
    assert.notEqual(all, meetings);

    // But same hash prefix
    const memoryHash = memory.split('-')[1];
    const allHash = all.split('-')[1];
    assert.equal(memoryHash, allHash);
  });

  it('produces different names for same scope in different workspaces', () => {
    const a = generateScopedCollectionName('/foo/acme', 'memory');
    const b = generateScopedCollectionName('/bar/acme', 'memory');
    assert.notEqual(a, b);
  });

  it('is deterministic for the same workspace and scope', () => {
    const a = generateScopedCollectionName('/Users/john/projects/test', 'memory');
    const b = generateScopedCollectionName('/Users/john/projects/test', 'memory');
    assert.equal(a, b);
  });
});

describe('SCOPE_PATHS', () => {
  it('has 10 scopes', () => {
    assert.equal(Object.keys(SCOPE_PATHS).length, 10);
  });

  it('has all expected scopes', () => {
    assert.equal(SCOPE_PATHS.all, '.');
    assert.equal(SCOPE_PATHS.memory, '.arete/memory/items');
    assert.equal(SCOPE_PATHS.meetings, 'resources/meetings');
    assert.equal(SCOPE_PATHS.context, 'context');
    assert.equal(SCOPE_PATHS.projects, 'projects');
    assert.equal(SCOPE_PATHS.people, 'people');
    assert.equal(SCOPE_PATHS.areas, 'areas');
    assert.equal(SCOPE_PATHS.goals, 'goals');
    assert.equal(SCOPE_PATHS.now, 'now');
    assert.equal(SCOPE_PATHS.resources, 'resources');
  });
});

describe('ALL_SCOPES', () => {
  it('has 10 scopes', () => {
    assert.equal(ALL_SCOPES.length, 10);
  });

  it('includes all expected scopes', () => {
    assert.ok(ALL_SCOPES.includes('all'));
    assert.ok(ALL_SCOPES.includes('memory'));
    assert.ok(ALL_SCOPES.includes('meetings'));
    assert.ok(ALL_SCOPES.includes('context'));
    assert.ok(ALL_SCOPES.includes('projects'));
    assert.ok(ALL_SCOPES.includes('people'));
    assert.ok(ALL_SCOPES.includes('areas'));
    assert.ok(ALL_SCOPES.includes('goals'));
    assert.ok(ALL_SCOPES.includes('now'));
    assert.ok(ALL_SCOPES.includes('resources'));
  });
});

/**
 * Create mock deps for multi-collection tests.
 */
function makeCollectionsDeps(overrides?: {
  whichStatus?: number;
  addFailScopes?: Set<QmdScope>;
  updateFail?: boolean;
  updateError?: string;
  embedFail?: boolean;
  embedError?: string;
  listOutput?: string;
  existingPaths?: Set<string>;
  calls?: Array<{ file: string; args: string[]; cwd: string }>;
}): QmdCollectionsDeps {
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
      if (args.includes('collection') && args.includes('add')) {
        // Check if this scope should fail
        if (overrides?.addFailScopes) {
          // Extract scope from collection name (format: arete-xxxx-<scope>)
          const nameIndex = args.indexOf('--name');
          if (nameIndex >= 0) {
            const name = args[nameIndex + 1];
            const scope = name.split('-').pop() as QmdScope;
            if (overrides.addFailScopes.has(scope)) {
              throw new Error(`collection add failed for ${scope}`);
            }
          }
        }
        return { stdout: '', stderr: '' };
      }
      if (overrides?.updateFail && args[0] === 'update') {
        throw new Error(overrides.updateError ?? 'update timed out');
      }
      if (overrides?.embedFail && args[0] === 'embed') {
        throw new Error(overrides.embedError ?? 'embed failed');
      }
      if (args.includes('collection') && args.includes('list')) {
        return { stdout: overrides?.listOutput ?? '', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    },
    pathExists: (path: string) => {
      if (overrides?.existingPaths) {
        return overrides.existingPaths.has(path);
      }
      // Default: all paths exist
      return true;
    },
  };
}

describe('ensureQmdCollections', () => {
  it('skips when qmd is not installed', async () => {
    const deps = makeCollectionsDeps({ whichStatus: 1 });
    const result = await ensureQmdCollections('/workspace', undefined, deps);
    assert.equal(result.skipped, true);
    assert.equal(result.available, false);
    assert.equal(result.indexed, false);
    assert.deepEqual(result.collections, {});
  });

  it('skips when ARETE_SEARCH_FALLBACK is set', async () => {
    const deps = makeCollectionsDeps();
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      process.env.ARETE_SEARCH_FALLBACK = '1';
      const result = await ensureQmdCollections('/workspace', undefined, deps);
      assert.equal(result.skipped, true);
      assert.equal(result.available, false);
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });

  it('creates collections for all existing paths', async () => {
    const calls: Array<{ file: string; args: string[]; cwd: string }> = [];
    const existingPaths = new Set([
      '/workspace',  // all (join('/workspace', '.') returns '/workspace')
      '/workspace/.arete/memory/items',  // memory
      '/workspace/context',  // context
      '/workspace/projects',  // projects
      '/workspace/people',  // people
      // Note: meetings (resources/meetings) is missing
    ]);
    const deps = makeCollectionsDeps({ calls, existingPaths });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      const result = await ensureQmdCollections('/workspace', undefined, deps);

      assert.equal(result.skipped, false);
      assert.equal(result.available, true);
      assert.equal(result.indexed, true);
      assert.equal(result.embedded, true);

      // Should have 5 collections (meetings skipped)
      assert.equal(Object.keys(result.collections).length, 5);
      assert.ok(result.collections.all);
      assert.ok(result.collections.memory);
      assert.ok(result.collections.context);
      assert.ok(result.collections.projects);
      assert.ok(result.collections.people);
      assert.equal(result.collections.meetings, undefined);

      // Verify meetings was skipped in scope results
      const meetingsScope = result.scopes.find(s => s.scope === 'meetings');
      assert.ok(meetingsScope);
      assert.equal(meetingsScope.skipped, true);
      assert.equal(meetingsScope.created, false);

      // Should have: 1 list + 5 adds + 1 update + 1 embed = 8 calls
      assert.equal(calls.length, 8);
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });

  it('creates all 10 collections when all paths exist', async () => {
    const calls: Array<{ file: string; args: string[]; cwd: string }> = [];
    const existingPaths = new Set([
      '/workspace',  // all
      '/workspace/.arete/memory/items',
      '/workspace/resources/meetings',
      '/workspace/context',
      '/workspace/projects',
      '/workspace/people',
      '/workspace/areas',
      '/workspace/goals',
      '/workspace/now',
      '/workspace/resources',
    ]);
    const deps = makeCollectionsDeps({ calls, existingPaths });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      const result = await ensureQmdCollections('/workspace', undefined, deps);

      assert.equal(Object.keys(result.collections).length, 10);
      assert.ok(result.collections.all);
      assert.ok(result.collections.memory);
      assert.ok(result.collections.meetings);
      assert.ok(result.collections.context);
      assert.ok(result.collections.projects);
      assert.ok(result.collections.people);
      assert.ok(result.collections.areas);
      assert.ok(result.collections.goals);
      assert.ok(result.collections.now);
      assert.ok(result.collections.resources);

      // All scopes should not be skipped
      for (const scope of result.scopes) {
        assert.equal(scope.skipped, false);
      }
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });

  it('skips collections that already exist in qmd', async () => {
    const calls: Array<{ file: string; args: string[]; cwd: string }> = [];
    const existingPaths = new Set([
      '/workspace',
      '/workspace/.arete/memory/items',
      '/workspace/context',
    ]);
    // Simulate that 'all' collection already exists
    const existingCollections: QmdCollections = { all: 'arete-a1b2-all' };
    const deps = makeCollectionsDeps({
      calls,
      existingPaths,
      listOutput: 'arete-a1b2-all (qmd://arete-a1b2-all/)\n',
    });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      const result = await ensureQmdCollections('/workspace', existingCollections, deps);

      assert.equal(result.skipped, false);
      assert.equal(Object.keys(result.collections).length, 3);

      // 'all' should not be created (already exists)
      const allScope = result.scopes.find(s => s.scope === 'all');
      assert.ok(allScope);
      assert.equal(allScope.created, false);
      assert.equal(allScope.skipped, false);

      // memory and context should be created
      const memoryScope = result.scopes.find(s => s.scope === 'memory');
      assert.ok(memoryScope);
      assert.equal(memoryScope.created, true);

      // Should have: 1 list + 2 adds (not 3, 'all' skipped) + 1 update + 1 embed = 5 calls
      assert.equal(calls.length, 5);
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });

  it('records warning when collection add fails for a scope', async () => {
    const calls: Array<{ file: string; args: string[]; cwd: string }> = [];
    const existingPaths = new Set([
      '/workspace',
      '/workspace/.arete/memory/items',
    ]);
    const deps = makeCollectionsDeps({
      calls,
      existingPaths,
      addFailScopes: new Set(['memory'] as QmdScope[]),
    });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      const result = await ensureQmdCollections('/workspace', undefined, deps);

      // 'all' should succeed
      const allScope = result.scopes.find(s => s.scope === 'all');
      assert.ok(allScope);
      assert.equal(allScope.created, true);
      assert.equal(allScope.warning, undefined);

      // 'memory' should fail with warning
      const memoryScope = result.scopes.find(s => s.scope === 'memory');
      assert.ok(memoryScope);
      assert.equal(memoryScope.created, false);
      assert.ok(memoryScope.warning?.includes('memory'));

      // Should still have 'all' in collections
      assert.ok(result.collections.all);
      assert.equal(result.collections.memory, undefined);
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });

  it('returns warning when no paths exist', async () => {
    const deps = makeCollectionsDeps({ existingPaths: new Set() });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      const result = await ensureQmdCollections('/workspace', undefined, deps);

      assert.equal(result.skipped, false);
      assert.equal(result.available, true);
      assert.equal(result.indexed, false);
      assert.deepEqual(result.collections, {});
      assert.ok(result.warning?.includes('No collections created'));

      // All scopes should be skipped
      for (const scope of result.scopes) {
        assert.equal(scope.skipped, true);
      }
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });

  it('returns update warning when qmd update fails', async () => {
    const existingPaths = new Set(['/workspace']);
    const deps = makeCollectionsDeps({
      existingPaths,
      updateFail: true,
      updateError: 'disk full',
    });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      const result = await ensureQmdCollections('/workspace', undefined, deps);

      assert.equal(result.indexed, false);
      assert.ok(result.warning?.includes('disk full'));
      // Collections should still be recorded
      assert.ok(result.collections.all);
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });

  it('returns embedWarning when embed fails', async () => {
    const existingPaths = new Set(['/workspace']);
    const deps = makeCollectionsDeps({
      existingPaths,
      embedFail: true,
      embedError: 'model download failed',
    });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      const result = await ensureQmdCollections('/workspace', undefined, deps);

      assert.equal(result.indexed, true);
      assert.equal(result.embedded, false);
      assert.ok(result.embedWarning?.includes('model download failed'));
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });

  it('uses correct paths for each scope', async () => {
    const calls: Array<{ file: string; args: string[]; cwd: string }> = [];
    const existingPaths = new Set([
      '/workspace',
      '/workspace/.arete/memory/items',
      '/workspace/resources/meetings',
      '/workspace/context',
      '/workspace/projects',
      '/workspace/people',
    ]);
    const deps = makeCollectionsDeps({ calls, existingPaths });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      await ensureQmdCollections('/workspace', undefined, deps);

      // Find all collection add calls
      const addCalls = calls.filter(
        c => c.args.includes('collection') && c.args.includes('add'),
      );

      // Should have 6 add calls
      assert.equal(addCalls.length, 6);

      // Verify paths - they come right after 'add'
      const paths = addCalls.map(c => {
        const addIndex = c.args.indexOf('add');
        return c.args[addIndex + 1];
      });

      assert.ok(paths.includes('/workspace'));
      assert.ok(paths.includes('/workspace/.arete/memory/items'));
      assert.ok(paths.includes('/workspace/resources/meetings'));
      assert.ok(paths.includes('/workspace/context'));
      assert.ok(paths.includes('/workspace/projects'));
      assert.ok(paths.includes('/workspace/people'));
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });

  it('uses arete-<hash>-<scope> naming format', async () => {
    const calls: Array<{ file: string; args: string[]; cwd: string }> = [];
    const existingPaths = new Set(['/workspace', '/workspace/context']);
    const deps = makeCollectionsDeps({ calls, existingPaths });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      const result = await ensureQmdCollections('/workspace', undefined, deps);

      // Check naming format
      const allName = result.collections.all;
      const contextName = result.collections.context;

      assert.ok(allName);
      assert.ok(contextName);
      assert.match(allName, /^arete-[a-f0-9]{4}-all$/);
      assert.match(contextName, /^arete-[a-f0-9]{4}-context$/);

      // Same hash for both
      const allHash = allName.split('-')[1];
      const contextHash = contextName.split('-')[1];
      assert.equal(allHash, contextHash);
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });

  it('reuses existing collection names from config', async () => {
    const calls: Array<{ file: string; args: string[]; cwd: string }> = [];
    const existingPaths = new Set(['/workspace', '/workspace/context']);
    const existingCollections: QmdCollections = {
      all: 'custom-all-name',
      context: 'custom-context-name',
    };
    const deps = makeCollectionsDeps({ calls, existingPaths });
    const prev = process.env.ARETE_SEARCH_FALLBACK;
    try {
      delete process.env.ARETE_SEARCH_FALLBACK;
      const result = await ensureQmdCollections('/workspace', existingCollections, deps);

      // Should use the custom names
      assert.equal(result.collections.all, 'custom-all-name');
      assert.equal(result.collections.context, 'custom-context-name');

      // Verify the names were used in qmd collection add
      const addCalls = calls.filter(
        c => c.args.includes('collection') && c.args.includes('add'),
      );
      const names = addCalls.map(c => {
        const nameIndex = c.args.indexOf('--name');
        return c.args[nameIndex + 1];
      });
      assert.ok(names.includes('custom-all-name'));
      assert.ok(names.includes('custom-context-name'));
    } finally {
      if (prev === undefined) {
        delete process.env.ARETE_SEARCH_FALLBACK;
      } else {
        process.env.ARETE_SEARCH_FALLBACK = prev;
      }
    }
  });
});
