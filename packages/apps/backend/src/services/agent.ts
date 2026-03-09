/**
 * Meeting processing using AIService.
 *
 * Reads meeting files, extracts content via AI, and writes staged sections.
 * Replaces the previous pi-coding-agent implementation with direct AI calls.
 *
 * Includes user notes deduplication: items matching user-written notes
 * (Jaccard > 0.7) are marked source: 'dedup' for auto-approval.
 */

import { Type, type Static } from '@sinclair/typebox';
import { join } from 'node:path';
import fs from 'node:fs/promises';
import matter from 'gray-matter';
import { updateMeetingContent, normalizeForJaccard, jaccardSimilarity } from '@arete/core';
import type { AIService, AIStructuredResult } from '@arete/core';
import * as jobsService from './jobs.js';

export type { JobsService };

/**
 * Minimal subset of the jobs service used by runProcessingSession.
 * Allows easy mocking in tests.
 */
type JobsService = {
  appendEvent: (id: string, line: string) => void;
  setJobStatus: (id: string, status: 'running' | 'done' | 'error') => void;
};

/**
 * TypeBox schema for meeting extraction response.
 */
const MeetingExtractionSchema = Type.Object({
  summary: Type.String({ description: '2-4 sentence summary of the meeting' }),
  actionItems: Type.Array(Type.String(), { description: 'Action items extracted' }),
  decisions: Type.Array(Type.String(), { description: 'Decisions made in the meeting' }),
  learnings: Type.Array(Type.String(), { description: 'Learnings or insights' }),
});

type MeetingExtraction = Static<typeof MeetingExtractionSchema>;

/** Item source type: 'ai' (LLM extracted) or 'dedup' (matched user notes) */
type ItemSource = 'ai' | 'dedup';

/** Map of item ID to source */
type ItemSources = Record<string, ItemSource>;

/** Jaccard similarity threshold for user notes deduplication */
const DEDUP_JACCARD_THRESHOLD = 0.7;

/**
 * Extract user-written notes from meeting body.
 * Excludes: ## Transcript, ## Staged Action Items, ## Staged Decisions, ## Staged Learnings
 */
function extractUserNotes(body: string): string {
  const lines = body.split('\n');
  const output: string[] = [];
  let inExcludedSection = false;

  const excludedHeaders = new Set([
    'transcript',
    'staged action items',
    'staged decisions',
    'staged learnings',
  ]);

  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch) {
      const normalized = headerMatch[1].trim().toLowerCase();
      inExcludedSection = excludedHeaders.has(normalized);
      if (!inExcludedSection) {
        output.push(line);
      }
      continue;
    }

    if (!inExcludedSection) {
      output.push(line);
    }
  }

  return output.join('\n');
}

/**
 * Check if an extracted item matches user notes.
 * Returns true if Jaccard similarity > threshold.
 */
function itemMatchesUserNotes(itemText: string, userNotesNormalized: string[]): boolean {
  const itemNormalized = normalizeForJaccard(itemText);
  const similarity = jaccardSimilarity(itemNormalized, userNotesNormalized);
  return similarity > DEDUP_JACCARD_THRESHOLD;
}

/**
 * Determine sources for extracted items by comparing against user notes.
 * Items matching user notes (Jaccard > 0.7) get source: 'dedup'.
 */
function determineItemSources(
  extraction: MeetingExtraction,
  userNotes: string,
): ItemSources {
  const sources: ItemSources = {};
  const userNotesNormalized = normalizeForJaccard(userNotes);

  // Check action items
  extraction.actionItems.forEach((item, index) => {
    const id = `ai_${String(index + 1).padStart(3, '0')}`;
    sources[id] = itemMatchesUserNotes(item, userNotesNormalized) ? 'dedup' : 'ai';
  });

  // Check decisions
  extraction.decisions.forEach((item, index) => {
    const id = `de_${String(index + 1).padStart(3, '0')}`;
    sources[id] = itemMatchesUserNotes(item, userNotesNormalized) ? 'dedup' : 'ai';
  });

  // Check learnings
  extraction.learnings.forEach((item, index) => {
    const id = `le_${String(index + 1).padStart(3, '0')}`;
    sources[id] = itemMatchesUserNotes(item, userNotesNormalized) ? 'dedup' : 'ai';
  });

  return sources;
}

