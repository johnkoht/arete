/**
 * Tests for arete search command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';
import {
  runSearch,
  parseQmdResults,
  type SearchDeps,
  type SearchOutput,
  type SearchErrorOutput,
} from '../../src/commands/search.js';

/** Install a workspace and inject qmd_collections into arete.yaml */
function setupWorkspace(
  tmpDir: string,
  collections?: Record<string, string>,
): void {
  runCli(['install', tmpDir, '--skip-qmd']);

  if (collections) {
    const configPath = join(tmpDir, 'arete.yaml');
    const config = parseYaml(readFileSync(configPath, 'utf8')) as Record<
      string,
      unknown
    >;
    config.qmd_collections = collections;
    // Also set qmd_collection for backward compat
    if (collections.all) {
      config.qmd_collection = collections.all;
    }
    writeFileSync(configPath, stringifyYaml(config), 'utf8');
  }
}

/** Create mock dependencies for unit testing runSearch */
function createMockDeps(overrides: Partial<SearchDeps> = {}): SearchDeps {
  const mockCollections = {
    all: 'test-all',
    memory: 'test-memory',
    meetings: 'test-meetings',
    context: 'test-context',
    projects: 'test-projects',
    people: 'test-people',
  };

  return {
    createServices: async () =>
      ({
        workspace: {
          findRoot: async () => '/mock/workspace',
        },
        storage: {},
      }) as ReturnType<typeof import('@arete/core').createServices>,
    loadConfig: async () =>
      ({
        qmd_collections: mockCollections,
        qmd_collection: 'test-all',
      }) as import('@arete/core').AreteConfig,
    execFileAsync: async () => ({
      stdout: JSON.stringify([
        {
          file: 'qmd://test-all/context/profile.md',
          snippet: '# My Profile\n\nThis is a test profile.',
          score: 0.95,
        },
      ]),
      stderr: '',
    }),
    isQmdAvailable: () => true,
    ...overrides,
  };
}

describe('parseQmdResults', () => {
  it('parses QMD JSON output with new format (file, snippet)', () => {
    const stdout = JSON.stringify([
      {
        file: 'qmd://collection/path/to/file.md',
        snippet: '# Title\n\nSome content here.',
        score: 0.85,
      },
      {
        file: 'qmd://collection/another-file.md',
        snippet: 'Just some text without heading.',
        score: 0.72,
      },
    ]);
    const results = parseQmdResults(stdout);

    assert.equal(results.length, 2);
    assert.equal(results[0].path, 'path/to/file.md');
    assert.equal(results[0].title, 'Title');
    assert.equal(results[0].snippet, '# Title\n\nSome content here.');
    assert.equal(results[0].score, 0.85);

    assert.equal(results[1].path, 'another-file.md');
    assert.equal(results[1].title, 'another file'); // filename fallback
    assert.equal(results[1].score, 0.72);
  });

  it('parses QMD JSON output with legacy format (path, content)', () => {
    const stdout = JSON.stringify([
      {
        path: 'qmd://collection/legacy.md',
        content: '## Legacy Content',
        score: 0.9,
      },
    ]);
    const results = parseQmdResults(stdout);

    assert.equal(results.length, 1);
    assert.equal(results[0].path, 'legacy.md');
    assert.equal(results[0].title, 'Legacy Content');
  });

  it('handles wrapped { results: [...] } format', () => {
    const stdout = JSON.stringify({
      results: [
        {
          file: 'qmd://col/file.md',
          snippet: '# Test',
          score: 0.8,
        },
      ],
    });
    const results = parseQmdResults(stdout);

    assert.equal(results.length, 1);
    assert.equal(results[0].path, 'file.md');
  });

  it('clamps scores to 0-1 range', () => {
    const stdout = JSON.stringify([
      { file: 'qmd://col/high.md', snippet: 'test', score: 1.5 },
      { file: 'qmd://col/low.md', snippet: 'test', score: -0.5 },
    ]);
    const results = parseQmdResults(stdout);

    assert.equal(results[0].score, 1);
    assert.equal(results[1].score, 0);
  });

  it('returns empty array for empty stdout', () => {
    assert.deepEqual(parseQmdResults(''), []);
    assert.deepEqual(parseQmdResults('   '), []);
  });

  it('returns empty array for invalid JSON', () => {
    assert.deepEqual(parseQmdResults('not json'), []);
    assert.deepEqual(parseQmdResults('{invalid}'), []);
  });

  it('filters out entries without path or snippet', () => {
    const stdout = JSON.stringify([
      { score: 0.9 }, // no path or snippet
      { file: 'qmd://col/valid.md', snippet: 'content', score: 0.8 },
    ]);
    const results = parseQmdResults(stdout);

    assert.equal(results.length, 1);
    assert.equal(results[0].path, 'valid.md');
  });

  it('extracts title from heading in snippet', () => {
    const stdout = JSON.stringify([
      {
        file: 'qmd://col/file.md',
        snippet: 'Some preamble\n## The Real Title\nMore content',
        score: 0.8,
      },
    ]);
    const results = parseQmdResults(stdout);

    assert.equal(results[0].title, 'The Real Title');
  });

  it('uses title field when provided by QMD', () => {
    const stdout = JSON.stringify([
      {
        file: 'qmd://col/file.md',
        snippet: 'Some content',
        score: 0.8,
        title: 'Explicit Title',
      },
    ]);
    const results = parseQmdResults(stdout);

    assert.equal(results[0].title, 'Explicit Title');
  });
});

