/**
 * Meeting processing using AIService.
 *
 * Reads meeting files, extracts content via AI, and writes staged sections.
 * Replaces the previous pi-coding-agent implementation with direct AI calls.
 *
 * Uses core processMeetingExtraction() for post-processing:
 * - Confidence filtering (exclude items below threshold)
 * - User notes deduplication (Jaccard > 0.7 → source: 'dedup')
 * - Auto-approval (high confidence or dedup → approved)
 *
 * Context-enhanced extraction (T5):
 * - Uses buildMeetingContext to assemble attendee context, related goals, agenda
 * - Passes context to extractMeetingIntelligence for better owner resolution
 * - Context building is optional — skipped on failure without blocking extraction
 */


import { join } from 'node:path';
import fs from 'node:fs/promises';
import matter from 'gray-matter';
import {
  updateMeetingContent,
  extractMeetingIntelligence,
  processMeetingExtraction,
  extractUserNotes,
  clearApprovedSections,
  formatFilteredStagedSections,
  buildMeetingContext,
  applyMeetingIntelligence,
  createServices,
  getWorkspacePaths,
  getCompletedItems,
} from '@arete/core';
import type {
  AIService,
  AITask,
  AreteConfig,
  ActionItem,
  StagedItem,
  MeetingExtractionResult,
  FilteredItem,
  MeetingContextBundle,
  PriorItem,
  ProcessedMeetingResult,
} from '@arete/core';
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

// ---------------------------------------------------------------------------
// ActionItem → StagedItem mapping
// ---------------------------------------------------------------------------

/**
 * Maps an ActionItem from the extraction service to a StagedItem for the UI.
 *
 * ActionItem (from extractMeetingIntelligence):
 *   - owner, ownerSlug, description, direction, counterpartySlug, confidence
 *
 * StagedItem (for backend/frontend):
 *   - id, text, type, source, confidence, ownerSlug, direction, counterpartySlug
 */
export function mapActionItemToStagedItem(
  item: ActionItem,
  index: number,
): StagedItem {
  return {
    id: `ai_${String(index).padStart(3, '0')}`,
    text: item.description,
    type: 'ai',
    source: 'ai',
    confidence: item.confidence,
    ownerSlug: item.ownerSlug,
    direction: item.direction,
    counterpartySlug: item.counterpartySlug,
  };
}

/**
 * Maps an array of ActionItems to StagedItems.
 */
export function mapActionItemsToStagedItems(items: ActionItem[]): StagedItem[] {
  return items.map((item, index) => mapActionItemToStagedItem(item, index));
}

/**
 * Dependencies that can be injected for testing.
 */
export interface ProcessingDeps {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  aiService: {
    call: (task: AITask, prompt: string) => Promise<{ text: string }>;
  };
}

/** Options for processing session */
export interface ProcessingOptions {
  /** If true, clears previously approved items before reprocessing */
  clearApproved?: boolean;
  /** Pre-built context bundle for enhanced extraction (optional) */
  context?: MeetingContextBundle;
  /** Prior items from earlier meetings in a batch, used for deduplication */
  priorItems?: PriorItem[];
}

/**
 * Testable version of runProcessingSession with injected dependencies.
 * Used by tests to mock file operations and AI service.
 *
 * @returns ProcessedMeetingResult so callers can accumulate items for batch deduplication
 */
