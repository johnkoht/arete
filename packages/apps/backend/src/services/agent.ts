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
  reconcileMeetingBatch,
  loadReconciliationContext,
  loadRecentMeetingBatch,
  batchLLMReview,
  FileStorageAdapter,
  type ExtractionMode,
  type MeetingExtractionBatch,
  type ReconciliationContext,
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
  // Optional reconciliation deps (for testability)
  loadReconciliationContext?: () => Promise<ReconciliationContext>;
  loadRecentBatch?: () => Promise<MeetingExtractionBatch[]>;
}

/** Options for processing session */
export interface ProcessingOptions {
  /** If true, clears previously approved items before reprocessing */
  clearApproved?: boolean;
  /** Extraction mode: 'normal' (default), 'thorough' (more items), or 'light' (minimal) */
  mode?: ExtractionMode;
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
    // Create LLM adapter to bridge AIService to core LLMCallFn signature
    // Hoisted outside try block so it's accessible for batch LLM review later
    const callLLM = async (prompt: string): Promise<string> => {
      const result = await deps.aiService.call('extraction', prompt);
      return result.text;
    };

    let coreResult: MeetingExtractionResult;
    try {
      // Track LLM errors separately since extractMeetingIntelligence catches them
      let llmError: Error | null = null;

      // Wrap callLLM to capture errors for later re-throw
      const callLLMWithErrorCapture = async (prompt: string): Promise<string> => {
        try {
          return await callLLM(prompt);
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

      // Call core extraction service with optional context, prior items, and mode
      coreResult = await extractMeetingIntelligence(content, callLLMWithErrorCapture, {
        attendees: attendeeNames,
        context: options.context,
        priorItems: options.priorItems,
        mode: options.mode,
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

    // 9b. Run cross-meeting reconciliation
    let reconciliationStats = { duplicates: 0, completed: 0, lowRelevance: 0 };
    if (deps.loadReconciliationContext && deps.loadRecentBatch) {
      try {
        jobs.appendEvent(jobId, 'Running cross-meeting reconciliation...');
        const context = await deps.loadReconciliationContext();
        const recentBatch = await deps.loadRecentBatch();

        // Build current meeting batch entry
        const currentBatch: MeetingExtractionBatch = {
          meetingPath: meetingPath,
          extraction: coreResult.intelligence,
        };

        const reconciliation = reconcileMeetingBatch(
          [...recentBatch, currentBatch],
          context,
        );

        // Merge reconciliation decisions into processed maps
        for (const item of reconciliation.items) {
          // Extract text from ReconciledItem.original
          const itemText = typeof item.original === 'string'
            ? item.original
            : item.original.description;

          // Find matching processed item by text
          const matchingItem = processed.filteredItems.find(
            fi => fi.text === itemText,
          );
          if (!matchingItem) continue;

          // Skip if already skipped by processing
          if (processed.stagedItemStatus[matchingItem.id] === 'skipped') continue;

          if (item.status === 'duplicate' || item.status === 'completed') {
            processed.stagedItemStatus[matchingItem.id] = 'skipped';
            processed.stagedItemSource[matchingItem.id] = 'reconciled';
            if (item.status === 'duplicate') reconciliationStats.duplicates++;
            else reconciliationStats.completed++;
          } else if (item.relevanceTier === 'low') {
            reconciliationStats.lowRelevance++;
          }
        }

        // Log reconciliation stats
        if (reconciliationStats.duplicates > 0 || reconciliationStats.completed > 0) {
          jobs.appendEvent(jobId, `Cross-meeting: ${reconciliationStats.duplicates} duplicates, ${reconciliationStats.completed} completed`);
        }
      } catch (err) {
        // Graceful degradation — log warning and continue
        console.warn('[agent] reconciliation failed:', err);
        jobs.appendEvent(jobId, 'Warning: Cross-meeting reconciliation skipped due to error');
      }
    }

    // 9c. Batch LLM quality review — semantic dedup against committed memory
    if (deps.loadReconciliationContext) {
      try {
        // Collect non-skipped items for review
        const reviewItems = processed.filteredItems
          .filter(fi => processed.stagedItemStatus[fi.id] !== 'skipped')
          .map(fi => ({ text: fi.text, type: fi.type, id: fi.id }));

        if (reviewItems.length > 0) {
          // Load committed items from reconciliation context
          const ctx = await deps.loadReconciliationContext();
          const drops = await batchLLMReview(reviewItems, ctx.recentCommittedItems, callLLM);

          if (drops.length > 0) {
            for (const drop of drops) {
              processed.stagedItemStatus[drop.id] = 'skipped';
              processed.stagedItemSource[drop.id] = 'reconciled';
            }
            jobs.appendEvent(jobId, `Batch review dropped ${drops.length} item(s)`);
          }
        }
      } catch (err) {
        console.warn('[agent] batch LLM review failed:', err);
        jobs.appendEvent(jobId, 'Warning: Batch LLM review skipped due to error');
      }
    }

    // 10. Format staged sections
    const stagedSections = formatFilteredStagedSections(
      processed.filteredItems,
      coreResult.intelligence.summary,
    );

    // 11. Update content with staged sections
    const updatedContent = updateMeetingContent(content, stagedSections);

    // 12. Update frontmatter with status, sources, confidence, owner, and item status
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
    // Only write matched text if there are reconciled items
    if (processed.stagedItemMatchedText && Object.keys(processed.stagedItemMatchedText).length > 0) {
      fm['staged_item_matched_text'] = processed.stagedItemMatchedText;
    }

    // 13. Write updated file
    jobs.appendEvent(jobId, 'Writing staged sections...');
    const updatedFile = matter.stringify(updatedContent, fm);
    await deps.writeFile(meetingPath, updatedFile);

    // 14. Mark job done
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
function createDefaultDeps(aiService: AIService, workspaceRoot: string): ProcessingDeps {
  const storage = new FileStorageAdapter();
  return {
    readFile: (path: string) => fs.readFile(path, 'utf8'),
    writeFile: (path: string, content: string) => fs.writeFile(path, content, 'utf8'),
    aiService: {
      call: async (task, prompt) => {
        const result = await aiService.call(task, prompt);
        return { text: result.text };
      },
    },
    loadReconciliationContext: () => loadReconciliationContext(storage, workspaceRoot),
    loadRecentBatch: () => loadRecentMeetingBatch(storage, join(workspaceRoot, 'resources', 'meetings'), 7),
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

  // Load prior items from recent meetings for prompt-level dedup (if not already provided)
  let priorItems = options.priorItems;
  if (!priorItems) {
    try {
      const storage = new FileStorageAdapter();
      const meetingsDir = join(workspaceRoot, 'resources', 'meetings');
      const recentBatch = await loadRecentMeetingBatch(storage, meetingsDir, 7);
      priorItems = recentBatch.flatMap(batch => [
        ...batch.extraction.decisions.map(text => ({ type: 'decision' as const, text })),
        ...batch.extraction.learnings.map(text => ({ type: 'learning' as const, text })),
        ...batch.extraction.actionItems.map(ai => ({ type: 'action' as const, text: ai.description })),
      ]);
      if (priorItems.length > 0) {
        jobs.appendEvent(jobId, `Loaded ${priorItems.length} prior items from recent meetings`);
      }
    } catch {
      // Graceful degradation — extraction works without prior items
      jobs.appendEvent(jobId, 'Warning: Could not load prior items from recent meetings');
    }
  }

  const deps = createDefaultDeps(moduleAiService, workspaceRoot);
  const optionsWithContext: ProcessingOptions = { ...options, context, priorItems };
  return runProcessingSessionTestable(workspaceRoot, meetingSlug, jobId, jobs, deps, optionsWithContext);
}