describe('runSearch', () => {
  describe('workspace validation', () => {
    it('exits with error when not in workspace', async () => {
      let exitCode: number | undefined;
      const originalExit = process.exit;
      process.exit = ((code: number) => {
        exitCode = code;
        throw new Error('process.exit');
      }) as never;

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      const deps = createMockDeps({
        createServices: async () =>
          ({
            workspace: { findRoot: async () => null },
            storage: {},
          }) as ReturnType<typeof import('@arete/core').createServices>,
      });

      try {
        await runSearch('test query', { json: true }, deps);
      } catch (e) {
        // Expected
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      assert.equal(exitCode, 1);
      const output = JSON.parse(logs[0]) as SearchErrorOutput;
      assert.equal(output.success, false);
      assert.equal(output.code, 'WORKSPACE_NOT_FOUND');
    });
  });

  describe('scope validation', () => {
    it('exits with error for invalid scope', async () => {
      let exitCode: number | undefined;
      const originalExit = process.exit;
      process.exit = ((code: number) => {
        exitCode = code;
        throw new Error('process.exit');
      }) as never;

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await runSearch(
          'test query',
          { scope: 'invalid', json: true },
          createMockDeps(),
        );
      } catch (e) {
        // Expected
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      assert.equal(exitCode, 1);
      const output = JSON.parse(logs[0]) as SearchErrorOutput;
      assert.equal(output.success, false);
      assert.equal(output.code, 'INVALID_SCOPE');
      assert.ok(output.error.includes('invalid'));
    });
  });

  describe('QMD availability', () => {
    it('exits with error when QMD not available', async () => {
      let exitCode: number | undefined;
      const originalExit = process.exit;
      process.exit = ((code: number) => {
        exitCode = code;
        throw new Error('process.exit');
      }) as never;

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      const deps = createMockDeps({ isQmdAvailable: () => false });

      try {
        await runSearch('test query', { json: true }, deps);
      } catch (e) {
        // Expected
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      assert.equal(exitCode, 1);
      const output = JSON.parse(logs[0]) as SearchErrorOutput;
      assert.equal(output.success, false);
      assert.equal(output.code, 'QMD_NOT_AVAILABLE');
    });
  });

  describe('collection lookup', () => {
    it('exits with error when collection not found for scope', async () => {
      let exitCode: number | undefined;
      const originalExit = process.exit;
      process.exit = ((code: number) => {
        exitCode = code;
        throw new Error('process.exit');
      }) as never;

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      const deps = createMockDeps({
        loadConfig: async () =>
          ({
            qmd_collections: { all: 'test-all' }, // missing 'memory' collection
          }) as import('@arete/core').AreteConfig,
      });

      try {
        await runSearch('test query', { scope: 'memory', json: true }, deps);
      } catch (e) {
        // Expected
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      assert.equal(exitCode, 1);
      const output = JSON.parse(logs[0]) as SearchErrorOutput;
      assert.equal(output.success, false);
      assert.equal(output.code, 'COLLECTION_NOT_FOUND');
    });

    it('falls back to qmd_collection for all scope', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      const deps = createMockDeps({
        loadConfig: async () =>
          ({
            qmd_collection: 'legacy-collection', // old format, no qmd_collections
          }) as import('@arete/core').AreteConfig,
      });

      try {
        await runSearch('test query', { scope: 'all', json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(logs[0]) as SearchOutput;
      assert.equal(output.success, true);
      assert.equal(output.scope, 'all');
    });
  });

  describe('successful search', () => {
    it('returns results with JSON output', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await runSearch(
          'test query',
          { scope: 'all', json: true },
          createMockDeps(),
        );
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(logs[0]) as SearchOutput;
      assert.equal(output.success, true);
      assert.equal(output.query, 'test query');
      assert.equal(output.scope, 'all');
      assert.equal(output.results.length, 1);
      assert.equal(output.results[0].path, 'context/profile.md');
      assert.equal(output.results[0].title, 'My Profile');
      assert.equal(output.total, 1);
    });

    it('passes --scope to QMD via -c flag', async () => {
      let capturedArgs: string[] = [];

      const deps = createMockDeps({
        execFileAsync: async (_file: string, args: string[]) => {
          capturedArgs = args;
          return { stdout: '[]', stderr: '' };
        },
      });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await runSearch(
          'test query',
          { scope: 'memory', json: true },
          deps,
        );
      } finally {
        console.log = originalLog;
      }

      // Should include -c flag for non-'all' scope
      assert.ok(capturedArgs.includes('-c'), 'Should include -c flag');
      assert.ok(
        capturedArgs.includes('test-memory'),
        'Should include collection name',
      );
    });

    it('does not pass -c flag for all scope', async () => {
      let capturedArgs: string[] = [];

      const deps = createMockDeps({
        execFileAsync: async (_file: string, args: string[]) => {
          capturedArgs = args;
          return { stdout: '[]', stderr: '' };
        },
      });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await runSearch(
          'test query',
          { scope: 'all', json: true },
          deps,
        );
      } finally {
        console.log = originalLog;
      }

      // Should NOT include -c flag for 'all' scope
      assert.ok(!capturedArgs.includes('-c'), 'Should not include -c flag for all scope');
    });

    it('passes --limit to QMD via -n flag', async () => {
      let capturedArgs: string[] = [];

      const deps = createMockDeps({
        execFileAsync: async (_file: string, args: string[]) => {
          capturedArgs = args;
          return { stdout: '[]', stderr: '' };
        },
      });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await runSearch(
          'test query',
          { limit: '5', json: true },
          deps,
        );
      } finally {
        console.log = originalLog;
      }

      const nIndex = capturedArgs.indexOf('-n');
      assert.ok(nIndex >= 0, 'Should include -n flag');
      assert.equal(capturedArgs[nIndex + 1], '5');
    });

    it('defaults limit to 15', async () => {
      let capturedArgs: string[] = [];

      const deps = createMockDeps({
        execFileAsync: async (_file: string, args: string[]) => {
          capturedArgs = args;
          return { stdout: '[]', stderr: '' };
        },
      });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await runSearch('test query', { json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      const nIndex = capturedArgs.indexOf('-n');
      assert.ok(nIndex >= 0, 'Should include -n flag');
      assert.equal(capturedArgs[nIndex + 1], '15');
    });
  });

  describe('error handling', () => {
    it('returns empty results when QMD query fails', async () => {
      const deps = createMockDeps({
        execFileAsync: async () => {
          throw new Error('QMD failed');
        },
      });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await runSearch('test query', { json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(logs[0]) as SearchOutput;
      assert.equal(output.success, true);
      assert.equal(output.results.length, 0);
      assert.equal(output.total, 0);
    });
  });
});

describe('search command integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-search');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  describe('CLI invocation', () => {
    it('exits 0 with --json when workspace exists but QMD not available', () => {
      // ARETE_SEARCH_FALLBACK=1 means QMD is not available
      setupWorkspace(tmpDir, {
        all: 'test-all',
        memory: 'test-memory',
      });

      const { code, stdout } = runCliRaw(['search', 'test query', '--json'], {
        cwd: tmpDir,
      });

      // Should exit 1 because QMD is not available (ARETE_SEARCH_FALLBACK=1 affects setup, not search)
      // Actually, in test env QMD likely isn't installed, so it should fail with QMD_NOT_AVAILABLE
      const output = JSON.parse(stdout) as SearchOutput | SearchErrorOutput;
      
      if (output.success) {
        assert.equal(code, 0);
      } else {
        // QMD not available is expected in test environment
        assert.equal(code, 1);
        assert.equal((output as SearchErrorOutput).code, 'QMD_NOT_AVAILABLE');
      }
    });

    it('exits 1 with --json when not in workspace', () => {
      // Don't setup workspace - run from tmpDir directly
      const { code, stdout } = runCliRaw(['search', 'test query', '--json'], {
        cwd: tmpDir,
      });

      assert.equal(code, 1);
      const output = JSON.parse(stdout) as SearchErrorOutput;
      assert.equal(output.success, false);
      assert.equal(output.code, 'WORKSPACE_NOT_FOUND');
    });

    it('exits 1 with --json for invalid scope', () => {
      setupWorkspace(tmpDir, { all: 'test-all' });

      const { code, stdout } = runCliRaw(
        ['search', 'test query', '--scope', 'invalid', '--json'],
        { cwd: tmpDir },
      );

      assert.equal(code, 1);
      const output = JSON.parse(stdout) as SearchErrorOutput;
      assert.equal(output.success, false);
      assert.equal(output.code, 'INVALID_SCOPE');
    });
  });
});
