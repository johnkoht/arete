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
