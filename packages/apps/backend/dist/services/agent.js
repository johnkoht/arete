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
 */
import { join } from 'node:path';
import fs from 'node:fs/promises';
import matter from 'gray-matter';
import { updateMeetingContent, extractMeetingIntelligence, processMeetingExtraction, extractUserNotes, clearApprovedSections, formatFilteredStagedSections, } from '@arete/core';
import * as jobsService from './jobs.js';
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
export function mapActionItemToStagedItem(item, index) {
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
export function mapActionItemsToStagedItems(items) {
    return items.map((item, index) => mapActionItemToStagedItem(item, index));
}
/**
 * Testable version of runProcessingSession with injected dependencies.
 * Used by tests to mock file operations and AI service.
 */
export async function runProcessingSessionTestable(workspaceRoot, meetingSlug, jobId, jobs, deps, options = {}) {
    const meetingPath = join(workspaceRoot, 'resources', 'meetings', `${meetingSlug}.md`);
    try {
        // 1. Read meeting file
        jobs.appendEvent(jobId, 'Reading meeting file...');
        let fileContent;
        try {
            fileContent = await deps.readFile(meetingPath);
        }
        catch (err) {
            jobs.setJobStatus(jobId, 'error');
            jobs.appendEvent(jobId, `Error: Could not read meeting file: ${meetingSlug}.md`);
            throw new Error(`Could not read meeting file: ${meetingSlug}.md`);
        }
        // 2. Parse frontmatter and content
        const { data, content: rawContent } = matter(fileContent);
        // Clone frontmatter before mutating (gray-matter caching gotcha)
        const fm = { ...data };
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
        let coreResult;
        try {
            // Track LLM errors separately since extractMeetingIntelligence catches them
            let llmError = null;
            // Create LLM adapter to bridge AIService to core LLMCallFn signature
            const callLLM = async (prompt) => {
                try {
                    const result = await deps.aiService.call('extraction', prompt);
                    return result.text;
                }
                catch (err) {
                    // Capture error for later re-throw after core extraction returns empty
                    llmError = err instanceof Error ? err : new Error(String(err));
                    throw llmError;
                }
            };
            // Get attendees from frontmatter (extract names from {name, email} objects)
            const attendeeNames = (fm['attendees'] || []).map((a) => a.name);
            // Call core extraction service
            coreResult = await extractMeetingIntelligence(content, callLLM, {
                attendees: attendeeNames,
            });
            // If LLM failed and we got empty results, propagate the original error
            // (core extraction catches errors and returns empty results)
            if (llmError && coreResult.intelligence.summary === '') {
                throw llmError;
            }
        }
        catch (err) {
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
        // 4. Process extraction with filtering, dedup, and metadata using core function
        jobs.appendEvent(jobId, 'Applying confidence thresholds...');
        const userNotes = extractUserNotes(content);
        const processed = processMeetingExtraction(coreResult, userNotes);
        // Log filtered counts (compare raw vs filtered items)
        const rawItemCount = coreResult.intelligence.actionItems.length +
            coreResult.intelligence.decisions.length +
            coreResult.intelligence.learnings.length;
        const filteredOutCount = rawItemCount - processed.filteredItems.length;
        if (filteredOutCount > 0) {
            jobs.appendEvent(jobId, `Filtered out ${filteredOutCount} low-confidence items.`);
        }
        // 5. Log user notes matches
        jobs.appendEvent(jobId, 'Checking for user notes...');
        const dedupCount = Object.values(processed.stagedItemSource).filter((s) => s === 'dedup').length;
        if (dedupCount > 0) {
            jobs.appendEvent(jobId, `Found ${dedupCount} items matching your notes (auto-approved).`);
        }
        // 6. Log high-confidence auto-approvals (excluding dedup)
        const highConfidenceApproved = Object.entries(processed.stagedItemStatus).filter(([id, status]) => status === 'approved' && processed.stagedItemSource[id] !== 'dedup').length;
        if (highConfidenceApproved > 0) {
            jobs.appendEvent(jobId, `Auto-approved ${highConfidenceApproved} high-confidence items.`);
        }
        // 7. Format staged sections
        const stagedSections = formatFilteredStagedSections(processed.filteredItems, coreResult.intelligence.summary);
        // 8. Update content with staged sections
        const updatedContent = updateMeetingContent(content, stagedSections);
        // 9. Update frontmatter with status, sources, confidence, owner, and item status
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
        // 10. Write updated file
        jobs.appendEvent(jobId, 'Writing staged sections...');
        const updatedFile = matter.stringify(updatedContent, fm);
        await deps.writeFile(meetingPath, updatedFile);
        // 11. Mark job done
        jobs.setJobStatus(jobId, 'done');
        jobs.appendEvent(jobId, 'Meeting processed successfully.');
    }
    catch (err) {
        // Re-throw but ensure job is marked as error if not already
        throw err;
    }
}
/**
 * Default dependencies using real fs and provided AIService.
 */
function createDefaultDeps(aiService) {
    return {
        readFile: (path) => fs.readFile(path, 'utf8'),
        writeFile: (path, content) => fs.writeFile(path, content, 'utf8'),
        aiService: {
            call: async (task, prompt) => {
                const result = await aiService.call(task, prompt);
                return { text: result.text };
            },
        },
    };
}
// Module-level AIService reference, set by initializeAIService()
let moduleAiService = null;
/**
 * Initialize the AIService for meeting processing.
 * Call this at server startup after loading config.
 *
 * Note: Extraction thresholds (confidence, dedup) are now configured in
 * core processMeetingExtraction() via ProcessingOptions.
 */
export function initializeAIService(aiService, _config) {
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
export async function runProcessingSession(workspaceRoot, meetingSlug, jobId, jobs = jobsService, options = {}) {
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