/**
 * Dependencies that can be injected for testing.
 */
export interface ProcessingDeps {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  aiService: {
    callStructured: (
      task: 'extraction',
      prompt: string,
      schema: typeof MeetingExtractionSchema,
    ) => Promise<AIStructuredResult<MeetingExtraction>>;
  };
}

/**
 * Build extraction prompt from meeting content.
 */
/**
 * Extract just the raw transcript portion from meeting content.
 * The raw transcript has speaker names with timestamps like "**John Koht | 00:14**"
 * We want to skip pre-processed sections like "## Action Items", "## Key Points", etc.
 */
function extractRawTranscript(content: string): string {
  const lines = content.split('\n');
  const transcriptLines: string[] = [];
  let inTranscript = false;
  let skipUntilNextHeader = false;

  for (const line of lines) {
    // Check for transcript section headers
    if (line.match(/^##\s*Transcript\s*\d*\s*$/i)) {
      inTranscript = true;
      skipUntilNextHeader = false;
      continue;
    }

    // Check for non-transcript headers to skip
    if (line.match(/^##\s*(Action Items|Key Points|Summary|Decisions|Learnings|Recorder Notes)/i)) {
      skipUntilNextHeader = true;
      inTranscript = false;
      continue;
    }

    // Any other ## header ends skip mode
    if (line.startsWith('## ')) {
      skipUntilNextHeader = false;
      inTranscript = false;
    }

    // Collect transcript lines (look for speaker pattern: **Name | timestamp**)
    if (inTranscript && !skipUntilNextHeader) {
      transcriptLines.push(line);
    } else if (line.match(/^\*\*[^|]+\|\s*\d{2}:\d{2}\*\*$/)) {
      // Speaker line outside explicit transcript section - start collecting
      inTranscript = true;
      transcriptLines.push(line);
    } else if (inTranscript && !line.startsWith('## ')) {
      transcriptLines.push(line);
    }
  }

  return transcriptLines.join('\n').trim();
}

function buildExtractionPrompt(content: string): string {
  // Extract only the raw transcript, not pre-processed sections
  const rawTranscript = extractRawTranscript(content);
  
  // Fall back to full content if no transcript found
  const textToAnalyze = rawTranscript || content;

  return `Analyze this meeting transcript and extract the following:

1. A 2-4 sentence summary of the meeting highlighting key topics and outcomes.
2. Action items - specific tasks that were assigned or committed to (things people said they would do).
3. Decisions - choices or conclusions that were explicitly made during the meeting.
4. Learnings - insights, lessons learned, or important information shared.

Meeting transcript:
---
${textToAnalyze}
---

IMPORTANT INSTRUCTIONS:
- Read the actual conversation carefully and identify action items from what people SAY they will do.
- Action items should be specific tasks assigned to or committed to by a person.
- Do not include timestamp references in your output.
- Each item should be a separate entry - do not combine multiple items.
- Write clean, standalone text for each item.

If a category has no items, return an empty array.`;
}

/**
 * Format extraction result as markdown sections.
 * IDs are zero-padded 3 digits (ai_001, de_001, le_001).
 */
function formatStagedSections(extraction: MeetingExtraction): string {
  const lines: string[] = [];

  // Summary section
  lines.push('## Summary');
  lines.push(extraction.summary);
  lines.push('');

  // Staged Action Items
  if (extraction.actionItems.length > 0) {
    lines.push('## Staged Action Items');
    extraction.actionItems.forEach((item, index) => {
      const id = `ai_${String(index + 1).padStart(3, '0')}`;
      lines.push(`- ${id}: ${item}`);
    });
    lines.push('');
  }

  // Staged Decisions
  if (extraction.decisions.length > 0) {
    lines.push('## Staged Decisions');
    extraction.decisions.forEach((item, index) => {
      const id = `de_${String(index + 1).padStart(3, '0')}`;
      lines.push(`- ${id}: ${item}`);
    });
    lines.push('');
  }

  // Staged Learnings
  if (extraction.learnings.length > 0) {
    lines.push('## Staged Learnings');
    extraction.learnings.forEach((item, index) => {
      const id = `le_${String(index + 1).padStart(3, '0')}`;
      lines.push(`- ${id}: ${item}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}



/** Options for processing session */
export interface ProcessingOptions {
  /** If true, clears previously approved items before reprocessing */
  clearApproved?: boolean;
}

/**
 * Remove approved sections from meeting content.
 * Removes: ## Approved Action Items, ## Approved Decisions, ## Approved Learnings
 */
function clearApprovedSections(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let skipping = false;

  for (const line of lines) {
    // Check for approved section headers
    if (line.match(/^## Approved (Action Items|Decisions|Learnings)\s*$/)) {
      skipping = true;
      continue;
    }
    // Stop skipping at next header
    if (skipping && line.startsWith('## ')) {
      skipping = false;
    }
    if (!skipping) {
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Testable version of runProcessingSession with injected dependencies.
 * Used by tests to mock file operations and AI service.
 */
export async function runProcessingSessionTestable(
  workspaceRoot: string,
  meetingSlug: string,
  jobId: string,
  jobs: JobsService,
  deps: ProcessingDeps,
  options: ProcessingOptions = {},
): Promise<void> {
  const meetingPath = join(workspaceRoot, 'resources', 'meetings', `${meetingSlug}.md`);

  try {
    // 1. Read meeting file
    jobs.appendEvent(jobId, 'Reading meeting file...');
    let fileContent: string;
    try {
      fileContent = await deps.readFile(meetingPath);
    } catch (err) {
      jobs.setJobStatus(jobId, 'error');
      jobs.appendEvent(jobId, `Error: Could not read meeting file: ${meetingSlug}.md`);
      throw new Error(`Could not read meeting file: ${meetingSlug}.md`);
    }

    // 2. Parse frontmatter and content
    const { data, content: rawContent } = matter(fileContent);
    // Clone frontmatter before mutating (gray-matter caching gotcha)
    const fm = { ...data } as Record<string, unknown>;

    // 2b. Optionally clear previously approved items
    let content = rawContent;
    if (options.clearApproved) {
      jobs.appendEvent(jobId, 'Clearing previously approved items...');
      content = clearApprovedSections(rawContent);
      // Clear approved items from frontmatter
      delete fm['approved_items'];
      delete fm['approved_at'];
    }

    // 3. Call AI for extraction
    jobs.appendEvent(jobId, 'Extracting content with AI...');
    let extraction: MeetingExtraction;
    try {
      const result = await deps.aiService.callStructured(
        'extraction',
        buildExtractionPrompt(content),
        MeetingExtractionSchema,
      );
      extraction = result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Check for API key error
      if (message.includes('API key') || message.includes('api_key') || message.includes('ANTHROPIC')) {
        jobs.setJobStatus(jobId, 'error');
        jobs.appendEvent(jobId, `Error: ${message}`);
        throw err;
      }
      jobs.setJobStatus(jobId, 'error');
      jobs.appendEvent(jobId, `Error: AI extraction failed: ${message}`);
      throw new Error(`AI extraction failed: ${message}`);
    }

    // 4. Extract user notes and determine item sources
    jobs.appendEvent(jobId, 'Checking for user notes...');
    const userNotes = extractUserNotes(content);
    const itemSources = determineItemSources(extraction, userNotes);
    
    // Count dedup items for logging
    const dedupCount = Object.values(itemSources).filter(s => s === 'dedup').length;
    if (dedupCount > 0) {
      jobs.appendEvent(jobId, `Found ${dedupCount} items matching your notes (auto-approved).`);
    }

    // 5. Format staged sections
    const stagedSections = formatStagedSections(extraction);

    // 6. Update content with staged sections
    const updatedContent = updateMeetingContent(content, stagedSections);

    // 7. Update frontmatter with status, sources, and auto-approve dedup items
    fm['status'] = 'processed';
    fm['processed_at'] = new Date().toISOString();
    fm['staged_item_source'] = itemSources;
    
    // Auto-approve dedup items
    const autoApproveStatus: Record<string, string> = {};
    for (const [id, source] of Object.entries(itemSources)) {
      if (source === 'dedup') {
        autoApproveStatus[id] = 'approved';
      }
    }
    if (Object.keys(autoApproveStatus).length > 0) {
      fm['staged_item_status'] = autoApproveStatus;
    }

    // 8. Write updated file
    jobs.appendEvent(jobId, 'Writing staged sections...');
    const updatedFile = matter.stringify(updatedContent, fm);
    await deps.writeFile(meetingPath, updatedFile);

    // 8. Mark job done
    jobs.setJobStatus(jobId, 'done');
    jobs.appendEvent(jobId, 'Meeting processed successfully.');
  } catch (err) {
    // Re-throw but ensure job is marked as error if not already
    throw err;
  }
}

/**
 * Default dependencies using real fs and provided AIService.
 */
function createDefaultDeps(aiService: AIService): ProcessingDeps {
  return {
    readFile: (path: string) => fs.readFile(path, 'utf8'),
    writeFile: (path: string, content: string) => fs.writeFile(path, content, 'utf8'),
    aiService: {
      callStructured: (task, prompt, schema) =>
        aiService.callStructured(task, prompt, schema),
    },
  };
}

// Module-level AIService reference, set by initializeAIService()
let moduleAiService: AIService | null = null;

/**
 * Initialize the AIService for meeting processing.
 * Call this at server startup after loading config.
 */
export function initializeAIService(aiService: AIService): void {
  moduleAiService = aiService;
}

/**
 * Run a processing session to extract content from a meeting.
 *
 * - Reads the meeting file
 * - Calls AI for extraction (summary, action items, decisions, learnings)
 * - Writes staged sections back to the file
 * - Updates frontmatter (status: 'processed', processed_at: timestamp)
 *
 * @param workspaceRoot  Absolute path to the Areté workspace
 * @param meetingSlug    Meeting file slug (no .md extension)
 * @param jobId          ID of the background job to append events to
 * @param jobs           Jobs service (real or mock) — defaults to the real module
 * @param options        Processing options (e.g. clearApproved)
 */
export async function runProcessingSession(
  workspaceRoot: string,
  meetingSlug: string,
  jobId: string,
  jobs: JobsService = jobsService,
  options: ProcessingOptions = {},
): Promise<void> {
  // Validate AIService is initialized
  if (!moduleAiService) {
    jobs.setJobStatus(jobId, 'error');
    jobs.appendEvent(jobId, 'Error: AIService not initialized. Check AI configuration.');
    throw new Error('AIService not initialized. Call initializeAIService() at startup.');
  }

  // Check if AI is configured
  if (!moduleAiService.isConfigured()) {
    jobs.setJobStatus(jobId, 'error');
    jobs.appendEvent(jobId, 'Error: No AI provider configured. Set up API keys via arete credentials set anthropic.');
    throw new Error('No AI provider configured. Set up API keys via arete credentials set anthropic.');
  }

  const deps = createDefaultDeps(moduleAiService);
  return runProcessingSessionTestable(workspaceRoot, meetingSlug, jobId, jobs, deps, options);
}
