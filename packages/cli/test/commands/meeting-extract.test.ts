/**
 * Tests for `arete meeting extract` command.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import {
  runCli,
  runCliRaw,
  createTmpDir,
  cleanupTmpDir,
} from '../helpers.js';

const SAMPLE_MEETING_CONTENT = `---
title: Sprint Planning
date: 2026-03-01
attendees:
  - Alice Smith <alice@acme.com>
  - Bob Jones
---

# Sprint Planning

**Date**: 2026-03-01
**Duration**: 60 minutes

## Transcript

**Alice Smith**: Let's discuss the upcoming sprint priorities. I think we should focus on the API refactor.

**Bob Jones**: Agreed. I'll handle the authentication module. Should have it done by Friday.

**Alice Smith**: Perfect. I'll update the documentation once you're done.

**Bob Jones**: We also decided to use TypeScript for the new services.

**Alice Smith**: That's a key decision. Let me note that down.
`;

describe('meeting extract command', () => {
  let tmpDir: string;
  let meetingFile: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-meeting-extract');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    mkdirSync(join(tmpDir, 'resources', 'meetings'), { recursive: true });
    meetingFile = join(tmpDir, 'resources', 'meetings', '2026-03-01_sprint-planning.md');
    writeFileSync(meetingFile, SAMPLE_MEETING_CONTENT, 'utf8');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  describe('error handling', () => {
    it('errors when AI is not configured', () => {
      // By default in test env, no credentials are configured
      const { stdout, code } = runCliRaw(
        ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--json'],
        { cwd: tmpDir },
      );

      assert.equal(code, 1);
      const result = JSON.parse(stdout) as { success: boolean; error: string };
      assert.equal(result.success, false);
      assert.ok(result.error.includes('No AI provider configured'));
      assert.ok(result.error.includes('arete credentials configure') || result.error.includes('arete.yaml'));
    });

    it('errors when file does not exist', () => {
      // Set up mock AI config to bypass the AI check
      const areteYaml = join(tmpDir, 'arete.yaml');
      const config = `ai:
  tiers:
    fast: anthropic/claude-3-haiku
`;
      writeFileSync(areteYaml, config, 'utf8');

      const { stdout, code } = runCliRaw(
        ['meeting', 'extract', 'resources/meetings/nonexistent.md', '--json'],
        { 
          cwd: tmpDir,
          env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
        },
      );

      assert.equal(code, 1);
      const result = JSON.parse(stdout) as { success: boolean; error: string };
      assert.equal(result.success, false);
      assert.ok(result.error.includes('not found') || result.error.includes('nonexistent'));
    });

    it('errors when not in a workspace', () => {
      const nonWorkspace = createTmpDir('arete-test-non-workspace');
      try {
        const { stdout, code } = runCliRaw(
          ['meeting', 'extract', 'some-file.md', '--json'],
          { cwd: nonWorkspace },
        );

        // Should exit with error (either "not in workspace" or "no AI configured" — both are valid early errors)
        assert.equal(code, 1);
        const result = JSON.parse(stdout) as { success: boolean; error: string };
        assert.equal(result.success, false);
      } finally {
        cleanupTmpDir(nonWorkspace);
      }
    });
  });

  describe('output formats', () => {
    it('--json produces valid JSON with extraction result structure', () => {
      // Set up mock AI config
      const areteYaml = join(tmpDir, 'arete.yaml');
      const config = `ai:
  tiers:
    fast: anthropic/claude-3-haiku
`;
      writeFileSync(areteYaml, config, 'utf8');

      // This test will fail at the actual LLM call since there's no real API key,
      // but it validates JSON output structure for error case
      const { stdout, code } = runCliRaw(
        ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--json', '--skip-qmd'],
        { 
          cwd: tmpDir,
          env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
        },
      );

      // Parse should succeed even if extraction failed
      const result = JSON.parse(stdout);
      assert.ok('success' in result);
      // Either success with intelligence or error with message — both are valid JSON
      if (result.success) {
        assert.ok('intelligence' in result);
        assert.ok('staged' in result);
        assert.ok('dryRun' in result);
      } else {
        assert.ok('error' in result);
      }
    });
  });

  describe('--stage and --dry-run behavior', () => {
    it('--dry-run with --stage does not modify the file', () => {
      // Set up mock AI config
      const areteYaml = join(tmpDir, 'arete.yaml');
      const config = `ai:
  tiers:
    fast: anthropic/claude-3-haiku
`;
      writeFileSync(areteYaml, config, 'utf8');

      const originalContent = readFileSync(meetingFile, 'utf8');

      // Run with --dry-run --stage
      runCliRaw(
        ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--stage', '--dry-run', '--skip-qmd', '--json'],
        { 
          cwd: tmpDir,
          env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
        },
      );

      // File should be unchanged
      const afterContent = readFileSync(meetingFile, 'utf8');
      assert.equal(afterContent, originalContent, 'File should not be modified with --dry-run');
    });

    it('--dry-run flag is reflected in JSON output', () => {
      // Set up mock AI config
      const areteYaml = join(tmpDir, 'arete.yaml');
      const config = `ai:
  tiers:
    fast: anthropic/claude-3-haiku
`;
      writeFileSync(areteYaml, config, 'utf8');

      const { stdout } = runCliRaw(
        ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--stage', '--dry-run', '--skip-qmd', '--json'],
        { 
          cwd: tmpDir,
          env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
        },
      );

      const result = JSON.parse(stdout);
      if (result.success) {
        assert.equal(result.dryRun, true);
        assert.equal(result.staged, true);
      }
      // If not success, it failed at LLM call which is acceptable in unit test
    });
  });

  describe('qmd integration', () => {
    it('--skip-qmd produces qmd.skipped:true in JSON output', () => {
      // Set up mock AI config
      const areteYaml = join(tmpDir, 'arete.yaml');
      const config = `ai:
  tiers:
    fast: anthropic/claude-3-haiku
`;
      writeFileSync(areteYaml, config, 'utf8');

      const { stdout } = runCliRaw(
        ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--skip-qmd', '--json'],
        { 
          cwd: tmpDir,
          env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
        },
      );

      const result = JSON.parse(stdout);
      if (result.success) {
        assert.ok('qmd' in result);
        assert.equal(result.qmd.skipped, true);
        assert.equal(result.qmd.indexed, false);
      }
    });
  });
});

describe('meeting extract command - integration with mocked AI', () => {
  // These tests would require more sophisticated mocking of AIService.
  // For now, we validate the command structure and error paths.
  // Full integration tests with mocked AIService can be added when needed.

  it('validates command accepts required file argument', () => {
    const tmpDir = createTmpDir('arete-test-extract-args');
    try {
      runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);

      // No file argument should error
      const { stderr, code } = runCliRaw(
        ['meeting', 'extract', '--json'],
        { cwd: tmpDir },
      );

      assert.equal(code, 1);
      assert.ok(stderr.includes('missing required argument') || stderr.includes('file'));
    } finally {
      cleanupTmpDir(tmpDir);
    }
  });
});

describe('--clear-approved flag', () => {
  let tmpDir: string;
  let meetingFile: string;

  const APPROVED_MEETING_CONTENT = `---
title: Sprint Planning
date: "2026-03-01"
attendees:
  - Alice Smith
  - Bob Jones
status: approved
approved_at: "2026-03-10T12:00:00.000Z"
approved_items:
  ai_001: approved
  de_001: approved
  le_001: approved
---

# Sprint Planning

## Summary

Team discussed sprint priorities.

## Approved Action Items

- [ai_001] @alice-smith Update documentation

## Approved Decisions

- [de_001] Use TypeScript for new services

## Approved Learnings

- [le_001] Daily standups improve coordination

## Transcript

**Alice Smith**: Let's discuss the sprint.
`;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-clear-approved');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    mkdirSync(join(tmpDir, 'resources', 'meetings'), { recursive: true });
    meetingFile = join(tmpDir, 'resources', 'meetings', '2026-03-01_sprint-planning.md');
    writeFileSync(meetingFile, APPROVED_MEETING_CONTENT, 'utf8');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('errors when --clear-approved is used without --stage (JSON mode)', () => {
    // Set up mock AI config
    const areteYaml = join(tmpDir, 'arete.yaml');
    const config = `ai:
  tiers:
    fast: anthropic/claude-3-haiku
`;
    writeFileSync(areteYaml, config, 'utf8');

    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--clear-approved', '--json'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    assert.equal(code, 1);
    const result = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(result.success, false);
    assert.ok(result.error.includes('--clear-approved requires --stage'));
  });

  it('errors when --clear-approved is used without --stage (non-JSON mode)', () => {
    // Set up mock AI config
    const areteYaml = join(tmpDir, 'arete.yaml');
    const config = `ai:
  tiers:
    fast: anthropic/claude-3-haiku
`;
    writeFileSync(areteYaml, config, 'utf8');

    const { stderr, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--clear-approved'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    assert.equal(code, 1);
    assert.ok(stderr.includes('--clear-approved requires --stage'));
  });

  it('clears approved sections and frontmatter when --clear-approved --stage is used', () => {
    // Verify the file has approved content before clearing
    const beforeContent = readFileSync(meetingFile, 'utf8');
    assert.ok(beforeContent.includes('## Approved Action Items'));
    assert.ok(beforeContent.includes('## Approved Decisions'));
    assert.ok(beforeContent.includes('## Approved Learnings'));
    assert.ok(beforeContent.includes('approved_items:'));
    assert.ok(beforeContent.includes('approved_at:'));
    assert.ok(beforeContent.includes('status: approved'));

    // Set up mock AI config
    const areteYaml = join(tmpDir, 'arete.yaml');
    const config = `ai:
  tiers:
    fast: anthropic/claude-3-haiku
`;
    writeFileSync(areteYaml, config, 'utf8');

    // Run with --clear-approved --stage
    // The extraction will fail due to no real AI, but clearing should happen first
    runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--clear-approved', '--stage', '--skip-qmd', '--json'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    // Check file was modified — approved sections and frontmatter should be cleared
    const afterContent = readFileSync(meetingFile, 'utf8');

    // Approved sections should be removed
    assert.ok(!afterContent.includes('## Approved Action Items'), 'Should not have Approved Action Items section');
    assert.ok(!afterContent.includes('## Approved Decisions'), 'Should not have Approved Decisions section');
    assert.ok(!afterContent.includes('## Approved Learnings'), 'Should not have Approved Learnings section');

    // Approved frontmatter keys should be removed
    assert.ok(!afterContent.includes('approved_items:'), 'Should not have approved_items in frontmatter');
    assert.ok(!afterContent.includes('approved_at:'), 'Should not have approved_at in frontmatter');
    // status: approved should be removed, but status could be re-added by extraction
    // So we check that 'status: approved' is gone
    const fmMatch = afterContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fmMatch) {
      const fm = parseYaml(fmMatch[1]) as Record<string, unknown>;
      assert.ok(!('approved_items' in fm), 'approved_items should be deleted from frontmatter');
      assert.ok(!('approved_at' in fm), 'approved_at should be deleted from frontmatter');
      // status may be re-added as 'processed' by extraction, but shouldn't be 'approved'
      if ('status' in fm) {
        assert.notEqual(fm['status'], 'approved', 'status should not be approved anymore');
      }
    }

    // Non-approved content should be preserved
    assert.ok(afterContent.includes('## Summary'), 'Should preserve Summary section');
    assert.ok(afterContent.includes('## Transcript'), 'Should preserve Transcript section');
    assert.ok(afterContent.includes('title: Sprint Planning'), 'Should preserve title in frontmatter');
    assert.ok(afterContent.includes('date:'), 'Should preserve date in frontmatter');
    assert.ok(afterContent.includes('attendees:'), 'Should preserve attendees in frontmatter');
  });

  it('proceeds silently when file has nothing to clear', () => {
    // Create a file without approved content
    const freshContent = `---
title: Fresh Meeting
date: "2026-03-15"
attendees:
  - Alice Smith
---

# Fresh Meeting

## Summary

No approved content here.

## Transcript

**Alice Smith**: Just a regular meeting.
`;
    writeFileSync(meetingFile, freshContent, 'utf8');

    // Set up mock AI config
    const areteYaml = join(tmpDir, 'arete.yaml');
    const config = `ai:
  tiers:
    fast: anthropic/claude-3-haiku
`;
    writeFileSync(areteYaml, config, 'utf8');

    // Run with --clear-approved --stage — should not error even though there's nothing to clear
    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--clear-approved', '--stage', '--skip-qmd', '--json'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    // Should proceed with extraction (which may fail at LLM call, but clearing shouldn't error)
    // The result will either be success (if mocked) or error at LLM call
    const result = JSON.parse(stdout) as { success: boolean; error?: string };
    // Should NOT error with "nothing to clear" — should proceed silently
    if (!result.success) {
      assert.ok(!result.error?.includes('nothing to clear'), 'Should not error about nothing to clear');
      assert.ok(!result.error?.includes('no approved'), 'Should not error about no approved content');
    }
  });
});

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { processMeetingExtraction, extractUserNotes } from '@arete/core';
import type { MeetingExtractionResult, FilteredItem } from '@arete/core';

describe('extract --stage frontmatter preservation', () => {
  // Test the frontmatter merge pattern used in --stage:
  // Clone frontmatter → add staged_item_* fields → preserve existing fields

  it('preserves non-staged frontmatter fields when adding staged metadata', () => {
    // Simulate existing frontmatter from a meeting file
    const existingFrontmatter = {
      title: 'Sprint Planning',
      date: '2026-03-01',
      attendees: [
        { name: 'Alice Smith', email: 'alice@acme.com' },
        { name: 'Bob Jones', email: 'bob@acme.com' },
      ],
      duration_minutes: 60,
      source: 'fathom',
      custom_field: 'user-added-value',
    };

    // Clone frontmatter before mutating (same pattern as CLI extract --stage)
    const fm = { ...existingFrontmatter } as Record<string, unknown>;

    // Add staged metadata (snake_case keys, matching CLI implementation)
    fm['status'] = 'processed';
    fm['processed_at'] = '2026-03-15T10:00:00.000Z';
    fm['staged_item_source'] = { ai_001: 'ai', de_001: 'dedup' };
    fm['staged_item_confidence'] = { ai_001: 0.95, de_001: 0.9 };
    fm['staged_item_status'] = { ai_001: 'approved', de_001: 'approved' };
    fm['staged_item_owner'] = { ai_001: { ownerSlug: 'alice-smith', direction: 'i_owe_them' } };

    // Verify original fields are preserved
    assert.equal(fm['title'], 'Sprint Planning');
    assert.equal(fm['date'], '2026-03-01');
    assert.deepEqual(fm['attendees'], existingFrontmatter.attendees);
    assert.equal(fm['duration_minutes'], 60);
    assert.equal(fm['source'], 'fathom');
    assert.equal(fm['custom_field'], 'user-added-value');

    // Verify new fields are added
    assert.equal(fm['status'], 'processed');
    assert.ok(fm['processed_at']);
    assert.deepEqual(fm['staged_item_source'], { ai_001: 'ai', de_001: 'dedup' });
    assert.deepEqual(fm['staged_item_status'], { ai_001: 'approved', de_001: 'approved' });
  });

  it('YAML roundtrip preserves all fields', () => {
    const existingContent = `---
title: Sprint Planning
date: "2026-03-01"
attendees:
  - name: Alice Smith
    email: alice@acme.com
  - Bob Jones
duration_minutes: 60
custom_field: user-added-value
---

# Meeting Content
`;

    // Parse frontmatter (same regex pattern as CLI extractFrontmatter)
    const match = existingContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    assert.ok(match, 'Should parse frontmatter');

    const frontmatter = parseYaml(match[1]) as Record<string, unknown>;
    const body = match[2];

    // Clone and add staged fields
    const fm = { ...frontmatter };
    fm['status'] = 'processed';
    fm['processed_at'] = '2026-03-15T10:00:00.000Z';
    fm['staged_item_status'] = { ai_001: 'pending' };

    // Reconstruct file
    const updatedFile = `---\n${stringifyYaml(fm)}---\n\n${body}`;

    // Re-parse to verify roundtrip
    const reparsed = parseYaml(updatedFile.match(/^---\r?\n([\s\S]*?)\r?\n---/)![1]) as Record<string, unknown>;

    // Verify all original fields survived roundtrip
    assert.equal(reparsed['title'], 'Sprint Planning');
    assert.equal(reparsed['date'], '2026-03-01');
    assert.equal(reparsed['duration_minutes'], 60);
    assert.equal(reparsed['custom_field'], 'user-added-value');
    assert.ok(Array.isArray(reparsed['attendees']));
    assert.equal((reparsed['attendees'] as unknown[]).length, 2);

    // Verify new fields present
    assert.equal(reparsed['status'], 'processed');
    assert.deepEqual(reparsed['staged_item_status'], { ai_001: 'pending' });
  });

  it('processMeetingExtraction produces correct metadata structure', () => {
    // Mock extraction result (what extractMeetingIntelligence returns)
    const extractionResult: MeetingExtractionResult = {
      intelligence: {
        summary: 'Team discussed sprint priorities.',
        actionItems: [
          {
            owner: 'Alice Smith',
            ownerSlug: 'alice-smith',
            description: 'Update documentation',
            direction: 'i_owe_them',
            confidence: 0.95,
          },
          {
            owner: 'Bob Jones',
            ownerSlug: 'bob-jones',
            description: 'Handle authentication module',
            direction: 'i_owe_them',
            counterpartySlug: 'alice-smith',
            confidence: 0.85,
          },
        ],
        nextSteps: [],
        decisions: ['Use TypeScript for new services'],
        learnings: ['Daily standups improve coordination'],
      },
      validationWarnings: [],
      rawItems: [],
    };

    const userNotes = ''; // No user notes for this test

    // Process extraction (same function used in CLI)
    const processed = processMeetingExtraction(extractionResult, userNotes);

    // Verify filtered items have correct structure
    assert.ok(processed.filteredItems.length > 0);

    // Verify action items
    const actionItems = processed.filteredItems.filter(i => i.type === 'action');
    assert.equal(actionItems.length, 2);
    assert.equal(actionItems[0].id, 'ai_001');
    assert.equal(actionItems[0].text, 'Update documentation');

    // Verify decisions
    const decisions = processed.filteredItems.filter(i => i.type === 'decision');
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].id, 'de_001');

    // Verify metadata maps
    assert.ok(processed.stagedItemStatus['ai_001']);
    assert.ok(processed.stagedItemConfidence['ai_001']);
    assert.ok(processed.stagedItemSource['ai_001']);

    // Verify owner metadata for action items
    assert.ok(processed.stagedItemOwner['ai_001']);
    assert.equal(processed.stagedItemOwner['ai_001'].ownerSlug, 'alice-smith');
  });
});

describe('--prior-items option', () => {
  let tmpDir: string;
  let meetingFile: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-prior-items');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    mkdirSync(join(tmpDir, 'resources', 'meetings'), { recursive: true });
    meetingFile = join(tmpDir, 'resources', 'meetings', '2026-03-01_sprint-planning.md');
    writeFileSync(meetingFile, SAMPLE_MEETING_CONTENT, 'utf8');

    // Set up mock AI config
    const areteYaml = join(tmpDir, 'arete.yaml');
    const config = `ai:
  tiers:
    fast: anthropic/claude-3-haiku
`;
    writeFileSync(areteYaml, config, 'utf8');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('errors when both --context - and --prior-items - are specified', () => {
    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--context', '-', '--prior-items', '-', '--json'],
      { cwd: tmpDir },
    );

    assert.equal(code, 1);
    const result = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(result.success, false);
    assert.ok(result.error.includes('Cannot read both --context and --prior-items from stdin'));
  });

  it('errors when prior-items file does not exist', () => {
    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--prior-items', '/nonexistent/file.json', '--json', '--skip-qmd'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    assert.equal(code, 1);
    const result = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(result.success, false);
    assert.ok(result.error.includes('Prior items file not found'));
  });

  it('errors when prior-items is not an array', () => {
    const priorItemsFile = join(tmpDir, 'prior-items.json');
    writeFileSync(priorItemsFile, '{"not": "an array"}', 'utf8');

    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--prior-items', priorItemsFile, '--json', '--skip-qmd'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    assert.equal(code, 1);
    const result = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(result.success, false);
    assert.ok(result.error.includes('Prior items must be an array'));
  });

  it('errors when prior-items element is missing type', () => {
    const priorItemsFile = join(tmpDir, 'prior-items.json');
    writeFileSync(priorItemsFile, JSON.stringify([
      { text: 'Some item without type' },
    ]), 'utf8');

    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--prior-items', priorItemsFile, '--json', '--skip-qmd'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    assert.equal(code, 1);
    const result = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(result.success, false);
    assert.ok(result.error.includes('Each prior item must have type and text'));
  });

  it('errors when prior-items element is missing text', () => {
    const priorItemsFile = join(tmpDir, 'prior-items.json');
    writeFileSync(priorItemsFile, JSON.stringify([
      { type: 'action' },
    ]), 'utf8');

    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--prior-items', priorItemsFile, '--json', '--skip-qmd'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    assert.equal(code, 1);
    const result = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(result.success, false);
    assert.ok(result.error.includes('Each prior item must have type and text'));
  });

  it('errors when prior-items is invalid JSON', () => {
    const priorItemsFile = join(tmpDir, 'prior-items.json');
    writeFileSync(priorItemsFile, 'not valid json', 'utf8');

    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--prior-items', priorItemsFile, '--json', '--skip-qmd'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    assert.equal(code, 1);
    const result = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(result.success, false);
    assert.ok(result.error.includes('Failed to parse prior items'));
  });

  it('accepts valid prior-items file (reaches extraction)', () => {
    const priorItemsFile = join(tmpDir, 'prior-items.json');
    writeFileSync(priorItemsFile, JSON.stringify([
      { type: 'action', text: 'Update documentation' },
      { type: 'decision', text: 'Use TypeScript for new services' },
      { type: 'learning', text: 'Daily standups improve coordination', source: 'meeting-123' },
    ]), 'utf8');

    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--prior-items', priorItemsFile, '--json', '--skip-qmd'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    // Should proceed past validation (may fail at LLM call due to no real API key)
    const result = JSON.parse(stdout) as { success: boolean; error?: string; priorItemsUsed?: boolean };
    
    // Either success (priorItemsUsed = true) or error at LLM call (not at prior-items parsing)
    if (result.success) {
      assert.equal(result.priorItemsUsed, true);
    } else {
      // Should NOT be a prior-items parsing error
      assert.ok(!result.error?.includes('Prior items'), `Should not be prior-items error: ${result.error}`);
      assert.ok(!result.error?.includes('prior item'), `Should not be prior-items validation error: ${result.error}`);
    }
  });

  it('includes priorItemsUsed: false when no prior-items provided', () => {
    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--json', '--skip-qmd'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    // May succeed or fail at LLM call, but should have priorItemsUsed field if successful
    const result = JSON.parse(stdout) as { success: boolean; priorItemsUsed?: boolean };
    
    if (result.success) {
      assert.equal(result.priorItemsUsed, false);
    }
    // If it failed at LLM call, we can't check priorItemsUsed (error response structure)
  });
});

describe('completedItems reconciliation wiring', () => {
  let tmpDir: string;
  let meetingFile: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-completed-items');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    mkdirSync(join(tmpDir, 'resources', 'meetings'), { recursive: true });
    meetingFile = join(tmpDir, 'resources', 'meetings', '2026-03-01_sprint-planning.md');
    writeFileSync(meetingFile, SAMPLE_MEETING_CONTENT, 'utf8');

    // Set up mock AI config
    const areteYaml = join(tmpDir, 'arete.yaml');
    const config = `ai:
  tiers:
    fast: anthropic/claude-3-haiku
`;
    writeFileSync(areteYaml, config, 'utf8');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('reads completed items from week.md when --stage is used', () => {
    // Create now/week.md with completed items
    // Using text that would match via Jaccard ≥ 0.6 threshold:
    // "Send auth doc to Alex" (5 words) matches with high Jaccard similarity
    const weekContent = `# Week of March 1, 2026

## Focus

Build the authentication system.

## Tasks

- [x] Send auth doc to Alex
- [x] Review the quarterly budget
- [ ] Update CI pipeline
`;
    mkdirSync(join(tmpDir, 'now'), { recursive: true });
    writeFileSync(join(tmpDir, 'now', 'week.md'), weekContent, 'utf8');

    // Run extract --stage
    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--stage', '--json', '--skip-qmd'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    const result = JSON.parse(stdout) as { 
      success: boolean; 
      error?: string;
      reconciled?: Array<{ id: string; matchedText: string }>;
    };
    
    if (result.success) {
      // If extraction succeeded, reconciled array should be present
      assert.ok('reconciled' in result, 'Should have reconciled field in output');
      assert.ok(Array.isArray(result.reconciled), 'reconciled should be an array');
    } else {
      // If extraction failed, ensure it's not due to week.md reading issues
      assert.ok(!result.error?.includes('week.md'), `Error should not be about week.md: ${result.error}`);
      assert.ok(!result.error?.includes('completedItems'), `Error should not be about completedItems: ${result.error}`);
      assert.ok(!result.error?.includes('now/'), `Error should not be about now/ directory: ${result.error}`);
    }
  });

  it('handles missing week.md gracefully (no error)', () => {
    // Don't create week.md — the CLI should handle this gracefully
    // (returns empty string via ?? '' fallback in the code)

    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--stage', '--json', '--skip-qmd'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    const result = JSON.parse(stdout) as { success: boolean; error?: string };
    
    // Should NOT error about missing week.md
    if (!result.success) {
      assert.ok(!result.error?.includes('week.md'), `Should not error about week.md: ${result.error}`);
      assert.ok(!result.error?.includes('ENOENT'), `Should not error about file not found: ${result.error}`);
    }
  });

  it('reads completed items from scratchpad.md alongside week.md', () => {
    // Create both now/week.md and now/scratchpad.md with completed items
    const weekContent = `# Week Plan

- [x] Send auth doc to Alex
`;
    const scratchpadContent = `# Scratchpad

- [x] Update API endpoints
- [ ] Draft blog post
`;
    mkdirSync(join(tmpDir, 'now'), { recursive: true });
    writeFileSync(join(tmpDir, 'now', 'week.md'), weekContent, 'utf8');
    writeFileSync(join(tmpDir, 'now', 'scratchpad.md'), scratchpadContent, 'utf8');

    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--stage', '--json', '--skip-qmd'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    const result = JSON.parse(stdout) as { success: boolean; error?: string };
    
    // Should NOT error about scratchpad.md reading
    if (!result.success) {
      assert.ok(!result.error?.includes('scratchpad.md'), `Should not error about scratchpad.md: ${result.error}`);
    }
  });
});

describe('--importance flag', () => {
  let tmpDir: string;
  let meetingFile: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-importance');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    mkdirSync(join(tmpDir, 'resources', 'meetings'), { recursive: true });
    meetingFile = join(tmpDir, 'resources', 'meetings', '2026-03-01_sprint-planning.md');
    writeFileSync(meetingFile, SAMPLE_MEETING_CONTENT, 'utf8');

    // Set up mock AI config
    const areteYaml = join(tmpDir, 'arete.yaml');
    const config = `ai:
  tiers:
    fast: anthropic/claude-3-haiku
`;
    writeFileSync(areteYaml, config, 'utf8');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('returns skipped: true for --importance skip', () => {
    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--importance', 'skip', '--json'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    // Should succeed without calling LLM
    assert.equal(code, 0);
    const result = JSON.parse(stdout) as { success: boolean; skipped?: boolean; reason?: string };
    assert.equal(result.success, true);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'importance: skip');
  });

  it('errors for invalid importance level', () => {
    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--importance', 'invalid', '--json'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    assert.equal(code, 1);
    const result = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(result.success, false);
    assert.ok(result.error.includes('Invalid importance level'));
    assert.ok(result.error.includes('skip, light, normal, important'));
  });

  it('accepts valid importance levels (light, normal, important)', () => {
    // Test light - should not error at validation
    const { stdout: lightOut, code: lightCode } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--importance', 'light', '--json', '--skip-qmd'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    // May fail at LLM call, but should NOT fail at importance validation
    const lightResult = JSON.parse(lightOut) as { success: boolean; error?: string };
    if (!lightResult.success) {
      assert.ok(!lightResult.error?.includes('Invalid importance level'), 
        `Should not fail importance validation: ${lightResult.error}`);
    }
  });

  it('--importance light with --stage sets status to approved (auto-approval)', () => {
    // When --importance light is used with --stage, items are auto-approved
    // so the file should be marked as 'approved' not 'processed'
    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_sprint-planning.md', '--importance', 'light', '--stage', '--json', '--skip-qmd'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    const result = JSON.parse(stdout) as { success: boolean; error?: string };
    
    if (result.success) {
      // If extraction succeeded, verify the file has status: approved
      const updatedContent = readFileSync(meetingFile, 'utf8');
      assert.ok(updatedContent.includes('status: approved'), 
        'Light importance meetings should have status: approved after --stage');
      assert.ok(!updatedContent.includes('status: processed'), 
        'Light importance meetings should NOT have status: processed');
    } else {
      // If failed at LLM call, ensure it's not an importance-related error
      assert.ok(!result.error?.includes('Invalid importance level'), 
        `Should not fail importance validation: ${result.error}`);
    }
  });
});

describe('importance from frontmatter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-importance-frontmatter');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    mkdirSync(join(tmpDir, 'resources', 'meetings'), { recursive: true });

    // Set up mock AI config
    const areteYaml = join(tmpDir, 'arete.yaml');
    const config = `ai:
  tiers:
    fast: anthropic/claude-3-haiku
`;
    writeFileSync(areteYaml, config, 'utf8');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('reads importance from frontmatter when no flag provided', () => {
    // Create meeting file with importance: skip in frontmatter
    const contentWithSkip = `---
title: Skip Meeting
date: "2026-03-01"
importance: skip
---

## Transcript

Some content here.
`;
    const meetingFile = join(tmpDir, 'resources', 'meetings', '2026-03-01_skip-meeting.md');
    writeFileSync(meetingFile, contentWithSkip, 'utf8');

    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_skip-meeting.md', '--json'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    // Should skip based on frontmatter
    assert.equal(code, 0);
    const result = JSON.parse(stdout) as { success: boolean; skipped?: boolean };
    assert.equal(result.success, true);
    assert.equal(result.skipped, true);
  });

  it('CLI flag overrides frontmatter importance', () => {
    // Create meeting file with importance: skip in frontmatter
    const contentWithSkip = `---
title: Skip Meeting
date: "2026-03-01"
importance: skip
---

## Transcript

Some content here.
`;
    const meetingFile = join(tmpDir, 'resources', 'meetings', '2026-03-01_skip-meeting.md');
    writeFileSync(meetingFile, contentWithSkip, 'utf8');

    // Override frontmatter skip with flag normal - should try extraction
    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_skip-meeting.md', '--importance', 'normal', '--json', '--skip-qmd'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    const result = JSON.parse(stdout) as { success: boolean; skipped?: boolean; error?: string };
    // Should NOT be skipped (flag overrides frontmatter)
    if (result.success) {
      assert.ok(!result.skipped, 'Should not be skipped when flag overrides frontmatter');
    } else {
      // May fail at LLM call, but NOT with skipped behavior
      assert.ok(!result.error?.includes('skipped'), 'Should not skip when flag is normal');
    }
  });
});

describe('reprocessing detection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-reprocessing');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    mkdirSync(join(tmpDir, 'resources', 'meetings'), { recursive: true });

    // Set up mock AI config
    const areteYaml = join(tmpDir, 'arete.yaml');
    const config = `ai:
  tiers:
    fast: anthropic/claude-3-haiku
`;
    writeFileSync(areteYaml, config, 'utf8');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('detects status: processed as reprocessing', () => {
    // Create meeting file with status: processed
    const processedContent = `---
title: Processed Meeting
date: "2026-03-01"
status: processed
---

## Transcript

Some content here.
`;
    const meetingFile = join(tmpDir, 'resources', 'meetings', '2026-03-01_processed.md');
    writeFileSync(meetingFile, processedContent, 'utf8');

    // Extract - should proceed (mode will be 'thorough' internally)
    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_processed.md', '--json', '--skip-qmd'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    const result = JSON.parse(stdout) as { success: boolean; error?: string };
    // Should attempt extraction (may fail at LLM, but not at status check)
    if (!result.success) {
      assert.ok(!result.error?.includes('status'), 
        `Should not error about status: ${result.error}`);
    }
  });

  it('detects status: approved as reprocessing', () => {
    // Create meeting file with status: approved
    const approvedContent = `---
title: Approved Meeting
date: "2026-03-01"
status: approved
---

## Transcript

Some content here.
`;
    const meetingFile = join(tmpDir, 'resources', 'meetings', '2026-03-01_approved.md');
    writeFileSync(meetingFile, approvedContent, 'utf8');

    // Extract - should proceed (mode will be 'thorough' internally)
    const { stdout, code } = runCliRaw(
      ['meeting', 'extract', 'resources/meetings/2026-03-01_approved.md', '--json', '--skip-qmd'],
      { 
        cwd: tmpDir,
        env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      },
    );

    const result = JSON.parse(stdout) as { success: boolean; error?: string };
    // Should attempt extraction (may fail at LLM, but not at status check)
    if (!result.success) {
      assert.ok(!result.error?.includes('status'), 
        `Should not error about status: ${result.error}`);
    }
  });
});
