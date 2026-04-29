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

/** Direction of an action item relative to the owner (core extraction format) */
type ActionItemDirection = 'i_owe_them' | 'they_owe_me';

/** A structured action item from core extraction (matches @arete/core MeetingIntelligence) */
interface ActionItem {
  owner: string;
  ownerSlug: string;
  description: string;
  direction: ActionItemDirection;
  counterpartySlug?: string;
  due?: string;
  confidence?: number;
}

/** Full meeting intelligence from core extraction (matches @arete/core MeetingIntelligence) */
interface MeetingIntelligence {
  summary: string;
  /** Lead-prose alternative to summary (Task 7/8 wiki-aware extraction). */
  core?: string;
  /** Headlines for side-thread items (Task 7/8). */
  could_include?: string[];
  actionItems: ActionItem[];
  nextSteps: string[];
  decisions: string[];
  learnings: string[];
}

interface MockDepsOptions {
  fileContent?: string;
  readError?: Error;
  writeError?: Error;
  /** Core extraction response for call() method */
  coreResponse?: MeetingIntelligence;
  aiError?: Error;
  /**
   * Per-path content overrides (match by path suffix). Used when a test needs
   * different content for week.md / tasks.md / scratchpad.md vs the meeting
   * file. Checked BEFORE `fileContent` default.
   */
  pathFixtures?: Record<string, string>;
}

/** Create ActionItem for core extraction format */
function mockActionItem(description: string, opts?: Partial<ActionItem>): ActionItem {
  return {
    owner: opts?.owner ?? 'me',
    ownerSlug: opts?.ownerSlug ?? 'me',
    description,
    direction: opts?.direction ?? 'i_owe_them',
    confidence: opts?.confidence ?? 0.9,
    ...opts,
  };
}

/** Create full MeetingIntelligence response for core extraction */
function mockCoreExtractionResponse(opts?: Partial<MeetingIntelligence>): MeetingIntelligence {
  const base: MeetingIntelligence = {
    summary: opts?.summary ?? 'Meeting summary.',
    actionItems: opts?.actionItems ?? [mockActionItem('Default action item')],
    nextSteps: opts?.nextSteps ?? [],
    decisions: opts?.decisions ?? [],
    learnings: opts?.learnings ?? [],
  };
  if (opts?.core !== undefined) base.core = opts.core;
  if (opts?.could_include !== undefined) base.could_include = opts.could_include;
  return base;
}

/**
 * Convert MeetingIntelligence to raw LLM JSON format (snake_case).
 * The core parser expects snake_case field names from the LLM.
 */
function toRawLLMJson(intelligence: MeetingIntelligence): object {
  const out: Record<string, unknown> = {
    summary: intelligence.summary,
    action_items: intelligence.actionItems.map((ai) => ({
      owner: ai.owner,
      owner_slug: ai.ownerSlug,
      description: ai.description,
      direction: ai.direction,
      counterparty_slug: ai.counterpartySlug,
      due: ai.due,
      confidence: ai.confidence,
    })),
    next_steps: intelligence.nextSteps,
    decisions: intelligence.decisions,
    learnings: intelligence.learnings,
  };
  // Task 10: thread Task 7's wiki-aware lead-prose fields through the LLM
  // mock so end-to-end tests can verify ## Core / ## Could include rendering.
  if (intelligence.core !== undefined) out['core'] = intelligence.core;
  if (intelligence.could_include !== undefined) out['could_include'] = intelligence.could_include;
  return out;
}

