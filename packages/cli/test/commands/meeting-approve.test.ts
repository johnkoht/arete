import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import {
  runCli,
  runCliRaw,
  createTmpDir,
  cleanupTmpDir,
} from '../helpers.js';

/**
 * Pre-processed meeting file fixture with staged items.
 * Simulates output from `arete meeting extract --stage`.
 */
const PROCESSED_MEETING = `---
title: "Sprint Review"
date: "2026-03-15"
status: processed
processed_at: "2026-03-15T10:00:00.000Z"
staged_item_status:
  ai_001: pending
  ai_002: pending
  de_001: pending
  le_001: pending
staged_item_source:
  ai_001: ai
  ai_002: ai
  de_001: ai
  le_001: ai
---

# Sprint Review

## Summary
Sprint review covering Q1 progress and next steps.

## Staged Action Items
- ai_001: [@john-doe →] Follow up with design team
- ai_002: [@jane-smith ← @john-doe] Review PR by end of week

## Staged Decisions
- de_001: Adopt TypeScript for all new services

## Staged Learnings
- le_001: Integration tests catch more bugs than unit tests

## Transcript
John: Let's review the sprint...
`;

/**
 * Already-approved meeting file fixture.
 */
const APPROVED_MEETING = `---
title: "Already Approved"
date: "2026-03-14"
status: approved
approved_at: "2026-03-14T15:00:00.000Z"
approved_items:
  actionItems:
    - Follow up with team
  decisions:
    - Use TypeScript
  learnings: []
---

# Already Approved

## Summary
This meeting was already approved.
`;

/**
 * Synced meeting file (not processed).
 */
const SYNCED_MEETING = `---
title: "Synced Only"
date: "2026-03-13"
---

# Synced Only

## Summary
No summary available.

## Transcript
Alice: Hello world.
`;

