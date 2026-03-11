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
  deriveIntent,
  type SearchDeps,
  type SearchOutput,
  type SearchErrorOutput,
  type PersonResolution,
  type TimelineOutput,
  type AnswerOutput,
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

  const mockPaths = {
    root: '/mock/workspace',
    context: '/mock/workspace/context',
    goals: '/mock/workspace/goals',
    projects: '/mock/workspace/projects',
    resources: '/mock/workspace/resources',
    people: '/mock/workspace/people',
    memory: '/mock/workspace/.arete/memory',
    arete: '/mock/workspace/.arete',
    tools: '/mock/workspace/.arete/tools',
  };

  return {
    createServices: async () =>
      ({
        workspace: {
          findRoot: async () => '/mock/workspace',
          getPaths: () => mockPaths,
        },
        storage: {},
        entity: {
          resolveAll: async () => [],
        },
      }) as unknown as Awaited<ReturnType<typeof import('@arete/core').createServices>>,
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

  it('handles NaN score gracefully', () => {
    // NaN becomes null in JSON, which is not a number, so defaults to 1
    const stdout = JSON.stringify([
      { file: 'qmd://col/test.md', snippet: 'test content', score: NaN },
    ]);
    const results = parseQmdResults(stdout);

    assert.equal(results.length, 1);
    assert.equal(results[0].score, 1); // Defaults to 1 when not a valid number
  });

  it('handles string score gracefully', () => {
    // String score is not a number type, so defaults to 1
    const stdout = JSON.stringify([
      { file: 'qmd://col/test.md', snippet: 'test content', score: 'high' },
    ]);
    const results = parseQmdResults(stdout);

    assert.equal(results.length, 1);
    assert.equal(results[0].score, 1); // Defaults to 1 when not a number
  });

  it('handles Infinity score gracefully', () => {
    // Infinity becomes null in JSON, which is not a number, so defaults to 1
    const stdout = JSON.stringify([
      { file: 'qmd://col/test.md', snippet: 'test content', score: Infinity },
    ]);
    const results = parseQmdResults(stdout);

    assert.equal(results.length, 1);
    assert.equal(results[0].score, 1); // Defaults to 1 when not a valid number
  });

  it('handles null score gracefully', () => {
    const stdout = JSON.stringify([
      { file: 'qmd://col/test.md', snippet: 'test content', score: null },
    ]);
    const results = parseQmdResults(stdout);

    assert.equal(results.length, 1);
    assert.equal(results[0].score, 1); // Defaults to 1 when null
  });

  it('handles undefined score gracefully', () => {
    const stdout = JSON.stringify([
      { file: 'qmd://col/test.md', snippet: 'test content' },
    ]);
    const results = parseQmdResults(stdout);

    assert.equal(results.length, 1);
    assert.equal(results[0].score, 1); // Defaults to 1 when undefined
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
          }) as unknown as Awaited<ReturnType<typeof import('@arete/core').createServices>>,
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

  describe('person filtering', () => {
    it('filters results by resolved person name', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      const deps = createMockDeps({
        execFileAsync: async () => ({
          stdout: JSON.stringify([
            {
              file: 'qmd://test-all/resources/meetings/2024-01-15-meeting.md',
              snippet: '# Team Meeting\n\nAttendees: Jane Doe, Bob Smith\n\nDiscussion about project.',
              score: 0.95,
            },
            {
              file: 'qmd://test-all/resources/meetings/2024-01-10-standup.md',
              snippet: '# Standup\n\nJust Bob Smith today.',
              score: 0.85,
            },
          ]),
          stderr: '',
        }),
        resolvePerson: async (): Promise<PersonResolution> => ({
          type: 'single',
          match: {
            type: 'person',
            name: 'Jane Doe',
            slug: 'jane-doe',
            path: '/mock/workspace/people/internal/jane-doe.md',
            metadata: { category: 'internal' },
            score: 100,
          },
        }),
      });

      try {
        await runSearch('test query', { person: 'jane', json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(logs[0]) as SearchOutput;
      assert.equal(output.success, true);
      // Only the first result should remain (mentions Jane Doe)
      assert.equal(output.results.length, 1);
      assert.ok(output.results[0].snippet.includes('Jane Doe'));
    });

    it('filters results by person slug in path', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      const deps = createMockDeps({
        execFileAsync: async () => ({
          stdout: JSON.stringify([
            {
              file: 'qmd://test-all/people/internal/jane-doe.md',
              snippet: '# Jane Doe\n\nProfile content.',
              score: 0.95,
            },
            {
              file: 'qmd://test-all/people/internal/bob-smith.md',
              snippet: '# Bob Smith\n\nAnother profile.',
              score: 0.85,
            },
          ]),
          stderr: '',
        }),
        resolvePerson: async (): Promise<PersonResolution> => ({
          type: 'single',
          match: {
            type: 'person',
            name: 'Jane Doe',
            slug: 'jane-doe',
            path: '/mock/workspace/people/internal/jane-doe.md',
            metadata: { category: 'internal' },
            score: 100,
          },
        }),
      });

      try {
        await runSearch('test query', { person: 'jane-doe', json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(logs[0]) as SearchOutput;
      assert.equal(output.success, true);
      assert.equal(output.results.length, 1);
      assert.ok(output.results[0].path.includes('jane-doe'));
    });

    it('exits with PERSON_NOT_FOUND for unknown person', async () => {
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
        resolvePerson: async (): Promise<PersonResolution> => ({
          type: 'none',
        }),
      });

      try {
        await runSearch('test query', { person: 'unknown', json: true }, deps);
      } catch (e) {
        // Expected
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      assert.equal(exitCode, 1);
      const output = JSON.parse(logs[0]) as SearchErrorOutput;
      assert.equal(output.success, false);
      assert.equal(output.code, 'PERSON_NOT_FOUND');
      assert.ok(output.error.includes('unknown'));
    });

    it('exits with PERSON_AMBIGUOUS for ambiguous name with options', async () => {
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
        resolvePerson: async (): Promise<PersonResolution> => ({
          type: 'multiple',
          matches: [
            {
              type: 'person',
              name: 'John Smith',
              slug: 'john-smith',
              path: '/mock/workspace/people/internal/john-smith.md',
              metadata: { category: 'internal' },
              score: 70,
            },
            {
              type: 'person',
              name: 'John Doe',
              slug: 'john-doe',
              path: '/mock/workspace/people/customers/john-doe.md',
              metadata: { category: 'customers' },
              score: 65,
            },
          ],
        }),
      });

      try {
        await runSearch('test query', { person: 'john', json: true }, deps);
      } catch (e) {
        // Expected
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      assert.equal(exitCode, 1);
      const output = JSON.parse(logs[0]) as SearchErrorOutput;
      assert.equal(output.success, false);
      assert.equal(output.code, 'PERSON_AMBIGUOUS');
      assert.ok(output.error.includes('john'));
      // Should include options for disambiguation
      assert.ok(output.options);
      assert.equal(output.options?.length, 2);
      assert.equal(output.options?.[0].name, 'John Smith');
      assert.equal(output.options?.[0].slug, 'john-smith');
      assert.equal(output.options?.[0].category, 'internal');
      assert.equal(output.options?.[1].name, 'John Doe');
      assert.equal(output.options?.[1].slug, 'john-doe');
      assert.equal(output.options?.[1].category, 'customers');
    });

    it('is case-insensitive for person name matching', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      const deps = createMockDeps({
        execFileAsync: async () => ({
          stdout: JSON.stringify([
            {
              file: 'qmd://test-all/resources/meetings/meeting.md',
              snippet: '# Meeting\n\nJANE DOE presented the roadmap.',
              score: 0.95,
            },
          ]),
          stderr: '',
        }),
        resolvePerson: async (): Promise<PersonResolution> => ({
          type: 'single',
          match: {
            type: 'person',
            name: 'Jane Doe',
            slug: 'jane-doe',
            path: '/mock/workspace/people/internal/jane-doe.md',
            metadata: { category: 'internal' },
            score: 100,
          },
        }),
      });

      try {
        await runSearch('test query', { person: 'JANE', json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(logs[0]) as SearchOutput;
      assert.equal(output.success, true);
      // Should match despite case difference
      assert.equal(output.results.length, 1);
    });

    it('combines --person with --scope filter', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      let capturedArgs: string[] = [];

      const deps = createMockDeps({
        execFileAsync: async (_file: string, args: string[]) => {
          capturedArgs = args;
          return {
            stdout: JSON.stringify([
              {
                file: 'qmd://test-meetings/resources/meetings/team-sync.md',
                snippet: '# Team Sync\n\nJane Doe shared updates.',
                score: 0.95,
              },
            ]),
            stderr: '',
          };
        },
        resolvePerson: async (): Promise<PersonResolution> => ({
          type: 'single',
          match: {
            type: 'person',
            name: 'Jane Doe',
            slug: 'jane-doe',
            path: '/mock/workspace/people/internal/jane-doe.md',
            metadata: { category: 'internal' },
            score: 100,
          },
        }),
      });

      try {
        await runSearch('test query', { person: 'jane', scope: 'meetings', json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      // Should pass scope to QMD
      assert.ok(capturedArgs.includes('-c'));
      assert.ok(capturedArgs.includes('test-meetings'));

      const output = JSON.parse(logs[0]) as SearchOutput;
      assert.equal(output.success, true);
      assert.equal(output.scope, 'meetings');
      assert.equal(output.results.length, 1);
    });
  });

  describe('timeline mode', () => {
    /** Create mock timeline data */
    function createMockTimeline() {
      return {
        query: 'test query',
        items: [
          {
            type: 'decisions' as const,
            title: 'Decision about API',
            content: 'We decided to use REST for the API.',
            date: '2024-01-15',
            source: 'decisions.md',
            relevanceScore: 0.9,
          },
          {
            type: 'meeting' as const,
            title: 'Team Planning Meeting',
            content: 'Discussed Q1 roadmap.',
            date: '2024-01-10',
            source: '2024-01-10-team-planning.md',
            relevanceScore: 0.85,
          },
          {
            type: 'learnings' as const,
            title: 'Learning about caching',
            content: 'Caching improved performance by 50%.',
            date: '2024-01-05',
            source: 'learnings.md',
            relevanceScore: 0.8,
          },
        ],
        themes: ['API design', 'Performance'],
        dateRange: { start: '2024-01-05', end: '2024-01-15' },
      };
    }

    it('returns timeline output with --timeline flag', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      const deps = createMockDeps({
        getTimeline: async () => createMockTimeline(),
      });

      try {
        await runSearch('test query', { timeline: true, json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(logs[0]);
      assert.equal(output.success, true);
      assert.equal(output.query, 'test query');
      assert.equal(output.scope, 'all');
      assert.equal(output.items.length, 3);
      assert.deepEqual(output.themes, ['API design', 'Performance']);
      assert.ok(output.dateRange);
      assert.equal(output.dateRange.start, '2024-01-05');
      assert.equal(output.dateRange.end, '2024-01-15');
    });

    it('timeline items have correct schema', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      const deps = createMockDeps({
        getTimeline: async () => createMockTimeline(),
      });

      try {
        await runSearch('test query', { timeline: true, json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(logs[0]);
      const firstItem = output.items[0];
      
      // Check required fields exist
      assert.ok('date' in firstItem);
      assert.ok('title' in firstItem);
      assert.ok('source' in firstItem);
      assert.ok('type' in firstItem);
      
      // Check values
      assert.equal(firstItem.date, '2024-01-15');
      assert.equal(firstItem.title, 'Decision about API');
      assert.equal(firstItem.source, 'decisions.md');
      assert.equal(firstItem.type, 'decisions');
    });

    it('filters timeline by --days', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      let capturedRange: { start?: string; end?: string } | undefined;

      const deps = createMockDeps({
        getTimeline: async (_query, _paths, range) => {
          capturedRange = range;
          return createMockTimeline();
        },
      });

      try {
        await runSearch('test query', { timeline: true, days: '30', json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      // Should have computed a date range
      assert.ok(capturedRange, 'Date range should be passed');
      assert.ok(capturedRange.start, 'Start date should be set');
      assert.ok(capturedRange.end, 'End date should be set');
      
      // End date should be today
      const today = new Date().toISOString().slice(0, 10);
      assert.equal(capturedRange.end, today);
      
      // Start date should be approximately 30 days ago
      const startDate = new Date(capturedRange.start);
      const endDate = new Date(capturedRange.end);
      const daysDiff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      assert.equal(daysDiff, 30);
    });

    it('filters timeline by --scope memory', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      const deps = createMockDeps({
        getTimeline: async () => createMockTimeline(),
      });

      try {
        await runSearch('test query', { timeline: true, scope: 'memory', json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(logs[0]);
      assert.equal(output.success, true);
      assert.equal(output.scope, 'memory');
      // Should exclude meeting items
      assert.equal(output.items.length, 2);
      for (const item of output.items) {
        assert.notEqual(item.type, 'meeting');
      }
    });

    it('filters timeline by --scope meetings', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      const deps = createMockDeps({
        getTimeline: async () => createMockTimeline(),
      });

      try {
        await runSearch('test query', { timeline: true, scope: 'meetings', json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(logs[0]);
      assert.equal(output.success, true);
      assert.equal(output.scope, 'meetings');
      // Should only include meeting items
      assert.equal(output.items.length, 1);
      assert.equal(output.items[0].type, 'meeting');
    });

    it('filters timeline by --person', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      const mockTimeline = {
        query: 'test query',
        items: [
          {
            type: 'meeting' as const,
            title: 'Meeting with Jane Doe',
            content: 'Jane presented the roadmap.',
            date: '2024-01-15',
            source: '2024-01-15-meeting.md',
            relevanceScore: 0.9,
          },
          {
            type: 'meeting' as const,
            title: 'Team Standup',
            content: 'Bob shared updates.',
            date: '2024-01-10',
            source: '2024-01-10-standup.md',
            relevanceScore: 0.85,
          },
        ],
        themes: ['Roadmap'],
        dateRange: { start: '2024-01-10', end: '2024-01-15' },
      };

      const deps = createMockDeps({
        getTimeline: async () => mockTimeline,
        resolvePerson: async (): Promise<PersonResolution> => ({
          type: 'single',
          match: {
            type: 'person',
            name: 'Jane Doe',
            slug: 'jane-doe',
            path: '/mock/workspace/people/internal/jane-doe.md',
            metadata: { category: 'internal' },
            score: 100,
          },
        }),
      });

      try {
        await runSearch('test query', { timeline: true, person: 'jane', json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(logs[0]);
      assert.equal(output.success, true);
      // Should only include items mentioning Jane
      assert.equal(output.items.length, 1);
      assert.ok(output.items[0].title.includes('Jane'));
    });

    it('returns empty items array when no timeline matches', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      const deps = createMockDeps({
        getTimeline: async () => ({
          query: 'test query',
          items: [],
          themes: [],
          dateRange: { start: undefined, end: undefined },
        }),
      });

      try {
        await runSearch('test query', { timeline: true, json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(logs[0]);
      assert.equal(output.success, true);
      assert.equal(output.items.length, 0);
      assert.deepEqual(output.themes, []);
    });

    it('combines --scope and --days filters', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      let capturedRange: { start?: string; end?: string } | undefined;

      const deps = createMockDeps({
        getTimeline: async (_query, _paths, range) => {
          capturedRange = range;
          return createMockTimeline();
        },
      });

      try {
        await runSearch('test query', { timeline: true, scope: 'memory', days: '7', json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(logs[0]);
      assert.equal(output.success, true);
      assert.equal(output.scope, 'memory');
      
      // Should have date range
      assert.ok(capturedRange, 'Date range should be passed');
      
      // Should exclude meetings (scope filter)
      for (const item of output.items) {
        assert.notEqual(item.type, 'meeting');
      }
    });
  });
});

describe('deriveIntent', () => {
  it('derives "past decisions and rationale" for "what did we decide" queries', () => {
    assert.equal(deriveIntent('what did we decide about the API?'), 'past decisions and rationale');
    assert.equal(deriveIntent('What did we decide on pricing?'), 'past decisions and rationale');
  });

  it('derives "finding people or contacts" for "who should I talk to" queries', () => {
    assert.equal(deriveIntent('who should I talk to about billing?'), 'finding people or contacts');
    assert.equal(deriveIntent('Who should I talk to for support?'), 'finding people or contacts');
  });

  it('derives "historical context and reasoning" for "why did we" queries', () => {
    assert.equal(deriveIntent('why did we choose TypeScript?'), 'historical context and reasoning');
    assert.equal(deriveIntent('Why did we drop feature X?'), 'historical context and reasoning');
  });

  it('derives "timeline and dates of events" for "when did we" queries', () => {
    assert.equal(deriveIntent('when did we launch the product?'), 'timeline and dates of events');
    assert.equal(deriveIntent('When did we start the project?'), 'timeline and dates of events');
  });

  it('derives "definitions and explanations" for "what is/are" queries', () => {
    assert.equal(deriveIntent('what is our pricing model?'), 'definitions and explanations');
    assert.equal(deriveIntent('What are the main features?'), 'definitions and explanations');
  });

  it('derives "processes and procedures" for "how do we" queries', () => {
    assert.equal(deriveIntent('how do we deploy to production?'), 'processes and procedures');
    assert.equal(deriveIntent('How do we onboard new customers?'), 'processes and procedures');
  });

  it('returns undefined for queries without matching patterns', () => {
    assert.equal(deriveIntent('search for meetings'), undefined);
    assert.equal(deriveIntent('find documents about API'), undefined);
    assert.equal(deriveIntent('show me recent decisions'), undefined);
  });
});

describe('runSearch --answer mode', () => {
  describe('mutual exclusivity', () => {
    it('exits with error when both --timeline and --answer are specified', async () => {
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
        await runSearch('test query', { timeline: true, answer: true, json: true }, createMockDeps());
      } catch (e) {
        // Expected
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      assert.equal(exitCode, 1);
      const output = JSON.parse(logs[0]) as SearchErrorOutput;
      assert.equal(output.success, false);
      assert.equal(output.code, 'INVALID_FLAGS');
      assert.ok(output.error.includes('mutually exclusive'));
    });
  });

  describe('AI configuration check', () => {
    it('warns when AI not configured but still returns results', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      const deps = createMockDeps({
        ai: {
          isConfigured: () => false,
          call: async () => ({ text: 'Should not be called' }),
        },
      });

      try {
        await runSearch('test query', { answer: true, json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(logs[0]);
      assert.equal(output.success, true);
      assert.equal(output.answer, null);
      assert.ok(output.error.includes('AI not configured'));
      // Should still have results
      assert.ok(Array.isArray(output.results));
    });
  });

  describe('intent derivation', () => {
    it('passes --intent to QMD when intent is derived', async () => {
      let capturedArgs: string[] = [];

      const deps = createMockDeps({
        execFileAsync: async (_file: string, args: string[]) => {
          capturedArgs = args;
          return { stdout: '[]', stderr: '' };
        },
        ai: {
          isConfigured: () => true,
          call: async () => ({ text: 'Synthesized answer' }),
        },
      });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await runSearch('what did we decide about the API?', { answer: true, json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      // Should include --intent flag
      const intentIndex = capturedArgs.indexOf('--intent');
      assert.ok(intentIndex >= 0, 'Should include --intent flag');
      assert.equal(capturedArgs[intentIndex + 1], 'past decisions and rationale');

      // Should include intent in output
      const output = JSON.parse(logs[0]);
      assert.equal(output.intent, 'past decisions and rationale');
    });

    it('does not pass --intent to QMD when no pattern matches', async () => {
      let capturedArgs: string[] = [];

      const deps = createMockDeps({
        execFileAsync: async (_file: string, args: string[]) => {
          capturedArgs = args;
          return { stdout: '[]', stderr: '' };
        },
        ai: {
          isConfigured: () => true,
          call: async () => ({ text: 'Synthesized answer' }),
        },
      });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await runSearch('find documents about API', { answer: true, json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      // Should NOT include --intent flag
      assert.ok(!capturedArgs.includes('--intent'), 'Should not include --intent flag');

      // Should not include intent in output
      const output = JSON.parse(logs[0]);
      assert.equal(output.intent, undefined);
    });
  });

  describe('successful synthesis', () => {
    it('returns synthesized answer with results', async () => {
      let capturedPrompt: string | undefined;

      const deps = createMockDeps({
        execFileAsync: async () => ({
          stdout: JSON.stringify([
            {
              file: 'qmd://test-all/context/api-design.md',
              snippet: '# API Design\n\nWe use REST for the main API.',
              score: 0.95,
            },
          ]),
          stderr: '',
        }),
        ai: {
          isConfigured: () => true,
          call: async (_task: string, prompt: string) => {
            capturedPrompt = prompt;
            return { text: 'Based on the search results, we use REST for the main API.' };
          },
        },
      });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await runSearch('what is our API design?', { answer: true, json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(logs[0]);
      assert.equal(output.success, true);
      assert.equal(output.answer, 'Based on the search results, we use REST for the main API.');
      assert.equal(output.results.length, 1);
      assert.equal(output.error, undefined);

      // Prompt should include the query and results
      assert.ok(capturedPrompt?.includes('what is our API design?'));
      assert.ok(capturedPrompt?.includes('API Design'));
    });

    it('returns null answer when no results', async () => {
      const deps = createMockDeps({
        execFileAsync: async () => ({
          stdout: '[]',
          stderr: '',
        }),
        ai: {
          isConfigured: () => true,
          call: async () => {
            throw new Error('Should not be called with no results');
          },
        },
      });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await runSearch('nonexistent topic', { answer: true, json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(logs[0]);
      assert.equal(output.success, true);
      assert.equal(output.answer, null);
      assert.equal(output.results.length, 0);
    });
  });

  describe('AI error handling', () => {
    it('handles AI synthesis failure gracefully', async () => {
      const deps = createMockDeps({
        execFileAsync: async () => ({
          stdout: JSON.stringify([
            {
              file: 'qmd://test-all/context/docs.md',
              snippet: '# Documentation\n\nSome content.',
              score: 0.9,
            },
          ]),
          stderr: '',
        }),
        ai: {
          isConfigured: () => true,
          call: async () => {
            throw new Error('API rate limit exceeded');
          },
        },
      });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await runSearch('test query', { answer: true, json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(logs[0]);
      assert.equal(output.success, true);
      assert.equal(output.answer, null);
      assert.equal(output.error, 'API rate limit exceeded');
      // Should still have results
      assert.equal(output.results.length, 1);
    });
  });

  describe('scope and person filters', () => {
    it('combines --answer with --scope filter', async () => {
      let capturedArgs: string[] = [];

      const deps = createMockDeps({
        execFileAsync: async (_file: string, args: string[]) => {
          capturedArgs = args;
          return {
            stdout: JSON.stringify([
              {
                file: 'qmd://test-memory/memory/decisions.md',
                snippet: '# Decisions\n\nWe decided to use GraphQL.',
                score: 0.9,
              },
            ]),
            stderr: '',
          };
        },
        ai: {
          isConfigured: () => true,
          call: async () => ({ text: 'We decided to use GraphQL.' }),
        },
      });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await runSearch('what did we decide?', { answer: true, scope: 'memory', json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      // Should pass scope to QMD
      assert.ok(capturedArgs.includes('-c'));
      assert.ok(capturedArgs.includes('test-memory'));

      const output = JSON.parse(logs[0]);
      assert.equal(output.success, true);
      assert.equal(output.scope, 'memory');
      assert.ok(output.answer);
    });

    it('combines --answer with --person filter', async () => {
      const deps = createMockDeps({
        execFileAsync: async () => ({
          stdout: JSON.stringify([
            {
              file: 'qmd://test-all/meetings/with-jane.md',
              snippet: '# Meeting with Jane Doe\n\nJane shared the roadmap.',
              score: 0.95,
            },
            {
              file: 'qmd://test-all/meetings/team-sync.md',
              snippet: '# Team Sync\n\nBob presented updates.',
              score: 0.85,
            },
          ]),
          stderr: '',
        }),
        resolvePerson: async (): Promise<PersonResolution> => ({
          type: 'single',
          match: {
            type: 'person',
            name: 'Jane Doe',
            slug: 'jane-doe',
            path: '/mock/workspace/people/internal/jane-doe.md',
            metadata: { category: 'internal' },
            score: 100,
          },
        }),
        ai: {
          isConfigured: () => true,
          call: async () => ({ text: 'Jane shared the roadmap in the meeting.' }),
        },
      });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await runSearch('meetings', { answer: true, person: 'jane', json: true }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(logs[0]);
      assert.equal(output.success, true);
      // Person filter should be applied before synthesis
      assert.equal(output.results.length, 1);
      assert.ok(output.results[0].snippet.includes('Jane'));
      assert.ok(output.answer);
    });
  });
});

describe('human-readable output', () => {
  describe('standard search output', () => {
    it('formats search results with headers and snippets', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(' '));

      const deps = createMockDeps({
        execFileAsync: async () => ({
          stdout: JSON.stringify([
            {
              file: 'qmd://test-all/context/profile.md',
              snippet: '# My Profile\n\nThis is a detailed profile description.',
              score: 0.95,
            },
            {
              file: 'qmd://test-all/projects/roadmap.md',
              snippet: '## Q1 Roadmap\n\nKey initiatives for the quarter.',
              score: 0.82,
            },
          ]),
          stderr: '',
        }),
      });

      try {
        await runSearch('test query', { json: false }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = logs.join('\n');

      // Should include header
      assert.ok(output.includes('Search Results'), 'Should include header');
      // Should include query
      assert.ok(output.includes('test query'), 'Should include query');
      // Should include scope
      assert.ok(output.includes('all'), 'Should include scope');
      // Should include result count
      assert.ok(output.includes('2'), 'Should include result count');
      // Should include titles
      assert.ok(output.includes('My Profile'), 'Should include first title');
      assert.ok(output.includes('Q1 Roadmap'), 'Should include second title');
      // Should include paths
      assert.ok(output.includes('context/profile.md'), 'Should include first path');
      assert.ok(output.includes('projects/roadmap.md'), 'Should include second path');
      // Should include score percentages
      assert.ok(output.includes('95%'), 'Should include first score');
      assert.ok(output.includes('82%'), 'Should include second score');
      // Should include snippet preview
      assert.ok(output.includes('This is a detailed'), 'Should include snippet preview');
    });

    it('shows message when no results found', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(' '));

      const deps = createMockDeps({
        execFileAsync: async () => ({
          stdout: '[]',
          stderr: '',
        }),
      });

      try {
        await runSearch('nonexistent query', { json: false }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = logs.join('\n');
      assert.ok(output.includes('No matching results found'), 'Should show no results message');
    });
  });

  describe('timeline output', () => {
    it('formats timeline results with dates and themes', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(' '));

      const deps = createMockDeps({
        getTimeline: async () => ({
          query: 'test query',
          items: [
            {
              type: 'decisions' as const,
              title: 'API Design Decision',
              content: 'We chose REST over GraphQL.',
              date: '2024-01-15',
              source: 'decisions.md',
              relevanceScore: 0.9,
            },
            {
              type: 'meeting' as const,
              title: 'Team Planning',
              content: 'Discussed roadmap.',
              date: '2024-01-10',
              source: '2024-01-10-planning.md',
              relevanceScore: 0.85,
            },
          ],
          themes: ['API design', 'Planning'],
          dateRange: { start: '2024-01-10', end: '2024-01-15' },
        }),
      });

      try {
        await runSearch('test query', { timeline: true, json: false }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = logs.join('\n');

      // Should include header
      assert.ok(output.includes('Timeline Results'), 'Should include timeline header');
      // Should include query
      assert.ok(output.includes('test query'), 'Should include query');
      // Should include themes section
      assert.ok(output.includes('Recurring Themes'), 'Should include themes header');
      assert.ok(output.includes('API design'), 'Should include first theme');
      assert.ok(output.includes('Planning'), 'Should include second theme');
      // Should include dates as group headers
      assert.ok(output.includes('2024-01-15'), 'Should include first date');
      assert.ok(output.includes('2024-01-10'), 'Should include second date');
      // Should include item titles
      assert.ok(output.includes('API Design Decision'), 'Should include first item title');
      assert.ok(output.includes('Team Planning'), 'Should include second item title');
      // Should include type tags
      assert.ok(output.includes('[decisions]'), 'Should include decisions type tag');
      assert.ok(output.includes('[meeting]'), 'Should include meeting type tag');
    });

    it('shows message when no timeline items found', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(' '));

      const deps = createMockDeps({
        getTimeline: async () => ({
          query: 'test query',
          items: [],
          themes: [],
          dateRange: { start: '', end: '' },
        }),
      });

      try {
        await runSearch('nonexistent query', { timeline: true, json: false }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = logs.join('\n');
      assert.ok(output.includes('No timeline items found'), 'Should show no items message');
    });
  });

  describe('answer output', () => {
    it('formats answer results with synthesis and citations', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(' '));

      const deps = createMockDeps({
        execFileAsync: async () => ({
          stdout: JSON.stringify([
            {
              file: 'qmd://test-all/context/api-design.md',
              snippet: '# API Design\n\nWe use REST for the main API.',
              score: 0.95,
            },
          ]),
          stderr: '',
        }),
        ai: {
          isConfigured: () => true,
          call: async () => ({
            text: 'Based on the documents, we use REST for the main API [1].',
          }),
        },
      });

      try {
        await runSearch('what is our API design?', { answer: true, json: false }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = logs.join('\n');

      // Should include header
      assert.ok(output.includes('Search Results'), 'Should include header');
      // Should include answer section
      assert.ok(output.includes('Answer'), 'Should include answer label');
      // Should include the synthesized answer
      assert.ok(output.includes('Based on the documents'), 'Should include synthesized answer');
      assert.ok(output.includes('REST'), 'Should include answer content');
      // Should include the source results below
      assert.ok(output.includes('API Design'), 'Should include result title');
      assert.ok(output.includes('api-design.md'), 'Should include result path');
    });

    it('shows warning when AI not configured', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(' '));

      const deps = createMockDeps({
        ai: {
          isConfigured: () => false,
          call: async () => {
            throw new Error('Should not be called');
          },
        },
      });

      try {
        await runSearch('test query', { answer: true, json: false }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = logs.join('\n');
      // Should show warning about AI not configured
      assert.ok(output.includes('AI not configured'), 'Should show AI not configured warning');
      // Should still show results
      assert.ok(output.includes('Search Results'), 'Should still show results header');
    });

    it('shows warning when AI synthesis fails', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(' '));

      const deps = createMockDeps({
        execFileAsync: async () => ({
          stdout: JSON.stringify([
            {
              file: 'qmd://test-all/docs.md',
              snippet: '# Documentation\n\nContent here.',
              score: 0.9,
            },
          ]),
          stderr: '',
        }),
        ai: {
          isConfigured: () => true,
          call: async () => {
            throw new Error('Rate limit exceeded');
          },
        },
      });

      try {
        await runSearch('test query', { answer: true, json: false }, deps);
      } finally {
        console.log = originalLog;
      }

      const output = logs.join('\n');
      // Should show synthesis failure warning
      assert.ok(output.includes('AI synthesis failed'), 'Should show AI synthesis failed warning');
      assert.ok(output.includes('Rate limit'), 'Should include error details');
      // Should still show results
      assert.ok(output.includes('Documentation'), 'Should still show results');
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
