/**
 * Tests for arete inbox add command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { readFileSync, existsSync, writeFileSync } from 'fs';

import { runCli, runCliRaw, createTmpDir, cleanupTmpDir, captureConsole } from '../helpers.js';
import { runInboxAdd } from '../../src/commands/inbox.js';
import { createServices, loadConfig, refreshQmdIndex } from '@arete/core';

describe('inbox add command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-inbox');
    runCli(['install', tmpDir, '--skip-qmd', '--json']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  describe('--title/--body mode', () => {
    it('creates markdown file with frontmatter', () => {
      const output = runCli([
        'inbox', 'add',
        '--title', 'Test Note',
        '--body', 'This is test content',
        '--source', 'manual',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(output) as { success: boolean; path: string; title: string; source: string };
      assert.equal(parsed.success, true);
      assert.equal(parsed.path, 'inbox/test-note.md');
      assert.equal(parsed.title, 'Test Note');
      assert.equal(parsed.source, 'manual');

      const filePath = join(tmpDir, 'inbox', 'test-note.md');
      assert.ok(existsSync(filePath), 'Inbox file should exist');

      const content = readFileSync(filePath, 'utf8');
      assert.ok(content.includes('title: "Test Note"'), 'Should have title in frontmatter');
      assert.ok(content.includes('source: "manual"'), 'Should have source in frontmatter');
      assert.ok(content.includes('status: unprocessed'), 'Should have unprocessed status');
      assert.ok(content.includes('This is test content'), 'Should contain body');
    });

    it('uses default source "manual" when not specified', () => {
      const output = runCli([
        'inbox', 'add',
        '--title', 'No Source',
        '--body', 'Content',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(output) as { source: string };
      assert.equal(parsed.source, 'manual');
    });

    it('uses "Untitled" when only --body is provided', () => {
      const output = runCli([
        'inbox', 'add',
        '--body', 'Just a thought',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(output) as { title: string; path: string };
      assert.equal(parsed.title, 'Untitled');
      assert.equal(parsed.path, 'inbox/untitled.md');
    });
  });

  describe('slug generation', () => {
    it('generates slug from title', () => {
      const output = runCli([
        'inbox', 'add',
        '--title', 'My Interesting Article About APIs',
        '--body', 'Content',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(output) as { path: string };
      assert.equal(parsed.path, 'inbox/my-interesting-article-about-apis.md');
    });

    it('handles special characters in title', () => {
      const output = runCli([
        'inbox', 'add',
        '--title', "What's Next? API v2.0!",
        '--body', 'Content',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(output) as { path: string };
      assert.ok(parsed.path.startsWith('inbox/'), 'Path should be in inbox');
      assert.ok(parsed.path.endsWith('.md'), 'Path should end with .md');

      // File should actually exist
      const filePath = join(tmpDir, parsed.path);
      assert.ok(existsSync(filePath), 'File should exist');
    });
  });

  describe('--file mode', () => {
    it('copies text file directly into inbox', () => {
      const srcFile = join(tmpDir, 'test-doc.txt');
      writeFileSync(srcFile, 'This is a text document');

      const output = runCli([
        'inbox', 'add',
        '--file', srcFile,
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(output) as { success: boolean; title: string; path: string };
      assert.equal(parsed.success, true);
      assert.equal(parsed.title, 'test-doc');

      const filePath = join(tmpDir, parsed.path);
      assert.ok(existsSync(filePath), 'Markdown file should exist in inbox');

      const content = readFileSync(filePath, 'utf8');
      assert.ok(content.includes('This is a text document'), 'Should contain original content');
      assert.ok(content.includes('type: note'), 'Should have note type');
    });

    it('copies binary file and creates companion .md', () => {
      const srcFile = join(tmpDir, 'report.pdf');
      writeFileSync(srcFile, 'fake-pdf-content');

      const output = runCli([
        'inbox', 'add',
        '--file', srcFile,
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(output) as { success: boolean; path: string };
      assert.equal(parsed.success, true);

      // Binary file should be in inbox
      assert.ok(existsSync(join(tmpDir, 'inbox', 'report.pdf')), 'PDF should be copied to inbox');

      // Companion .md should exist
      const companionPath = join(tmpDir, parsed.path);
      assert.ok(existsSync(companionPath), 'Companion .md should exist');

      const content = readFileSync(companionPath, 'utf8');
      assert.ok(content.includes('type: pdf'), 'Should have pdf type');
      assert.ok(content.includes('Companion file'), 'Should note it is a companion');
    });

    it('fails when file does not exist', () => {
      const { stdout, code } = runCliRaw([
        'inbox', 'add',
        '--file', '/nonexistent/file.pdf',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(stdout) as { success: boolean; error: string };
      assert.equal(parsed.success, false);
      assert.ok(parsed.error.includes('File not found'));
      assert.equal(code, 1);
    });
  });

  describe('JSON output', () => {
    it('includes all expected fields', () => {
      const output = runCli([
        'inbox', 'add',
        '--title', 'JSON Test',
        '--body', 'Content',
        '--source', 'agent-chat',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(output) as {
        success: boolean;
        path: string;
        title: string;
        source: string;
        qmd: { indexed: boolean; skipped: boolean };
      };

      assert.equal(parsed.success, true);
      assert.equal(parsed.path, 'inbox/json-test.md');
      assert.equal(parsed.title, 'JSON Test');
      assert.equal(parsed.source, 'agent-chat');
      assert.ok('qmd' in parsed, 'Should include qmd field');
      assert.equal(parsed.qmd.skipped, true, 'Should be skipped with --skip-qmd');
    });
  });

  describe('--url mode', () => {
    it('fetches URL and creates markdown file with extracted title', async () => {
      const fakeHtml = '<html><head><title>Great Article</title></head><body><h1>Great Article</h1><p>Some content here.</p></body></html>';
      const mockFetch = async (_url: string) => ({
        ok: true,
        status: 200,
        text: async () => fakeHtml,
      }) as unknown as Response;

      // Use runInboxAdd directly with mock deps
      const origCwd = process.cwd();
      process.chdir(tmpDir);
      try {
        const { stdout } = await captureConsole(() =>
          runInboxAdd(
            { url: 'https://example.com/article', skipQmd: true, json: true },
            {
              createServices,
              loadConfig,
              refreshQmdIndex,
              fetchFn: mockFetch as typeof fetch,
            },
          ),
        );

        const parsed = JSON.parse(stdout) as { success: boolean; title: string; source: string; path: string };
        assert.equal(parsed.success, true);
        assert.equal(parsed.title, 'Great Article');
        assert.equal(parsed.source, 'https://example.com/article');
        assert.ok(parsed.path.startsWith('inbox/'));

        // Verify file exists and has correct content
        const filePath = join(tmpDir, parsed.path);
        assert.ok(existsSync(filePath), 'File should exist');

        const content = readFileSync(filePath, 'utf8');
        assert.ok(content.includes('type: article'), 'Should have article type');
        assert.ok(content.includes('source: "https://example.com/article"'), 'Should have URL as source');
        assert.ok(content.includes('Some content here'), 'Should have extracted body content');
      } finally {
        process.chdir(origCwd);
      }
    });

    it('allows --url with --title override', async () => {
      const fakeHtml = '<html><head><title>Original</title></head><body><p>Content</p></body></html>';
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        text: async () => fakeHtml,
      }) as unknown as Response;

      const origCwd = process.cwd();
      process.chdir(tmpDir);
      try {
        const { stdout } = await captureConsole(() =>
          runInboxAdd(
            { url: 'https://example.com', title: 'Custom Title', skipQmd: true, json: true },
            {
              createServices,
              loadConfig,
              refreshQmdIndex,
              fetchFn: mockFetch as typeof fetch,
            },
          ),
        );

        const parsed = JSON.parse(stdout) as { title: string };
        assert.equal(parsed.title, 'Custom Title');
      } finally {
        process.chdir(origCwd);
      }
    });
  });

  describe('mode validation', () => {
    it('rejects --url combined with --file', () => {
      const srcFile = join(tmpDir, 'test.txt');
      writeFileSync(srcFile, 'content');

      const { stdout, code } = runCliRaw([
        'inbox', 'add',
        '--url', 'https://example.com',
        '--file', srcFile,
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(stdout) as { success: boolean; error: string };
      assert.equal(parsed.success, false);
      assert.ok(parsed.error.includes('Use only one of'));
      assert.equal(code, 1);
    });

    it('rejects --url --file --title combined', () => {
      const srcFile = join(tmpDir, 'test.txt');
      writeFileSync(srcFile, 'content');

      const { stdout, code } = runCliRaw([
        'inbox', 'add',
        '--url', 'https://example.com',
        '--file', srcFile,
        '--title', 'Something',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(stdout) as { success: boolean; error: string };
      assert.equal(parsed.success, false);
      assert.ok(parsed.error.includes('Use only one of'));
      assert.equal(code, 1);
    });
  });

  describe('error handling', () => {
    it('fails when no input mode provided', () => {
      const { stdout, code } = runCliRaw([
        'inbox', 'add',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(stdout) as { success: boolean; error: string };
      assert.equal(parsed.success, false);
      assert.ok(parsed.error.includes('Provide'));
      assert.equal(code, 1);
    });

    it('fails when not in workspace', () => {
      const nonWorkspaceDir = createTmpDir('arete-test-non-workspace');
      try {
        const { stdout, code } = runCliRaw([
          'inbox', 'add',
          '--title', 'Test',
          '--body', 'Content',
          '--skip-qmd', '--json',
        ], { cwd: nonWorkspaceDir });

        const parsed = JSON.parse(stdout) as { success: boolean; error: string };
        assert.equal(parsed.success, false);
        assert.ok(parsed.error.includes('Not in an Areté workspace'));
        assert.equal(code, 1);
      } finally {
        cleanupTmpDir(nonWorkspaceDir);
      }
    });
  });
});
