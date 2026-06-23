/**
 * single_pass W4 — priorItems auto-load + excludePath (S6).
 *
 * When `--prior-items` is NOT passed and `extraction_mode: single_pass`, the
 * extract command auto-loads prior items from the last 7 days of meetings
 * (current meeting EXCLUDED) for cross-meeting dedup, mirroring the backend.
 * Runs `arete meeting extract` as a subprocess with a stubbed Anthropic fetch
 * (zero network) and asserts the auto-load fires (and excludes self).
 *
 * NOTE: loadRecentMeetingBatch's 7-day window is relative to the SYSTEM CLOCK
 * (same as the backend), so fixtures use dates relative to `now`, not literals.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { runCliRaw, createTmpDir, cleanupTmpDir, CLI_PKG_DIR } from '../helpers.js';

const MOCK_FETCH_PRELOAD = join(CLI_PKG_DIR, 'test', 'fixtures', 'mock-anthropic-fetch.mjs');

const CANNED_RESPONSE = JSON.stringify({
  summary: 'Sync.',
  action_items: [],
  next_steps: [],
  decisions: [],
  learnings: [],
});

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// A recent APPROVED meeting (Format B body sections) so loadRecentMeetingBatch
// picks it up as prior context.
function approvedMeeting(date: string): string {
  return `---
title: Prior Sync
date: ${date}
status: approved
attendees:
  - Alice Smith
---

# Prior Sync

## Approved Decisions

- Use REST over GraphQL

## Approved Learnings

- Kafka consumers are serial

## Approved Action Items

- Send API docs to Alice

## Transcript

**Alice Smith**: Let's use REST.
`;
}

function currentMeeting(date: string): string {
  return `---
title: Today Sync
date: ${date}
attendees:
  - Alice Smith
---

# Today Sync

## Transcript

**Alice Smith**: Following up on the API docs.
`;
}

describe('meeting extract — single_pass priorItems auto-load (W4/S6)', () => {
  let tmpDir: string;
  const priorDate = isoDaysAgo(3);
  const currentDate = isoDaysAgo(0);
  const priorSlug = `${priorDate}_prior-sync.md`;
  const currentSlug = `${currentDate}_today-sync.md`;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-extract-priorload');
    runCliRaw(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor'], { cwd: process.cwd() });
    mkdirSync(join(tmpDir, 'resources', 'meetings'), { recursive: true });
    writeFileSync(join(tmpDir, 'resources', 'meetings', priorSlug), approvedMeeting(priorDate), 'utf8');
    writeFileSync(join(tmpDir, 'resources', 'meetings', currentSlug), currentMeeting(currentDate), 'utf8');
    appendFileSync(
      join(tmpDir, 'arete.yaml'),
      'ai:\n  tiers:\n    fast: anthropic/claude-haiku-4-5\nextraction_mode: single_pass\n',
      'utf8',
    );
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  function run(file: string): { stdout: string; stderr: string; code: number | null } {
    return runCliRaw(
      ['meeting', 'extract', `resources/meetings/${file}`, '--skip-qmd'],
      {
        cwd: tmpDir,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: 'test-key',
          ARETE_NO_LLM: '1',
          ARETE_TEST_LLM_RESPONSE: CANNED_RESPONSE,
          NODE_OPTIONS: `--import ${MOCK_FETCH_PRELOAD}`,
        },
      },
    );
  }

  it('auto-loads prior items from recent meetings (no --prior-items passed)', () => {
    const { stdout, stderr, code } = run(currentSlug);
    assert.equal(code, 0, `extract failed: ${stderr || stdout}`);
    // The prior approved meeting contributes 3 items (1 decision, 1 learning, 1 action).
    assert.match(stdout + stderr, /Auto-loaded 3 prior items from recent meetings/);
  });

  it('excludes the current meeting from its own prior-items batch', () => {
    // Extract the prior meeting itself — the only OTHER meeting (today-sync) has
    // no approved items, and the current file is excluded from its own batch, so
    // there are no prior items to load and the auto-load line is suppressed.
    const { stdout, stderr, code } = run(priorSlug);
    assert.equal(code, 0, `extract failed: ${stderr || stdout}`);
    assert.doesNotMatch(stdout + stderr, /Auto-loaded \d+ prior items/);
  });
});