export async function runProcessingSessionTestable(
  workspaceRoot: string,
  meetingSlug: string,
  jobId: string,
  jobs: JobsService,
  deps: ProcessingDeps,
  options: ProcessingOptions = {},
): Promise<ProcessedMeetingResult> {
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

    // 3. Call AI for extraction using core extraction service
    jobs.appendEvent(jobId, 'Extracting content with AI...');
    let coreResult: MeetingExtractionResult;
    try {
      // Track LLM errors separately since extractMeetingIntelligence catches them
      let llmError: Error | null = null;

      // Create LLM adapter to bridge AIService to core LLMCallFn signature
      const callLLM = async (prompt: string): Promise<string> => {
        try {
          const result = await deps.aiService.call('extraction', prompt);
          return result.text;
        } catch (err) {
          // Capture error for later re-throw after core extraction returns empty
          llmError = err instanceof Error ? err : new Error(String(err));
          throw llmError;
        }
      };

      // Get attendees from frontmatter (extract names from {name, email} objects)
      const attendeeNames = (
        (fm['attendees'] as Array<{ name: string; email: string }>) || []
      ).map((a) => a.name);

      // Call core extraction service with optional context and prior items
      coreResult = await extractMeetingIntelligence(content, callLLM, {
        attendees: attendeeNames,
        context: options.context,
        priorItems: options.priorItems,
      });

      // If LLM failed and we got empty results, propagate the original error
      // (core extraction catches errors and returns empty results)
      if (llmError && coreResult.intelligence.summary === '') {
        throw llmError;
      }
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

    // 4. Read completed items from week.md and scratchpad.md for reconciliation
    let completedItems: string[] = [];
    try {
      const weekPath = join(workspaceRoot, 'now', 'week.md');
      const weekContent = await deps.readFile(weekPath).catch(() => '');
      const scratchpadPath = join(workspaceRoot, 'now', 'scratchpad.md');
      const scratchpadContent = await deps.readFile(scratchpadPath).catch(() => '');
      completedItems = [
        ...getCompletedItems(weekContent),
        ...getCompletedItems(scratchpadContent),
      ];
    } catch {
      // Silently ignore errors - files may not exist
      completedItems = [];
    }

    // 5. Process extraction with filtering, dedup, and metadata using core function
    jobs.appendEvent(jobId, 'Applying confidence thresholds...');
    const userNotes = extractUserNotes(content);
    const processed = processMeetingExtraction(coreResult, userNotes, {
      priorItems: options.priorItems,
      completedItems,
    });

    // Log filtered counts (compare raw vs filtered items)
    const rawItemCount =
      coreResult.intelligence.actionItems.length +
      coreResult.intelligence.decisions.length +
      coreResult.intelligence.learnings.length;
    const filteredOutCount = rawItemCount - processed.filteredItems.length;
    if (filteredOutCount > 0) {
      jobs.appendEvent(jobId, `Filtered out ${filteredOutCount} low-confidence items.`);
    }

    // 6. Log user notes matches
    jobs.appendEvent(jobId, 'Checking for user notes...');
    const dedupCount = Object.values(processed.stagedItemSource).filter(
      (s) => s === 'dedup',
    ).length;
    if (dedupCount > 0) {
      jobs.appendEvent(jobId, `Found ${dedupCount} items matching your notes (auto-approved).`);
    }

    // 7. Log reconciled items (matched completed tasks in workspace)
    const reconciledCount = Object.values(processed.stagedItemSource).filter(
      (s) => s === 'reconciled',
    ).length;
    if (reconciledCount > 0) {
      jobs.appendEvent(jobId, `Skipped ${reconciledCount} items already completed in workspace.`);
    }

    // 8. Log high-confidence auto-approvals (excluding dedup)
    const highConfidenceApproved = Object.entries(processed.stagedItemStatus).filter(
      ([id, status]) => status === 'approved' && processed.stagedItemSource[id] !== 'dedup',
    ).length;
    if (highConfidenceApproved > 0) {
      jobs.appendEvent(jobId, `Auto-approved ${highConfidenceApproved} high-confidence items.`);
    }

    // 9. Format staged sections
    const stagedSections = formatFilteredStagedSections(
      processed.filteredItems,
      coreResult.intelligence.summary,
    );

    // 10. Update content with staged sections
    const updatedContent = updateMeetingContent(content, stagedSections);

    // 11. Update frontmatter with status, sources, confidence, owner, and item status
    // Note: Core returns camelCase; backend frontmatter uses snake_case
    fm['status'] = 'processed';
    fm['processed_at'] = new Date().toISOString();
    fm['staged_item_source'] = processed.stagedItemSource;
    fm['staged_item_confidence'] = processed.stagedItemConfidence;
    fm['staged_item_status'] = processed.stagedItemStatus;
    // Only write owner map if there's actual owner metadata
    if (Object.keys(processed.stagedItemOwner).length > 0) {
      fm['staged_item_owner'] = processed.stagedItemOwner;
    }

    // 12. Write updated file
    jobs.appendEvent(jobId, 'Writing staged sections...');
    const updatedFile = matter.stringify(updatedContent, fm);
    await deps.writeFile(meetingPath, updatedFile);

    // 13. Mark job done
    jobs.setJobStatus(jobId, 'done');
    jobs.appendEvent(jobId, 'Meeting processed successfully.');

    // Return processed result so callers can accumulate items for batch deduplication
    return processed;
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
      call: async (task, prompt) => {
        const result = await aiService.call(task, prompt);
        return { text: result.text };
      },
    },
  };
}

