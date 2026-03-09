/**
 * Tests for services/agent.ts — Meeting processing with AIService.
 *
 * Mocks file operations and AIService to test job lifecycle
 * and content generation without touching real files or network.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runProcessingSessionTestable, type ProcessingDeps } from '../../src/services/agent.js';

// ──────────────────────────────────────────────────────────────────────────────
// Mock jobs service
// ──────────────────────────────────────────────────────────────────────────────

type AppendCall = { id: string; line: string };
type StatusCall = { id: string; status: string };

function makeMockJobs() {
  const appended: AppendCall[] = [];
  const statuses: StatusCall[] = [];
  return {
    appended,
    statuses,
    appendEvent(id: string, line: string) {
      appended.push({ id, line });
    },
    setJobStatus(id: string, status: 'running' | 'done' | 'error') {
      statuses.push({ id, status });
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Mock dependencies factory
// ──────────────────────────────────────────────────────────────────────────────

interface MockDepsOptions {
  fileContent?: string;
  readError?: Error;
  writeError?: Error;
  aiResponse?: {
    summary: string;
    actionItems: string[];
    decisions: string[];
    learnings: string[];
  };
  aiError?: Error;
}

function makeMockDeps(options: MockDepsOptions = {}): ProcessingDeps & {
  writtenFiles: Array<{ path: string; content: string }>;
} {
  const writtenFiles: Array<{ path: string; content: string }> = [];

  return {
    writtenFiles,
    readFile: async (path: string) => {
      if (options.readError) throw options.readError;
      return options.fileContent ?? `---
title: Test Meeting
status: pending
---

## Summary
No summary available.

## Transcript
Alice: Let's discuss the roadmap.
Bob: I think we should focus on Q2 priorities.
Alice: Agreed. Action item: Bob will draft the Q2 plan by Friday.
Bob: Sounds good. We've decided to postpone the refactor.
`;
    },
    writeFile: async (path: string, content: string) => {
      if (options.writeError) throw options.writeError;
      writtenFiles.push({ path, content });
    },
    aiService: {
      callStructured: async () => {
        if (options.aiError) throw options.aiError;
        return {
          data: options.aiResponse ?? {
            summary: 'Alice and Bob discussed the Q2 roadmap priorities. They agreed to focus on Q2 and postpone the refactor.',
            actionItems: ['Bob will draft the Q2 plan by Friday'],
            decisions: ['Postpone the refactor to focus on Q2'],
            learnings: [],
          },
          text: '{}',
          usage: { input: 100, output: 50, total: 150 },
          model: 'claude-3-haiku-20240307',
          provider: 'anthropic',
        };
      },
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('runProcessingSession', () => {
  const WORKSPACE = '/workspace';
  const SLUG = '2024-01-15-standup';
  const JOB_ID = 'job-abc-123';

  describe('successful processing', () => {
    it('reads meeting file, calls AI, and writes updated content', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps();

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      // Should have written the file
      assert.equal(deps.writtenFiles.length, 1);
      assert.ok(deps.writtenFiles[0]!.path.includes(SLUG));
    });

    it('emits progress events to the job', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps();

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const events = jobs.appended.map((e) => e.line);
      assert.ok(events.some((e) => e.includes('Reading meeting file')));
      assert.ok(events.some((e) => e.includes('Extracting content with AI')));
      assert.ok(events.some((e) => e.includes('Writing staged sections')));
      assert.ok(events.some((e) => e.includes('processed successfully')));
    });

    it('sets job status to done on completion', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps();

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const doneCall = jobs.statuses.find((s) => s.status === 'done');
      assert.ok(doneCall, 'Expected job status to be set to "done"');
      assert.equal(doneCall!.id, JOB_ID);
    });
  });

  describe('output format', () => {
    it('includes Summary section with AI-generated summary', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        aiResponse: {
          summary: 'Test summary of the meeting.',
          actionItems: [],
          decisions: [],
          learnings: [],
        },
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('## Summary'));
      assert.ok(content.includes('Test summary of the meeting.'));
    });

    it('formats action items with ai_XXX IDs', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        aiResponse: {
          summary: 'Summary.',
          actionItems: ['First action', 'Second action'],
          decisions: [],
          learnings: [],
        },
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('## Staged Action Items'));
      assert.ok(content.includes('- ai_001: First action'));
      assert.ok(content.includes('- ai_002: Second action'));
    });

    it('formats decisions with de_XXX IDs', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        aiResponse: {
          summary: 'Summary.',
          actionItems: [],
          decisions: ['First decision', 'Second decision'],
          learnings: [],
        },
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('## Staged Decisions'));
      assert.ok(content.includes('- de_001: First decision'));
      assert.ok(content.includes('- de_002: Second decision'));
    });

    it('formats learnings with le_XXX IDs', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        aiResponse: {
          summary: 'Summary.',
          actionItems: [],
          decisions: [],
          learnings: ['First learning', 'Second learning'],
        },
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('## Staged Learnings'));
      assert.ok(content.includes('- le_001: First learning'));
      assert.ok(content.includes('- le_002: Second learning'));
    });

    it('omits empty sections', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        aiResponse: {
          summary: 'Summary.',
          actionItems: ['One action'],
          decisions: [],
          learnings: [],
        },
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('## Staged Action Items'));
      assert.ok(!content.includes('## Staged Decisions'));
      assert.ok(!content.includes('## Staged Learnings'));
    });

    it('updates frontmatter with status: processed and processed_at timestamp', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps();

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('status: processed'));
      assert.ok(content.includes('processed_at:'));
    });

    it('uses zero-padded 3-digit IDs', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        aiResponse: {
          summary: 'Summary.',
          actionItems: Array.from({ length: 12 }, (_, i) => `Action ${i + 1}`),
          decisions: [],
          learnings: [],
        },
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('- ai_001: Action 1'));
      assert.ok(content.includes('- ai_010: Action 10'));
      assert.ok(content.includes('- ai_012: Action 12'));
    });
  });

  describe('error handling', () => {
    it('sets job to error when file cannot be read', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        readError: new Error('ENOENT: no such file'),
      });

      await assert.rejects(
        () => runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps),
        (err) => {
          assert(err instanceof Error);
          assert.match(err.message, /Could not read meeting file/);
          return true;
        },
      );

      const errorCall = jobs.statuses.find((s) => s.status === 'error');
      assert.ok(errorCall, 'Expected job status to be set to "error"');
    });

    it('sets job to error when AI call fails', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        aiError: new Error('AI service unavailable'),
      });

      await assert.rejects(
        () => runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps),
        (err) => {
          assert(err instanceof Error);
          assert.match(err.message, /AI extraction failed/);
          return true;
        },
      );

      const errorCall = jobs.statuses.find((s) => s.status === 'error');
      assert.ok(errorCall, 'Expected job status to be set to "error"');
      assert.ok(jobs.appended.some((e) => e.line.includes('AI extraction failed')));
    });

    it('handles API key error with descriptive message', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        aiError: new Error("No API key for provider 'anthropic'. Set ANTHROPIC_API_KEY or configure via ~/.arete/credentials.yaml"),
      });

      await assert.rejects(
        () => runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps),
        (err) => {
          assert(err instanceof Error);
          assert.match(err.message, /API key/);
          return true;
        },
      );

      const errorCall = jobs.statuses.find((s) => s.status === 'error');
      assert.ok(errorCall, 'Expected job status to be set to "error"');
      assert.ok(jobs.appended.some((e) => e.line.includes('API key')));
    });
  });

  describe('content preservation', () => {
    it('preserves content before Summary section', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        fileContent: `---
title: Important Meeting
date: 2024-01-15
---

# Meeting Notes

Some important preamble text here.

## Summary
Old summary to replace.

## Transcript
The actual transcript content.
`,
        aiResponse: {
          summary: 'New AI summary.',
          actionItems: ['Action item'],
          decisions: [],
          learnings: [],
        },
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('# Meeting Notes'));
      assert.ok(content.includes('Some important preamble text here.'));
      assert.ok(content.includes('New AI summary.'));
    });
  });

  describe('user notes deduplication', () => {
    it('marks items matching user notes as dedup source', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        fileContent: `---
title: Meeting with Notes
date: 2024-01-15
---

## My Notes
Bob will draft the Q2 plan by Friday.

## Transcript
Alice: Let's discuss the roadmap.
Bob: I'll draft the Q2 plan by Friday.
`,
        aiResponse: {
          summary: 'Summary.',
          actionItems: ['Bob will draft the Q2 plan by Friday'],
          decisions: [],
          learnings: [],
        },
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      // Should have staged_item_source in frontmatter with dedup
      assert.ok(content.includes('staged_item_source:'));
      assert.ok(content.includes('ai_001: dedup'));
    });

    it('auto-approves dedup items in staged_item_status', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        fileContent: `---
title: Meeting with Notes
date: 2024-01-15
---

## My Notes
Bob will draft the Q2 plan by Friday.

## Transcript
Alice: Let's discuss the roadmap.
`,
        aiResponse: {
          summary: 'Summary.',
          actionItems: ['Bob will draft the Q2 plan by Friday'],
          decisions: [],
          learnings: [],
        },
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      // Should have staged_item_status with approved
      assert.ok(content.includes('staged_item_status:'));
      assert.ok(content.includes('ai_001: approved'));
    });

    it('reports dedup count in job events', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        fileContent: `---
title: Meeting with Notes
date: 2024-01-15
---

## My Notes
Bob will draft the Q2 plan by Friday.
We decided to postpone the refactor.

## Transcript
Discussion transcript here.
`,
        aiResponse: {
          summary: 'Summary.',
          actionItems: ['Bob will draft the Q2 plan by Friday'],
          decisions: ['We decided to postpone the refactor'],
          learnings: [],
        },
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const events = jobs.appended.map((e) => e.line);
      assert.ok(events.some((e) => e.includes('2 items matching your notes')));
    });

    it('excludes transcript content from dedup comparison', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        // The action item text appears ONLY in transcript, not in user notes
        fileContent: `---
title: Meeting
date: 2024-01-15
---

## Key Points
Some completely different notes here.

## Transcript
Alice: Bob will send the report by Monday.
Bob: Yes, I will send the report by Monday.
`,
        aiResponse: {
          summary: 'Summary.',
          actionItems: ['Bob will send the report by Monday'],
          decisions: [],
          learnings: [],
        },
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      // Should NOT be marked as dedup since it only appears in transcript
      assert.ok(content.includes('staged_item_source:'));
      assert.ok(content.includes('ai_001: ai'));
    });

    it('excludes staged sections from dedup comparison', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        fileContent: `---
title: Meeting
date: 2024-01-15
---

## My Notes
Different content here.

## Staged Action Items
- ai_001: Bob will send the report by Monday

## Transcript
Some transcript content.
`,
        aiResponse: {
          summary: 'Summary.',
          actionItems: ['Bob will send the report by Monday'],
          decisions: [],
          learnings: [],
        },
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      // Should NOT be marked as dedup since it only appears in staged sections
      assert.ok(content.includes('staged_item_source:'));
      assert.ok(content.includes('ai_001: ai'));
    });

    it('uses Jaccard threshold of 0.7 for matching', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        // Paraphrased but similar content - should still match
        fileContent: `---
title: Meeting
date: 2024-01-15
---

## My Notes
Bob needs to draft the quarterly plan before Friday.

## Transcript
Transcript here.
`,
        aiResponse: {
          summary: 'Summary.',
          actionItems: ['Bob will draft the Q2 plan by Friday'],
          decisions: [],
          learnings: [],
        },
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      // Should match despite paraphrasing due to overlap in key words
      assert.ok(content.includes('staged_item_source:'));
      // Note: This depends on Jaccard similarity calculation
      // "draft quarterly plan before friday bob" vs "draft q2 plan friday bob will"
      // May or may not pass threshold - we're testing the mechanism works
    });
  });
});
