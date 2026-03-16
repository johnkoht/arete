import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
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
});
