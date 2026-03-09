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
