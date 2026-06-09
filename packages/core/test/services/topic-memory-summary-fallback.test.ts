/**
 * Phase 1 §c — topic-memory.refreshAllFromSources reads the
 * per-meeting summary file when present and falls back to transcript
 * when absent.
 *
 * AC1.3 verifies both paths; AC1.4 (input-token reduction) is a runtime
 * telemetry check rather than a unit assertion.
 *
 * Per services/LEARNINGS.md: real fs + FileStorageAdapter, no mocks for
 * memory operations.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { TopicMemoryService } from '../../src/services/topic-memory.js';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { renderTopicPage } from '../../src/models/topic-page.js';
import type { TopicPage } from '../../src/models/topic-page.js';
import type { WorkspacePaths } from '../../src/models/workspace.js';

function makePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, 'arete.yaml'),
    ideConfig: join(root, '.cursor'),
    rules: join(root, '.cursor', 'rules'),
    agentSkills: join(root, '.agents', 'skills'),
    tools: join(root, '.cursor', 'tools'),
    integrations: join(root, '.cursor', 'integrations'),
    context: join(root, 'context'),
    memory: join(root, '.arete', 'memory'),
    now: join(root, 'now'),
    goals: join(root, 'goals'),
    projects: join(root, 'projects'),
    resources: join(root, 'resources'),
    people: join(root, 'people'),
    credentials: join(root, '.credentials'),
    templates: join(root, 'templates'),
  };
}

function writeFile(root: string, relativePath: string, content: string): void {
  const fullPath = join(root, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
}

const MEETING_FIXTURE = `---
title: "Cover Whale sync"
date: 2026-04-20
attendees:
  - { name: "Jane Doe", email: "jane@reserv.com" }
topics: [cover-whale-templates]
---

# Cover Whale sync

## Transcript

ANTHONY: There were three thousand words of rambling transcript about cover whale templates here. Lots of side topics, irrelevant detours, signal mixed with noise.
JOHN: Yeah, but at the end we shipped v2.
`;

const SUMMARY_BODY_MARKER = 'SUMMARY-DERIVED-CONTENT-MARKER';
const TRANSCRIPT_BODY_MARKER = 'three thousand words of rambling';

function summaryFileContent(meetingDate: string, sourceBody: string): string {
  // Mirror the writer's stamping (content_hash + extraction_version) so
  // the topic-memory loader treats this as a real summary.
  // The hash isn't validated by the loader at read time (it's only used
  // for write-time idempotency in summary-writer), so we put a stable
  // placeholder.
  return `---
source_path: resources/meetings/${meetingDate}-cw-sync.md
source_type: meeting
date: ${meetingDate}
topics:
  - cover-whale-templates
content_hash: 'aaaaaaaaaaaaaaaa'
extraction_version: '1'
---

# CW sync

> Auto-generated summary.

## What happened

${SUMMARY_BODY_MARKER}: shipped v2 of cover-whale-templates with 3 adjusters.

## What was decided

- Approve [[cover-whale-templates]] v2 launch.

## What's next

- John: schedule kickoff with adjusters.

## Open questions

## FYI

## Things mentioned but not actioned
`;
}

function seedTopicPage(): TopicPage {
  return {
    frontmatter: {
      topic_slug: 'cover-whale-templates',
      status: 'active',
      first_seen: '2026-03-01',
      last_refreshed: '2026-04-15',
      sources_integrated: [],
    },
    sections: { 'Current state': 'Templates are in pilot.' },
  };
}

let tmpDir: string;
let paths: WorkspacePaths;
let storage: FileStorageAdapter;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'arete-topic-summary-fallback-'));
  paths = makePaths(tmpDir);
  storage = new FileStorageAdapter();

  writeFile(
    tmpDir,
    '.arete/memory/topics/cover-whale-templates.md',
    renderTopicPage(seedTopicPage()),
  );
  writeFile(tmpDir, 'resources/meetings/2026-04-20-cw-sync.md', MEETING_FIXTURE);
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe('topic-memory: summary-first integration with transcript fallback', () => {
  it('feeds summary body to LLM when summary file exists (AC1.3 happy path)', async () => {
    // Seed a summary file alongside the meeting.
    writeFile(
      tmpDir,
      '.arete/memory/summaries/meetings/2026-04-20-cw-sync.md',
      summaryFileContent('2026-04-20', MEETING_FIXTURE),
    );

    const svc = new TopicMemoryService(storage);
    let promptSeen = '';
    const callLLM = async (prompt: string) => {
      promptSeen = prompt;
      return JSON.stringify({
        updated_sections: { 'Current state': 'Updated from summary.' },
        new_change_log_entry: 'integrated cover-whale v2 launch',
      });
    };

    const result = await svc.refreshAllFromSources(paths, {
      today: '2026-04-29',
      slugs: ['cover-whale-templates'],
      callLLM,
      skipLock: true,
    });

    assert.equal(result.topics[0].integrated, 1);
    // Summary marker should be in the prompt; transcript marker should NOT.
    assert.match(promptSeen, new RegExp(SUMMARY_BODY_MARKER));
    assert.doesNotMatch(promptSeen, new RegExp(TRANSCRIPT_BODY_MARKER));
  });

  it('feeds transcript body to LLM when no summary exists (AC1.3 fallback)', async () => {
    // No summary written.
    const svc = new TopicMemoryService(storage);
    let promptSeen = '';
    const callLLM = async (prompt: string) => {
      promptSeen = prompt;
      return JSON.stringify({
        updated_sections: { 'Current state': 'Updated from transcript.' },
        new_change_log_entry: 'integrated transcript',
      });
    };

    const result = await svc.refreshAllFromSources(paths, {
      today: '2026-04-29',
      slugs: ['cover-whale-templates'],
      callLLM,
      skipLock: true,
    });

    assert.equal(result.topics[0].integrated, 1);
    assert.match(promptSeen, new RegExp(TRANSCRIPT_BODY_MARKER));
    assert.doesNotMatch(promptSeen, new RegExp(SUMMARY_BODY_MARKER));
  });

  it('idempotency hash uses transcript even when summary is fed to LLM', async () => {
    // First run with summary, second run with summary rewritten — same
    // transcript means second run is skipped (hash on transcript holds).
    writeFile(
      tmpDir,
      '.arete/memory/summaries/meetings/2026-04-20-cw-sync.md',
      summaryFileContent('2026-04-20', MEETING_FIXTURE),
    );

    const svc = new TopicMemoryService(storage);
    let llmCallCount = 0;
    const callLLM = async () => {
      llmCallCount++;
      return JSON.stringify({
        updated_sections: { 'Current state': 'updated' },
        new_change_log_entry: 'integrated',
      });
    };

    await svc.refreshAllFromSources(paths, {
      today: '2026-04-29',
      slugs: ['cover-whale-templates'],
      callLLM,
      skipLock: true,
    });
    assert.equal(llmCallCount, 1);

    // Rewrite the summary file (simulating a re-summary with new content)
    // — same transcript still hashes the same, so the second run skips.
    writeFile(
      tmpDir,
      '.arete/memory/summaries/meetings/2026-04-20-cw-sync.md',
      summaryFileContent('2026-04-20', MEETING_FIXTURE).replace(
        SUMMARY_BODY_MARKER,
        'COMPLETELY-REWRITTEN-SUMMARY',
      ),
    );

    await svc.refreshAllFromSources(paths, {
      today: '2026-04-30',
      slugs: ['cover-whale-templates'],
      callLLM,
      skipLock: true,
    });
    assert.equal(llmCallCount, 1, 'summary rewrite should not bust topic-page idempotency');
  });
});
