/**
 * Review fix (must-fix 1) — W7 snapshot mode label through the REAL command
 * path.
 *
 * The existing reconcile-shadow unit tests pass `extractionMode` literals
 * directly into `writeRawExtractionSnapshot`, which let the CLI call site
 * record the PROMPT mode ('light'|'normal'|'thorough') instead of the
 * pipeline shape ('legacy'|'single_pass') without any test failing. These
 * tests run `arete meeting extract` as a subprocess with a stubbed Anthropic
 * fetch (NODE_OPTIONS preload — zero network/LLM calls) and assert the
 * snapshot written by the real command records:
 *   - extractionMode: 'legacy' | 'single_pass' (from extraction_mode config)
 *   - promptMode: the prompt depth mode, recorded separately
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync } from 'node:fs';
import {
  runCli,
  runCliRaw,
  createTmpDir,
  cleanupTmpDir,
  CLI_PKG_DIR,
} from '../helpers.js';

const MOCK_FETCH_PRELOAD = join(CLI_PKG_DIR, 'test', 'fixtures', 'mock-anthropic-fetch.mjs');

const MEETING_CONTENT = `---
title: Sprint Planning
date: 2026-03-01
attendees:
  - Alice Smith
---

# Sprint Planning

## Transcript

**Alice Smith**: I'll handle the authentication module by Friday.
`;

/** Canned LLM response — parses in BOTH legacy and single_pass modes. */
const CANNED_RESPONSE = JSON.stringify({
  summary: 'Sprint planning sync.',
  action_items: [
    {
      owner: 'Alice Smith',
      owner_slug: 'alice-smith',
      description: 'Alice to handle the authentication module by Friday',
      direction: 'they_owe_me',
      confidence: 0.9,
    },
  ],
  next_steps: [],
  decisions: [],
  learnings: [],
});

describe('meeting extract — W7 raw-extraction snapshot mode labels (review must-fix 1)', () => {
  let tmpDir: string;
  let snapshotPath: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-extract-snapshot');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    mkdirSync(join(tmpDir, 'resources', 'meetings'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-03-01_sprint-planning.md'),
      MEETING_CONTENT,
      'utf8',
    );
    snapshotPath = join(tmpDir, 'dev', 'diary', 'raw-extractions', '2026-03-01-sprint-planning.json');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  function runExtract(extraYaml: string): void {
    appendFileSync(
      join(tmpDir, 'arete.yaml'),
      `ai:\n  tiers:\n    fast: anthropic/claude-haiku-4-5\nreconcile_shadow: true\n${extraYaml}`,
      'utf8',
    );
    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--skip-qmd', '--json'],
      {
        cwd: tmpDir,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: 'test-key',
          // Gate off the auxiliary LLM hooks (topics, batch review, aliases);
          // the main extraction call itself does NOT check this flag and is
          // served by the fetch stub below.
          ARETE_NO_LLM: '1',
          ARETE_TEST_LLM_RESPONSE: CANNED_RESPONSE,
          NODE_OPTIONS: `--import ${MOCK_FETCH_PRELOAD}`,
        },
      },
    );
    assert.equal(code, 0, `extract failed: ${stdout}`);
    const result = JSON.parse(stdout) as { success: boolean; intelligence?: { summary: string } };
    assert.equal(result.success, true);
    // Proves the stubbed extraction actually ran (not the empty-fallback path).
    assert.equal(result.intelligence?.summary, 'Sprint planning sync.');
  }

  function readSnapshot(): { extractionMode: string; promptMode?: string } {
    assert.ok(existsSync(snapshotPath), `snapshot not written at ${snapshotPath}`);
    return JSON.parse(readFileSync(snapshotPath, 'utf8')) as {
      extractionMode: string;
      promptMode?: string;
    };
  }

  it('records extractionMode "legacy" (not the prompt mode) by default', () => {
    runExtract('');
    const snapshot = readSnapshot();
    assert.equal(snapshot.extractionMode, 'legacy');
    assert.equal(snapshot.promptMode, 'normal');
  });

  it('records extractionMode "single_pass" when extraction_mode: single_pass', () => {
    runExtract('extraction_mode: single_pass\n');
    const snapshot = readSnapshot();
    assert.equal(snapshot.extractionMode, 'single_pass');
    assert.equal(snapshot.promptMode, 'normal');
  });
});