describe('meeting approve command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-meeting-approve');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    mkdirSync(join(tmpDir, 'resources', 'meetings'), { recursive: true });
    mkdirSync(join(tmpDir, '.arete', 'memory', 'items'), { recursive: true });
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('approves all items with --all flag and commits to memory', () => {
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-03-15-sprint-review.md'),
      PROCESSED_MEETING,
      'utf8',
    );

    const stdout = runCli([
      'meeting', 'approve', '2026-03-15-sprint-review',
      '--all',
      '--skip-qmd',
      '--json',
    ], { cwd: tmpDir });

    const result = JSON.parse(stdout) as {
      success: boolean;
      slug: string;
      approvedItems: {
        actionItems: string[];
        decisions: string[];
        learnings: string[];
      };
      memoryUpdated: {
        decisions: boolean;
        learnings: boolean;
      };
    };

    assert.equal(result.success, true);
    assert.equal(result.slug, '2026-03-15-sprint-review');
    assert.equal(result.approvedItems.actionItems.length, 2);
    assert.equal(result.approvedItems.decisions.length, 1);
    assert.equal(result.approvedItems.learnings.length, 1);
    assert.equal(result.memoryUpdated.decisions, true);
    assert.equal(result.memoryUpdated.learnings, true);

    // Verify memory files were written
    const decisionsPath = join(tmpDir, '.arete', 'memory', 'items', 'decisions.md');
    const learningsPath = join(tmpDir, '.arete', 'memory', 'items', 'learnings.md');
    assert.equal(existsSync(decisionsPath), true);
    assert.equal(existsSync(learningsPath), true);

    const decisionsContent = readFileSync(decisionsPath, 'utf8');
    assert.ok(decisionsContent.includes('Adopt TypeScript for all new services'));

    const learningsContent = readFileSync(learningsPath, 'utf8');
    assert.ok(learningsContent.includes('Integration tests catch more bugs than unit tests'));

    // Verify meeting file was updated
    const meetingContent = readFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-03-15-sprint-review.md'),
      'utf8',
    );
    assert.ok(meetingContent.includes('status: approved'));
    assert.ok(meetingContent.includes('approved_at:'));
    assert.ok(meetingContent.includes('## Approved Action Items'));
    assert.ok(meetingContent.includes('## Approved Decisions'));
    assert.ok(meetingContent.includes('## Approved Learnings'));
    // Staged sections should be removed
    assert.ok(!meetingContent.includes('## Staged Action Items'));
  });

  it('approves specific items with --items flag', () => {
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-03-15-sprint-review.md'),
      PROCESSED_MEETING,
      'utf8',
    );

    const stdout = runCli([
      'meeting', 'approve', '2026-03-15-sprint-review',
      '--items', 'ai_001,de_001',
      '--skip-qmd',
      '--json',
    ], { cwd: tmpDir });

    const result = JSON.parse(stdout) as {
      success: boolean;
      approvedItems: {
        actionItems: string[];
        decisions: string[];
        learnings: string[];
      };
    };

    assert.equal(result.success, true);
    assert.equal(result.approvedItems.actionItems.length, 1);
    assert.equal(result.approvedItems.decisions.length, 1);
    assert.equal(result.approvedItems.learnings.length, 0);
  });

  it('skips items with --skip flag', () => {
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-03-15-sprint-review.md'),
      PROCESSED_MEETING,
      'utf8',
    );

    const stdout = runCli([
      'meeting', 'approve', '2026-03-15-sprint-review',
      '--all',
      '--skip', 'ai_002,le_001',
      '--skip-qmd',
      '--json',
    ], { cwd: tmpDir });

    const result = JSON.parse(stdout) as {
      success: boolean;
      approvedItems: {
        actionItems: string[];
        decisions: string[];
        learnings: string[];
      };
    };

    assert.equal(result.success, true);
    // ai_002 and le_001 should be skipped
    assert.equal(result.approvedItems.actionItems.length, 1);
    assert.equal(result.approvedItems.decisions.length, 1);
    assert.equal(result.approvedItems.learnings.length, 0);
  });

  it('errors if meeting already approved', () => {
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-03-14-already-approved.md'),
      APPROVED_MEETING,
      'utf8',
    );

    const { stdout, code } = runCliRaw([
      'meeting', 'approve', '2026-03-14-already-approved',
      '--all',
      '--skip-qmd',
      '--json',
    ], { cwd: tmpDir });

    const result = JSON.parse(stdout) as {
      success: boolean;
      error: string;
      hint?: string;
    };

    assert.equal(code, 1);
    assert.equal(result.success, false);
    assert.ok(result.error.includes('already approved'));
    assert.ok(result.hint);
  });

  it('errors if meeting not processed', () => {
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-03-13-synced-only.md'),
      SYNCED_MEETING,
      'utf8',
    );

    const { stdout, code } = runCliRaw([
      'meeting', 'approve', '2026-03-13-synced-only',
      '--all',
      '--skip-qmd',
      '--json',
    ], { cwd: tmpDir });

    const result = JSON.parse(stdout) as {
      success: boolean;
      error: string;
      hint?: string;
    };

    assert.equal(code, 1);
    assert.equal(result.success, false);
    assert.ok(result.error.includes('not processed'));
    assert.ok(result.hint);
  });

  it('errors if meeting not found', () => {
    const { stdout, code } = runCliRaw([
      'meeting', 'approve', 'nonexistent-meeting',
      '--all',
      '--skip-qmd',
      '--json',
    ], { cwd: tmpDir });

    const result = JSON.parse(stdout) as {
      success: boolean;
      error: string;
    };

    assert.equal(code, 1);
    assert.equal(result.success, false);
    assert.ok(result.error.includes('not found'));
  });

  it('errors if no items approved and no flags provided', () => {
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-03-15-sprint-review.md'),
      PROCESSED_MEETING,
      'utf8',
    );

    const { stdout, code } = runCliRaw([
      'meeting', 'approve', '2026-03-15-sprint-review',
      '--skip-qmd',
      '--json',
    ], { cwd: tmpDir });

    const result = JSON.parse(stdout) as {
      success: boolean;
      error: string;
      hint?: string;
    };

    assert.equal(code, 1);
    assert.equal(result.success, false);
    assert.ok(result.error.includes('No items approved'));
    assert.ok(result.hint);
  });

  it('errors if specified item ID does not exist', () => {
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-03-15-sprint-review.md'),
      PROCESSED_MEETING,
      'utf8',
    );

    const { stdout, code } = runCliRaw([
      'meeting', 'approve', '2026-03-15-sprint-review',
      '--items', 'ai_999',
      '--skip-qmd',
      '--json',
    ], { cwd: tmpDir });

    const result = JSON.parse(stdout) as {
      success: boolean;
      error: string;
    };

    assert.equal(code, 1);
    assert.equal(result.success, false);
    assert.ok(result.error.includes('Item not found: ai_999'));
  });

  it('approves pre-marked items without --all or --items', () => {
    // Meeting with some items already marked as approved
    const preMarkedMeeting = `---
title: "Pre-marked Meeting"
date: "2026-03-15"
status: processed
processed_at: "2026-03-15T10:00:00.000Z"
staged_item_status:
  ai_001: approved
  de_001: approved
  le_001: pending
staged_item_source:
  ai_001: ai
  de_001: ai
  le_001: ai
---

# Pre-marked Meeting

## Summary
Meeting with pre-marked items.

## Staged Action Items
- ai_001: Follow up with team

## Staged Decisions
- de_001: Use TypeScript

## Staged Learnings
- le_001: Testing is important
`;

    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-03-15-pre-marked.md'),
      preMarkedMeeting,
      'utf8',
    );

    const stdout = runCli([
      'meeting', 'approve', '2026-03-15-pre-marked',
      '--skip-qmd',
      '--json',
    ], { cwd: tmpDir });

    const result = JSON.parse(stdout) as {
      success: boolean;
      approvedItems: {
        actionItems: string[];
        decisions: string[];
        learnings: string[];
      };
    };

    assert.equal(result.success, true);
    // Only pre-approved items (ai_001 and de_001) should be committed
    assert.equal(result.approvedItems.actionItems.length, 1);
    assert.equal(result.approvedItems.decisions.length, 1);
    assert.equal(result.approvedItems.learnings.length, 0);
  });

  it('surfaces SeedLockHeldError instead of warn-swallowing (W1 / AC1 surfaced error)', () => {
    // Meeting tagged with topics so Hook 2 actually attempts integration.
    const meetingWithTopics = PROCESSED_MEETING.replace(
      'status: processed',
      'status: processed\ntopics: [sprint-planning]',
    );
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-03-15-sprint-review.md'),
      meetingWithTopics,
      'utf8',
    );

    // Configure a (never-called) AI tier so `ai.isConfigured()` passes the
    // Hook-2 gate. The seed lock throws before any LLM call happens.
    const manifestPath = join(tmpDir, 'arete.yaml');
    const manifest = readFileSync(manifestPath, 'utf8');
    writeFileSync(
      manifestPath,
      `${manifest}\nai:\n  tiers:\n    fast: anthropic/claude-3-5-haiku-20241022\n`,
      'utf8',
    );

    // Hold the lock with OUR (live) pid — takeover must NOT kick in.
    const lockPath = join(tmpDir, '.arete', '.seed.lock');
    writeFileSync(
      lockPath,
      JSON.stringify({ pid: process.pid, started: new Date().toISOString(), command: 'test-hold' }),
      { flag: 'wx' },
    );

    try {
      const stdout = runCli(
        ['meeting', 'approve', '2026-03-15-sprint-review', '--all', '--skip-qmd', '--json'],
        { cwd: tmpDir, env: { ARETE_NO_LLM: '' } },
      );
      const result = JSON.parse(stdout) as {
        success: boolean;
        topicIntegration: unknown;
        topicIntegrationError: { kind: string; message: string } | null;
      };

      // Approve itself succeeds (items committed) — but the skipped
      // integration is SURFACED, not swallowed.
      assert.equal(result.success, true);
      assert.equal(result.topicIntegration, null);
      assert.ok(result.topicIntegrationError, 'topicIntegrationError must be present');
      assert.equal(result.topicIntegrationError?.kind, 'seed-lock-held');
      assert.match(result.topicIntegrationError?.message ?? '', /Seed lock held/i);

      // And a log event records the skipped integration.
      const log = readFileSync(join(tmpDir, '.arete', 'memory', 'log.md'), 'utf8');
      assert.match(log, /topic-integration-skipped/);
      assert.match(log, /reason=seed-lock-held/);
      assert.match(log, /meeting=2026-03-15-sprint-review/);
    } finally {
      rmSync(lockPath, { force: true });
    }
  });

  it('human output shows a loud topic-integration error on lock contention (W1)', () => {
    const meetingWithTopics = PROCESSED_MEETING.replace(
      'status: processed',
      'status: processed\ntopics: [sprint-planning]',
    );
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-03-15-sprint-review.md'),
      meetingWithTopics,
      'utf8',
    );
    const manifestPath = join(tmpDir, 'arete.yaml');
    writeFileSync(
      manifestPath,
      `${readFileSync(manifestPath, 'utf8')}\nai:\n  tiers:\n    fast: anthropic/claude-3-5-haiku-20241022\n`,
      'utf8',
    );
    const lockPath = join(tmpDir, '.arete', '.seed.lock');
    writeFileSync(
      lockPath,
      JSON.stringify({ pid: process.pid, started: new Date().toISOString(), command: 'test-hold' }),
      { flag: 'wx' },
    );

    try {
      // Approve only non-action items: action items in non-JSON mode
      // trigger the interactive goal-link prompt, which can't run in a
      // captured subprocess. Hook 2 fires regardless of item kinds.
      const r = runCliRaw(
        ['meeting', 'approve', '2026-03-15-sprint-review', '--items', 'de_001,le_001', '--skip-qmd'],
        { cwd: tmpDir, env: { ARETE_NO_LLM: '' } },
      );
      assert.equal(r.code, 0, 'approve still succeeds');
      const combined = `${r.stdout}\n${r.stderr}`;
      assert.match(combined, /Topic integration SKIPPED/);
      assert.match(combined, /NOT integrated into its topic wiki pages/);
      assert.match(combined, /arete topic refresh/);
    } finally {
      rmSync(lockPath, { force: true });
    }
  });

  // --------------------------------------------------------------------------
  // wiki-repair W2 — approve-time summary hook independence (pre-mortem R4).
  // --------------------------------------------------------------------------

  it('summary LLM failure never skips topic integration; approve exits 0 (R4)', () => {
    // ai.tiers has ONLY `fast` — the summary hook and Hook 2 both route
    // through the `synthesis` task (standard tier), so every LLM call
    // throws "AI tier 'standard' not configured" WITHOUT any network.
    // The summary hook must fail in its OWN try/catch; Hook 2 must still
    // run (integrateSource converts per-source LLM throws into fallback
    // integrations, so topicIntegration reports fallback > 0).
    const meetingWithTopics = PROCESSED_MEETING.replace(
      'status: processed',
      'status: processed\ntopics: [sprint-planning]',
    );
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-03-15-sprint-review.md'),
      meetingWithTopics,
      'utf8',
    );
    const manifestPath = join(tmpDir, 'arete.yaml');
    writeFileSync(
      manifestPath,
      `${readFileSync(manifestPath, 'utf8')}\nai:\n  tiers:\n    fast: anthropic/claude-3-5-haiku-20241022\n`,
      'utf8',
    );

    const stdout = runCli(
      ['meeting', 'approve', '2026-03-15-sprint-review', '--all', '--skip-qmd', '--json'],
      { cwd: tmpDir, env: { ARETE_NO_LLM: '' } },
    );
    const result = JSON.parse(stdout) as {
      success: boolean;
      summary: { path: string | null; written: boolean; reason?: string } | null;
      topicIntegration: { topics: number; fallback: number } | null;
      topicIntegrationError: unknown;
    };

    // Approve exit 0 + success (runCli throws on non-zero exit).
    assert.equal(result.success, true);
    // Summary failed in its own try/catch (llm-error from the writer).
    assert.ok(result.summary, 'summary surface must be present');
    assert.equal(result.summary?.written, false);
    assert.match(result.summary?.reason ?? '', /llm-error|error:/);
    // Integration STILL ran — per-source LLM failure degrades to
    // fallback integration, not a skipped hook.
    assert.ok(result.topicIntegration, 'Hook 2 must still run after summary failure');
    assert.equal(result.topicIntegration!.topics >= 1, true);
    assert.equal(result.topicIntegration!.fallback >= 1, true);
    assert.equal(result.topicIntegrationError, null);

    // The summary-first read had nothing to consume → the ingest event
    // records transcript input (W5 observability).
    const log = readFileSync(join(tmpDir, '.arete', 'memory', 'log.md'), 'utf8');
    assert.match(log, /ingest/);
    assert.match(log, /input_kind=transcript/);
  });

  // --------------------------------------------------------------------------
  // wiki-repair W2 / D1 — could_include consume-or-clear at approve.
  // --------------------------------------------------------------------------

  it('approves a meeting staged BEFORE the could_include key existed (R5 upgrade path)', () => {
    // PROCESSED_MEETING has NO could_include key — the live-fleet state
    // for every meeting staged before the D1 change shipped. Approve
    // must succeed with no FYI handling and no error.
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-03-15-sprint-review.md'),
      PROCESSED_MEETING,
      'utf8',
    );

    const stdout = runCli([
      'meeting', 'approve', '2026-03-15-sprint-review',
      '--all',
      '--skip-qmd',
      '--json',
    ], { cwd: tmpDir, env: { ARETE_NO_LLM: '1' } });

    const result = JSON.parse(stdout) as { success: boolean };
    assert.equal(result.success, true);

    const meetingContent = readFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-03-15-sprint-review.md'),
      'utf8',
    );
    assert.ok(meetingContent.includes('status: approved'));
    assert.ok(!meetingContent.includes('could_include'));
  });

  it('clears could_include even when the summary path is gated off (no fossil keys)', () => {
    const stagedWithCouldInclude = PROCESSED_MEETING.replace(
      'status: processed',
      'status: processed\ncould_include:\n  - "Risks: Sara flagged churn assumption"\n  - "Hiring: two offers out"',
    );
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-03-15-sprint-review.md'),
      stagedWithCouldInclude,
      'utf8',
    );

    // ARETE_NO_LLM gates off BOTH the summary hook and Hook 2 — the
    // exact "gated-off approve" fossil case from pre-mortem R5.
    const stdout = runCli([
      'meeting', 'approve', '2026-03-15-sprint-review',
      '--all',
      '--skip-qmd',
      '--json',
    ], { cwd: tmpDir, env: { ARETE_NO_LLM: '1' } });

    const result = JSON.parse(stdout) as { success: boolean };
    assert.equal(result.success, true);

    const meetingContent = readFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-03-15-sprint-review.md'),
      'utf8',
    );
    // Key consumed-or-cleared: gone from frontmatter.
    assert.ok(!meetingContent.includes('could_include'));
    // Other frontmatter survives the partial-merge clear.
    assert.ok(meetingContent.includes('status: approved'));
    assert.ok(meetingContent.includes('title: Sprint Review') || meetingContent.includes('title: "Sprint Review"'));
    // No summary file was written (gated off).
    assert.equal(
      existsSync(join(tmpDir, '.arete', 'memory', 'summaries', 'meetings')),
      false,
    );
  });
});