// Module-level AIService reference, set by initializeAIService()
let moduleAiService: AIService | null = null;

/**
 * Initialize the AIService for meeting processing.
 * Call this at server startup after loading config.
 *
 * Note: Extraction thresholds (confidence, dedup) are now configured in
 * core processMeetingExtraction() via ProcessingOptions.
 */
export function initializeAIService(aiService: AIService, _config?: AreteConfig): void {
  moduleAiService = aiService;
}

/**
 * Run a processing session to extract content from a meeting.
 *
 * - Builds meeting context (attendees, goals, agenda) for enhanced extraction
 * - Reads the meeting file
 * - Calls AI for extraction (summary, action items, decisions, learnings)
 * - Writes staged sections back to the file
 * - Updates frontmatter (status: 'processed', processed_at: timestamp)
 *
 * Context building is optional — if it fails, extraction continues without context.
 *
 * @param workspaceRoot  Absolute path to the Areté workspace
 * @param meetingSlug    Meeting file slug (no .md extension)
 * @param jobId          ID of the background job to append events to
 * @param jobs           Jobs service (real or mock) — defaults to the real module
 * @param options        Processing options (e.g. clearApproved, priorItems)
 * @returns ProcessedMeetingResult so callers can accumulate items for batch deduplication
 */
export async function runProcessingSession(
  workspaceRoot: string,
  meetingSlug: string,
  jobId: string,
  jobs: JobsService = jobsService,
  options: ProcessingOptions = {},
): Promise<ProcessedMeetingResult> {
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

  // Build context for enhanced extraction (optional — skip on failure)
  let context: MeetingContextBundle | undefined;
  if (!options.context) {
    try {
      jobs.appendEvent(jobId, 'Building meeting context...');
      const services = await createServices(workspaceRoot);
      const paths = getWorkspacePaths(workspaceRoot);
      const meetingPath = join(workspaceRoot, 'resources', 'meetings', `${meetingSlug}.md`);

      context = await buildMeetingContext(meetingPath, {
        storage: services.storage,
        intelligence: services.intelligence,
        entity: services.entity,
        paths,
      });

      // Log context stats
      const attendeeCount = context.attendees.length;
      const agendaItems = context.agenda?.items.length ?? 0;
      if (attendeeCount > 0 || agendaItems > 0) {
        jobs.appendEvent(
          jobId,
          `Context built: ${attendeeCount} attendees, ${agendaItems} agenda items.`,
        );
      }
    } catch (err) {
      // Context building is optional — log warning and continue
      const message = err instanceof Error ? err.message : String(err);
      jobs.appendEvent(jobId, `Warning: Could not build context: ${message}`);
      // Continue without context
    }
  } else {
    // Use provided context
    context = options.context;
  }

  const deps = createDefaultDeps(moduleAiService);
  const optionsWithContext: ProcessingOptions = { ...options, context };
  return runProcessingSessionTestable(workspaceRoot, meetingSlug, jobId, jobs, deps, optionsWithContext);
}