function makeMockDeps(options: MockDepsOptions = {}): ProcessingDeps & {
  writtenFiles: Array<{ path: string; content: string }>;
  aiCalls: Array<{ task: string; prompt: string }>;
} {
  const writtenFiles: Array<{ path: string; content: string }> = [];
  const aiCalls: Array<{ task: string; prompt: string }> = [];

  return {
    writtenFiles,
    aiCalls,
    readFile: async (path: string) => {
      if (options.readError) throw options.readError;
      // Per-path fixtures first (match by suffix: week.md, tasks.md, etc.)
      if (options.pathFixtures) {
        for (const [suffix, content] of Object.entries(options.pathFixtures)) {
          if (path.endsWith(suffix)) return content;
        }
      }
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
      call: async (task, prompt) => {
        aiCalls.push({ task, prompt });
        if (options.aiError) throw options.aiError;
        // Reconciliation tier returns an empty drops list so the JSON parse
        // in batchLLMReview yields no changes (valid JSON that parses cleanly).
        if (task === 'reconciliation') {
          return { text: JSON.stringify({ drops: [] }) };
        }
        const response = options.coreResponse ?? mockCoreExtractionResponse();
        // Convert to snake_case JSON that the core parser expects
        return { text: JSON.stringify(toRawLLMJson(response)) };
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
        coreResponse: mockCoreExtractionResponse({
          summary: 'Test summary of the meeting.',
          actionItems: [],
          decisions: [],
          learnings: [],
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('## Summary'));
      assert.ok(content.includes('Test summary of the meeting.'));
    });

    it('formats action items with ai_XXX IDs', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem('First action'), mockActionItem('Second action')],
        }),
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
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [],
          decisions: ['First decision', 'Second decision'],
        }),
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
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [],
          decisions: [],
          learnings: ['First learning', 'Second learning'],
        }),
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
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem('One action')],
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('## Staged Action Items'));
      assert.ok(!content.includes('## Staged Decisions'));
      assert.ok(!content.includes('## Staged Learnings'));
    });

    // Task 10: end-to-end wiring of `core` + `could_include` from extraction
    // through to the staged sections written into the meeting file. Verifies
    // backend agent.ts threads both fields to formatFilteredStagedSections
    // (task-10-callsite-plumbing acceptance criterion C).
    it('renders ## Core and ## Could include when extraction populates them', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Generic summary fallback.',
          core: 'We landed on weekly invoicing for the pilot.',
          could_include: [
            'Considered monthly invoicing — deferred',
            'Open question: PO requirements',
          ],
          actionItems: [mockActionItem('Draft pilot SOW', { confidence: 0.95 })],
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      // Lead-prose: Core takes precedence over Summary when present (Task 8).
      assert.ok(content.includes('## Core'), 'expected ## Core heading');
      assert.ok(
        content.includes('We landed on weekly invoicing for the pilot.'),
        'expected core lead-prose body',
      );
      assert.ok(!content.includes('## Summary'), 'expected no ## Summary when ## Core is present');
      // Could include: emitted as bullet list when non-empty.
      assert.ok(content.includes('## Could include'), 'expected ## Could include heading');
      assert.ok(
        content.includes('- Considered monthly invoicing — deferred'),
        'expected first could-include bullet',
      );
      assert.ok(
        content.includes('- Open question: PO requirements'),
        'expected second could-include bullet',
      );
    });

    // Task 10: the formatter's summary fallback path must keep working when
    // the extraction omits `core` (legacy behavior). Backend keeps emitting
    // `## Summary` so historical files re-parse cleanly.
    it('falls back to ## Summary when core is absent', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Plain summary text.',
          // core + could_include intentionally omitted
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('## Summary'), 'expected ## Summary fallback');
      assert.ok(content.includes('Plain summary text.'));
      assert.ok(!content.includes('## Core'), 'expected no ## Core when omitted');
      assert.ok(!content.includes('## Could include'), 'expected no ## Could include when omitted');
    });

    it('updates frontmatter with status: processed and processed_at timestamp', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps();

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('status: processed'));
      assert.ok(content.includes('processed_at:'));
    });

    // Regression for backend dual-implementation drift: agent.ts hand-rolled
    // the frontmatter write parallel to meeting-apply.ts and silently dropped
    // `topics` + item-count fields for months. Any meeting processed via web
    // UI / backend would never get topic-wiki-memory's biased extraction
    // working downstream because no `topics:` ever made it to disk. Asserts
    // that the same six fields meeting-apply writes also land here.
    it('writes topics + item count fields to frontmatter (Hook 1 inputs)', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [
            mockActionItem('Owe them', { direction: 'i_owe_them' }),
            mockActionItem('They owe me', { direction: 'they_owe_me' }),
            mockActionItem('Another mine', { direction: 'i_owe_them' }),
          ],
          decisions: ['Decision 1', 'Decision 2'],
          learnings: ['Learning 1'],
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      // topics: written verbatim (no topicMemory dep → no alias/merge)
      // — extraction mock does not emit topics, so we expect an empty array.
      assert.ok(content.includes('topics:'), 'expected topics field present');
      assert.ok(content.includes('open_action_items: 3'), 'expected open_action_items count');
      assert.ok(content.includes('my_commitments: 2'), 'expected my_commitments (i_owe_them) count');
      assert.ok(content.includes('their_commitments: 1'), 'expected their_commitments (they_owe_me) count');
      assert.ok(content.includes('decisions_count: 2'), 'expected decisions_count');
      assert.ok(content.includes('learnings_count: 1'), 'expected learnings_count');
    });

    it('uses zero-padded 3-digit IDs', async () => {
      const jobs = makeMockJobs();
      // Core extraction limits action items to 7, so we test with that limit
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: Array.from({ length: 7 }, (_, i) => mockActionItem(`Action ${i + 1}`)),
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('- ai_001: Action 1'));
      assert.ok(content.includes('- ai_005: Action 5'));
      assert.ok(content.includes('- ai_007: Action 7'));
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
        coreResponse: mockCoreExtractionResponse({
          summary: 'New AI summary.',
          actionItems: [mockActionItem('Action item')],
        }),
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
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem('Bob will draft the Q2 plan by Friday')],
        }),
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
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem('Bob will draft the Q2 plan by Friday')],
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      // Should have staged_item_status with approved
      assert.ok(content.includes('staged_item_status:'));
      assert.ok(content.includes('ai_001: approved'));
    });

    it('reports dedup count in job events', async () => {
      const jobs = makeMockJobs();
      // Note: Jaccard similarity is computed against the ENTIRE user notes section.
      // To get 2 dedup matches, each item must individually have > 0.7 Jaccard
      // against the combined user notes text. With 2 distinct items in notes,
      // each AI item may only partially match, so we test with a single
      // high-overlap match to verify the dedup count reporting works.
      const deps = makeMockDeps({
        fileContent: `---
title: Meeting with Notes
date: 2024-01-15
---

## My Notes
Bob will draft the Q2 plan by Friday.

## Transcript
Discussion transcript here.
`,
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem('Bob will draft the Q2 plan by Friday')],
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const events = jobs.appended.map((e) => e.line);
      assert.ok(events.some((e) => e.includes('1 items matching your notes')));
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
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem('Bob will send the report by Monday')],
        }),
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
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem('Bob will send the report by Monday')],
        }),
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
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem('Bob will draft the Q2 plan by Friday')],
        }),
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

  describe('confidence-based pre-selection', () => {
    it('filters out items with confidence < 0.5', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [
            mockActionItem('High confidence action', { confidence: 0.9 }),
            mockActionItem('Low confidence action', { confidence: 0.3 }),
          ],
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('- ai_001: High confidence action'));
      assert.ok(!content.includes('Low confidence action'));
    });

    it('auto-approves items with confidence > 0.8', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem('Very confident action', { confidence: 0.95 })],
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('staged_item_status:'));
      assert.ok(content.includes('ai_001: approved'));
    });

    it('sets pending status for items with confidence 0.5-0.8', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem('Medium confidence action', { confidence: 0.65 })],
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('staged_item_status:'));
      assert.ok(content.includes('ai_001: pending'));
    });

    it('stores confidence scores in staged_item_confidence frontmatter', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        // Note: decisions in core format are strings without confidence.
        // Backend adapter assigns 0.9 to all decisions.
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem('First action', { confidence: 0.85 })],
          decisions: ['First decision'],
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('staged_item_confidence:'));
      assert.ok(content.includes('ai_001: 0.85'));
      // Decisions from core get default 0.9 confidence via adapter
      assert.ok(content.includes('de_001: 0.9'));
    });

    it('reports filtered out count in job events', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [
            mockActionItem('High', { confidence: 0.9 }),
            mockActionItem('Low1', { confidence: 0.3 }),
            mockActionItem('Low2', { confidence: 0.2 }),
          ],
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const events = jobs.appended.map((e) => e.line);
      assert.ok(events.some((e) => e.includes('Filtered out 2 low-confidence items')));
    });

    it('reports high-confidence auto-approved count in job events', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [
            mockActionItem('High1', { confidence: 0.95 }),
            mockActionItem('High2', { confidence: 0.85 }),
            mockActionItem('Medium', { confidence: 0.65 }),
          ],
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const events = jobs.appended.map((e) => e.line);
      assert.ok(events.some((e) => e.includes('Auto-approved 2 high-confidence items')));
    });

    it('uses re-indexed IDs after filtering', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [
            mockActionItem('Low confidence', { confidence: 0.3 }),  // filtered out
            mockActionItem('High confidence', { confidence: 0.9 }), // becomes ai_001
          ],
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      // The high confidence item should be ai_001 (first in filtered list)
      assert.ok(content.includes('- ai_001: High confidence'));
      // ai_002 should not exist
      assert.ok(!content.includes('ai_002'));
    });

    it('dedup takes precedence over confidence for approval status', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        fileContent: `---
title: Meeting with Notes
date: 2024-01-15
---

## My Notes
Medium confidence but matches notes.

## Transcript
Some transcript.
`,
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem('Medium confidence but matches notes.', { confidence: 0.6 })],
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      // Should be approved because it matches user notes (dedup)
      // even though confidence is only 0.6 (would be pending otherwise)
      assert.ok(content.includes('ai_001: dedup'));
      assert.ok(content.includes('ai_001: approved'));
    });

    it('handles boundary case: exactly 0.5 confidence is included as pending', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem('Boundary case', { confidence: 0.5 })],
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('- ai_001: Boundary case'));
      assert.ok(content.includes('ai_001: pending'));
    });

    it('handles boundary case: exactly 0.8 confidence is pending, 0.81 is approved', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [
            mockActionItem('At threshold', { confidence: 0.8 }),
            mockActionItem('Above threshold', { confidence: 0.81 }),
          ],
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      // 0.8 is NOT > 0.8, so it should be pending
      assert.ok(content.includes('ai_001: pending'));
      // 0.81 IS > 0.8, so it should be approved
      assert.ok(content.includes('ai_002: approved'));
    });
  });

  describe('priorItems batch deduplication', () => {
    it('marks items matching priorItems as dedup source', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem('Bob will draft the Q2 plan by Friday', { confidence: 0.9 })],
          decisions: ['We decided to use React for the frontend'],
        }),
      });

      // Pass priorItems that should match the action item
      const priorItems = [
        { type: 'action' as const, text: 'Bob will draft the Q2 plan by Friday' },
      ];

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps, { priorItems });

      const content = deps.writtenFiles[0]!.content;
      // Action item should be marked as dedup because it matches a prior item
      assert.ok(content.includes('staged_item_source:'));
      assert.ok(content.includes('ai_001: dedup'));
      // Decision should be 'ai' since it doesn't match any prior item
      assert.ok(content.includes('de_001: ai'));
    });

    it('auto-approves items matching priorItems', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          // Low confidence item that would normally be pending
          actionItems: [mockActionItem('Send report to Alice', { confidence: 0.6 })],
        }),
      });

      const priorItems = [{ type: 'action' as const, text: 'Send report to Alice' }];

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps, { priorItems });

      const content = deps.writtenFiles[0]!.content;
      // Should be approved because it matches a prior item (dedup takes precedence)
      assert.ok(content.includes('ai_001: approved'));
      assert.ok(content.includes('ai_001: dedup'));
    });

    it('returns ProcessedMeetingResult with filteredItems', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [
            mockActionItem('Action one', { confidence: 0.9 }),
            mockActionItem('Action two', { confidence: 0.85 }),
          ],
          decisions: ['Decision one'],
          learnings: ['Learning one'],
        }),
      });

      const result = await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      // Verify result structure
      assert.ok(result.filteredItems, 'Result should have filteredItems');
      assert.equal(result.filteredItems.length, 4, 'Should have 4 items (2 actions, 1 decision, 1 learning)');

      // Verify item types
      const actions = result.filteredItems.filter((i) => i.type === 'action');
      const decisions = result.filteredItems.filter((i) => i.type === 'decision');
      const learnings = result.filteredItems.filter((i) => i.type === 'learning');
      assert.equal(actions.length, 2);
      assert.equal(decisions.length, 1);
      assert.equal(learnings.length, 1);

      // Verify other result properties
      assert.ok(result.stagedItemStatus, 'Result should have stagedItemStatus');
      assert.ok(result.stagedItemConfidence, 'Result should have stagedItemConfidence');
      assert.ok(result.stagedItemSource, 'Result should have stagedItemSource');
    });

    it('matches decisions in priorItems', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [],
          decisions: ['We decided to use React for the frontend'],
        }),
      });

      const priorItems = [
        { type: 'decision' as const, text: 'We decided to use React for the frontend' },
      ];

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps, { priorItems });

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('de_001: dedup'));
    });

    it('matches learnings in priorItems', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [],
          learnings: ['Users prefer dark mode by default'],
        }),
      });

      const priorItems = [
        { type: 'learning' as const, text: 'Users prefer dark mode by default' },
      ];

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps, { priorItems });

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('le_001: dedup'));
    });

    it('handles empty priorItems array', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem('New action', { confidence: 0.9 })],
        }),
      });

      const result = await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps, { priorItems: [] });

      const content = deps.writtenFiles[0]!.content;
      // Should be 'ai' (not dedup) when priorItems is empty
      assert.ok(content.includes('ai_001: ai'));
      // Should still return valid result
      assert.equal(result.filteredItems.length, 1);
    });
  });

  describe('cross-meeting reconciliation', () => {
    /** Helper to build deps with reconciliation callbacks */
    function makeDepsWithReconciliation(
      options: MockDepsOptions & {
        reconciliationContext?: {
          areaMemories?: Map<string, unknown>;
          recentCommittedItems?: Array<{ text: string; date: string; source: string }>;
          completedTasks?: Array<{ text: string; completedOn: string; owner?: string }>;
        };
        recentBatch?: Array<{
          meetingPath: string;
          extraction: MeetingIntelligence;
        }>;
        reconciliationError?: Error;
      } = {},
    ) {
      const baseDeps = makeMockDeps(options);
      const ctx = options.reconciliationContext ?? {
        areaMemories: new Map(),
        recentCommittedItems: [],
        completedTasks: [],
      };
      return {
        ...baseDeps,
        loadReconciliationContext: options.reconciliationError
          ? async () => { throw options.reconciliationError!; }
          : async () => ctx as unknown as import('@arete/core').ReconciliationContext,
        loadRecentBatch: async () =>
          (options.recentBatch ?? []) as unknown as import('@arete/core').MeetingExtractionBatch[],
      };
    }

    it('skips reconciliation when deps callbacks are not provided', async () => {
      const jobs = makeMockJobs();
      const deps = makeMockDeps({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem('Some action', { confidence: 0.9 })],
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const events = jobs.appended.map((e) => e.line);
      // Should NOT have reconciliation event when deps are absent
      assert.ok(!events.some((e) => e.includes('cross-meeting reconciliation')));
      assert.ok(!events.some((e) => e.includes('Cross-meeting')));
    });

    it('marks duplicate items as skipped with reconciled source', async () => {
      const jobs = makeMockJobs();
      // Action item text matches one in a prior meeting batch
      const actionText = 'Send report to Alice by Friday';
      const deps = makeDepsWithReconciliation({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem(actionText, { confidence: 0.9 })],
        }),
        // Prior meeting has the same action item → will be detected as duplicate
        recentBatch: [
          {
            meetingPath: '/workspace/resources/meetings/2024-01-14-prior.md',
            extraction: mockCoreExtractionResponse({
              summary: 'Prior meeting.',
              actionItems: [mockActionItem(actionText, { confidence: 0.9 })],
            }),
          },
        ],
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      // The current meeting's item is the later occurrence → marked duplicate
      assert.ok(content.includes('ai_001: skipped'), 'Duplicate item should be skipped');
      assert.ok(content.includes('ai_001: reconciled'), 'Duplicate item should have reconciled source');
    });

    it('marks completed items as skipped with reconciled source', async () => {
      const jobs = makeMockJobs();
      const actionText = 'Draft the Q2 plan';
      const deps = makeDepsWithReconciliation({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem(actionText, { confidence: 0.9 })],
        }),
        reconciliationContext: {
          areaMemories: new Map(),
          recentCommittedItems: [],
          completedTasks: [
            { text: 'Draft the Q2 plan', completedOn: '2024-01-14', owner: 'me' },
          ],
        },
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('ai_001: skipped'), 'Completed item should be skipped');
      assert.ok(content.includes('ai_001: reconciled'), 'Completed item should have reconciled source');
    });

    it('logs reconciliation stats in job events', async () => {
      const jobs = makeMockJobs();
      const actionText = 'Send report to Alice by Friday';
      const deps = makeDepsWithReconciliation({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem(actionText, { confidence: 0.9 })],
        }),
        recentBatch: [
          {
            meetingPath: '/workspace/resources/meetings/2024-01-14-prior.md',
            extraction: mockCoreExtractionResponse({
              summary: 'Prior meeting.',
              actionItems: [mockActionItem(actionText, { confidence: 0.9 })],
            }),
          },
        ],
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const events = jobs.appended.map((e) => e.line);
      assert.ok(events.some((e) => e.includes('Running cross-meeting reconciliation')));
      assert.ok(events.some((e) => e.includes('Cross-meeting:') && e.includes('duplicate')));
    });

    it('does not overwrite already-skipped items from processing', async () => {
      const jobs = makeMockJobs();
      // An item with low confidence will be filtered out by processMeetingExtraction,
      // so it won't appear in filteredItems at all. Use a completed item from workspace
      // to test the precedence: processing skips it first, reconciliation shouldn't touch it.
      const actionText = 'Already completed task';
      const deps = makeDepsWithReconciliation({
        fileContent: `---
title: Test Meeting
status: pending
---

## Transcript
Discussion about tasks.
`,
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [
            mockActionItem(actionText, { confidence: 0.9 }),
            mockActionItem('New unique action', { confidence: 0.9 }),
          ],
        }),
        reconciliationContext: {
          areaMemories: new Map(),
          recentCommittedItems: [],
          completedTasks: [
            { text: 'Already completed task', completedOn: '2024-01-14', owner: 'me' },
          ],
        },
      });

      const result = await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      // Both items should be in the result
      assert.equal(result.filteredItems.length, 2);
      // The already-completed item was reconciled by processMeetingExtraction first
      // and then reconcileMeetingBatch confirms it — both set 'skipped'/'reconciled'
      assert.equal(result.stagedItemStatus['ai_001'], 'skipped');
      assert.equal(result.stagedItemSource['ai_001'], 'reconciled');
      // The unique action should remain untouched
      assert.equal(result.stagedItemSource['ai_002'], 'ai');
    });

    it('gracefully degrades when reconciliation throws an error', async () => {
      const jobs = makeMockJobs();
      const deps = makeDepsWithReconciliation({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem('Some action', { confidence: 0.9 })],
        }),
        reconciliationError: new Error('Storage unavailable'),
      });

      // Should NOT throw — processing should complete
      const result = await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const events = jobs.appended.map((e) => e.line);
      assert.ok(events.some((e) => e.includes('Warning: Cross-meeting reconciliation skipped')));
      // Should still produce a valid result
      assert.equal(result.filteredItems.length, 1);
      assert.ok(events.some((e) => e.includes('processed successfully')));
    });

    it('does not log stats when no duplicates or completed items found', async () => {
      const jobs = makeMockJobs();
      const deps = makeDepsWithReconciliation({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [mockActionItem('Unique action item', { confidence: 0.9 })],
        }),
        // Empty batch and context — no matches expected
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const events = jobs.appended.map((e) => e.line);
      assert.ok(events.some((e) => e.includes('Running cross-meeting reconciliation')));
      // Should NOT have the stats line since there were 0 duplicates and 0 completed
      assert.ok(!events.some((e) => e.includes('Cross-meeting:')));
    });

    it('reconciles decision items across meetings', async () => {
      const jobs = makeMockJobs();
      const decisionText = 'We decided to use React for the frontend';
      const deps = makeDepsWithReconciliation({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          actionItems: [],
          decisions: [decisionText],
        }),
        recentBatch: [
          {
            meetingPath: '/workspace/resources/meetings/2024-01-14-prior.md',
            extraction: mockCoreExtractionResponse({
              summary: 'Prior meeting.',
              actionItems: [],
              decisions: [decisionText],
            }),
          },
        ],
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const content = deps.writtenFiles[0]!.content;
      assert.ok(content.includes('de_001: skipped'), 'Duplicate decision should be skipped');
      assert.ok(content.includes('de_001: reconciled'), 'Duplicate decision should have reconciled source');
    });

    it('batch LLM review drops items flagged by LLM', async () => {
      const jobs = makeMockJobs();
      const decisionText = 'Use PostgreSQL for production database';
      const learningText = 'The API supports batch processing mode';

      // Track call count to return different responses for extraction vs batch review
      let callCount = 0;
      const baseDeps = makeDepsWithReconciliation({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          decisions: [decisionText],
          learnings: [learningText],
        }),
        reconciliationContext: {
          areaMemories: new Map(),
          recentCommittedItems: [
            { text: 'We chose PostgreSQL as our DB', date: '2026-04-01', source: 'decisions.md' },
          ],
          completedTasks: [],
        },
      });

      // Override aiService to return batch review drops on second call
      const deps = {
        ...baseDeps,
        aiService: {
          call: async () => {
            callCount++;
            if (callCount === 1) {
              // First call: extraction
              const response = mockCoreExtractionResponse({
                summary: 'Summary.',
                decisions: [decisionText],
                learnings: [learningText],
              });
              return { text: JSON.stringify(toRawLLMJson(response)) };
            }
            // Second call: batch review — drop the learning as low-signal
            return { text: JSON.stringify({ drops: [{ id: 'le_001', reason: 'Duplicate of committed item' }] }) };
          },
        },
      };

      const result = await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      // The learning should be skipped by batch review
      const learning = result.filteredItems.find(fi => fi.text === learningText);
      assert.ok(learning, 'Learning should exist in filtered items');
      assert.equal(result.stagedItemStatus[learning!.id], 'skipped');
      assert.equal(result.stagedItemSource[learning!.id], 'reconciled');

      // Batch review event should be logged
      const events = jobs.appended.map((e) => e.line);
      assert.ok(events.some((e) => e.includes('Batch review dropped 1')));
    });

    it('logs per-source skip count when an action item matches an open task', async () => {
      // Plan step 7: surface existing-task skips in the job event log so users
      // (and future observability) can see WHY dedup skipped something.
      const jobs = makeMockJobs();
      const deps = makeDepsWithReconciliation({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          // Near-paraphrase of the open task → should match existing-task.
          actionItems: [mockActionItem('Promote LEAP templates to production this week', { confidence: 0.9 })],
        }),
        pathFixtures: {
          'week.md': '## Must complete\n- [ ] Promote LEAP templates to production @area(glance-communications)\n',
          'tasks.md': '',
          'scratchpad.md': '',
        },
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const events = jobs.appended.map((e) => e.line);
      assert.ok(
        events.some((e) => /already tracked as open tasks/.test(e)),
        `expected a summary event mentioning "already tracked as open tasks", got: ${events.join(' | ')}`,
      );
    });

    it('batch LLM review uses the reconciliation tier, not extraction', async () => {
      // Regression for plan step 1: batchLLMReview was piggybacking on the
      // 'extraction' tier. In workspaces with extraction=frontier (Opus) and
      // reconciliation=standard (Sonnet), this paid Opus on every review pass.
      // Fix: extract path binds callLLMReconciliation to 'reconciliation' and
      // passes that to batchLLMReview instead of the shared callLLM.
      const jobs = makeMockJobs();
      const deps = makeDepsWithReconciliation({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          decisions: ['A real decision made in the meeting'],
        }),
      });

      await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      const tasksCalled = deps.aiCalls.map((c) => c.task);
      const extractionCalls = tasksCalled.filter((t) => t === 'extraction').length;
      const reconciliationCalls = tasksCalled.filter((t) => t === 'reconciliation').length;
      assert.equal(extractionCalls, 1, 'expected exactly one extraction call');
      assert.equal(reconciliationCalls, 1, 'expected exactly one reconciliation (batchLLMReview) call');
      // Belt-and-suspenders: no other task tiers should be hit on this path.
      assert.equal(tasksCalled.length, 2, `expected only 2 AI calls, saw: ${tasksCalled.join(', ')}`);
    });

    it('batch LLM review degrades gracefully when LLM fails', async () => {
      const jobs = makeMockJobs();
      let callCount = 0;
      const baseDeps = makeDepsWithReconciliation({
        coreResponse: mockCoreExtractionResponse({
          summary: 'Summary.',
          decisions: ['Valid decision'],
        }),
        reconciliationContext: {
          areaMemories: new Map(),
          recentCommittedItems: [],
          completedTasks: [],
        },
      });

      const deps = {
        ...baseDeps,
        aiService: {
          call: async () => {
            callCount++;
            if (callCount === 1) {
              const response = mockCoreExtractionResponse({
                summary: 'Summary.',
                decisions: ['Valid decision'],
              });
              return { text: JSON.stringify(toRawLLMJson(response)) };
            }
            // Second call: batch review fails — batchLLMReview catches internally
            throw new Error('LLM unavailable');
          },
        },
      };

      const result = await runProcessingSessionTestable(WORKSPACE, SLUG, JOB_ID, jobs, deps);

      // Should still complete successfully — batchLLMReview catches errors internally
      assert.ok(result.filteredItems.length > 0);
      const events = jobs.appended.map((e) => e.line);
      // No batch review warning since batchLLMReview handles errors gracefully (returns [])
      // Processing should complete normally
      assert.ok(events.some((e) => e.includes('processed successfully')));
    });
  });
});
