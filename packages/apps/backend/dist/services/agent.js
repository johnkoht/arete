/**
 * Meeting processing using AIService.
 *
 * Reads meeting files, extracts content via AI, and writes staged sections.
 * Replaces the previous pi-coding-agent implementation with direct AI calls.
 *
 * Includes user notes deduplication: items matching user-written notes
 * (Jaccard > 0.7) are marked source: 'dedup' for auto-approval.
 */
import { join } from 'node:path';
import fs from 'node:fs/promises';
import matter from 'gray-matter';
import { updateMeetingContent, normalizeForJaccard, jaccardSimilarity, extractMeetingIntelligence, } from '@arete/core';
import * as jobsService from './jobs.js';
/**
 * Transform core MeetingIntelligence to backend MeetingExtraction format.
 * Maps ActionItem.description → ExtractionItem.text for dedup compatibility.
 */
function adaptCoreToBackend(intelligence) {
    return {
        summary: intelligence.summary,
        actionItems: intelligence.actionItems.map((ai) => ({
            text: ai.description,
            confidence: ai.confidence ?? 0.9,
            // Preserve owner/direction for downstream use
            owner: ai.owner,
            ownerSlug: ai.ownerSlug,
            direction: ai.direction,
            counterpartySlug: ai.counterpartySlug,
        })),
        decisions: intelligence.decisions.map((d) => ({ text: d, confidence: 0.9 })),
        learnings: intelligence.learnings.map((l) => ({ text: l, confidence: 0.9 })),
    };
}
// ---------------------------------------------------------------------------
// Configurable thresholds (defaults, overridable via arete.yaml)
// ---------------------------------------------------------------------------
/** Default: items above this confidence are auto-approved */
const DEFAULT_CONFIDENCE_THRESHOLD_APPROVED = 0.8;
/** Default: items below this confidence are filtered out */
const DEFAULT_CONFIDENCE_THRESHOLD_INCLUDE = 0.5;
/** Default: Jaccard similarity threshold for user notes deduplication */
const DEFAULT_DEDUP_JACCARD_THRESHOLD = 0.7;
/** Module-level thresholds, set at initialization */
let moduleThresholds = {
    confidenceApproved: DEFAULT_CONFIDENCE_THRESHOLD_APPROVED,
    confidenceInclude: DEFAULT_CONFIDENCE_THRESHOLD_INCLUDE,
    dedupJaccard: DEFAULT_DEDUP_JACCARD_THRESHOLD,
};
// ---------------------------------------------------------------------------
// ActionItem → StagedItem mapping
// ---------------------------------------------------------------------------
/** Counter for generating unique staged item IDs */
let stagedItemCounter = 0;
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
 * Extract user-written notes from meeting body.
 * Excludes: ## Transcript, ## Staged Action Items, ## Staged Decisions, ## Staged Learnings
 */
function extractUserNotes(body) {
    const lines = body.split('\n');
    const output = [];
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
function itemMatchesUserNotes(itemText, userNotesNormalized) {
    const itemNormalized = normalizeForJaccard(itemText);
    const similarity = jaccardSimilarity(itemNormalized, userNotesNormalized);
    return similarity > moduleThresholds.dedupJaccard;
}
/**
 * Filter extraction items by confidence threshold.
 * Items with confidence below the include threshold are filtered out.
 */
function filterByConfidence(extraction) {
    const threshold = moduleThresholds.confidenceInclude;
    return {
        actionItems: extraction.actionItems.filter(item => item.confidence >= threshold),
        decisions: extraction.decisions.filter(item => item.confidence >= threshold),
        learnings: extraction.learnings.filter(item => item.confidence >= threshold),
    };
}
/**
 * Determine sources for extracted items by comparing against user notes.
 * Items matching user notes (Jaccard > 0.7) get source: 'dedup'.
 */
function determineItemSources(filtered, userNotes) {
    const sources = {};
    const userNotesNormalized = normalizeForJaccard(userNotes);
    // Check action items
    filtered.actionItems.forEach((item, index) => {
        const id = `ai_${String(index + 1).padStart(3, '0')}`;
        sources[id] = itemMatchesUserNotes(item.text, userNotesNormalized) ? 'dedup' : 'ai';
    });
    // Check decisions
    filtered.decisions.forEach((item, index) => {
        const id = `de_${String(index + 1).padStart(3, '0')}`;
        sources[id] = itemMatchesUserNotes(item.text, userNotesNormalized) ? 'dedup' : 'ai';
    });
    // Check learnings
    filtered.learnings.forEach((item, index) => {
        const id = `le_${String(index + 1).padStart(3, '0')}`;
        sources[id] = itemMatchesUserNotes(item.text, userNotesNormalized) ? 'dedup' : 'ai';
    });
    return sources;
}
/**
 * Build confidence map for all items.
 */
function buildConfidenceMap(filtered) {
    const confidences = {};
    filtered.actionItems.forEach((item, index) => {
        const id = `ai_${String(index + 1).padStart(3, '0')}`;
        confidences[id] = item.confidence;
    });
    filtered.decisions.forEach((item, index) => {
        const id = `de_${String(index + 1).padStart(3, '0')}`;
        confidences[id] = item.confidence;
    });
    filtered.learnings.forEach((item, index) => {
        const id = `le_${String(index + 1).padStart(3, '0')}`;
        confidences[id] = item.confidence;
    });
    return confidences;
}
/**
 * Build owner metadata map for action items.
 * Only action items have owner/direction/counterparty metadata.
 * Only includes defined values (YAML can't serialize undefined).
 */
function buildOwnerMap(filtered) {
    const owners = {};
    filtered.actionItems.forEach((item, index) => {
        const id = `ai_${String(index + 1).padStart(3, '0')}`;
        // Only add entry if there's actual owner metadata
        if (item.ownerSlug || item.direction || item.counterpartySlug) {
            const meta = {};
            // Only include defined values (YAML can't serialize undefined)
            if (item.ownerSlug)
                meta.ownerSlug = item.ownerSlug;
            if (item.direction)
                meta.direction = item.direction;
            if (item.counterpartySlug)
                meta.counterpartySlug = item.counterpartySlug;
            owners[id] = meta;
        }
    });
    return owners;
}
/**
 * Determine item status based on confidence and dedup source.
 * - dedup items → 'approved' (user notes match)
 * - confidence > 0.8 → 'approved' (high confidence)
 * - confidence 0.5-0.8 → 'pending' (needs review)
 */
function determineItemStatus(itemSources, confidences) {
    const statuses = {};
    const threshold = moduleThresholds.confidenceApproved;
    for (const [id, source] of Object.entries(itemSources)) {
        if (source === 'dedup') {
            // Dedup items are always approved
            statuses[id] = 'approved';
        }
        else {
            // Use confidence threshold for AI-extracted items
            const confidence = confidences[id] ?? 0;
            statuses[id] = confidence > threshold ? 'approved' : 'pending';
        }
    }
    return statuses;
}
/**
 * Format extraction result as markdown sections.
 * IDs are zero-padded 3 digits (ai_001, de_001, le_001).
 * Takes FilteredExtraction (post-confidence filtering) and original summary.
 */
function formatStagedSections(filtered, summary) {
    const lines = [];
    // Summary section
    lines.push('## Summary');
    lines.push(summary);
    lines.push('');
    // Staged Action Items
    if (filtered.actionItems.length > 0) {
        lines.push('## Staged Action Items');
        filtered.actionItems.forEach((item, index) => {
            const id = `ai_${String(index + 1).padStart(3, '0')}`;
            lines.push(`- ${id}: ${item.text}`);
        });
        lines.push('');
    }
    // Staged Decisions
    if (filtered.decisions.length > 0) {
        lines.push('## Staged Decisions');
        filtered.decisions.forEach((item, index) => {
            const id = `de_${String(index + 1).padStart(3, '0')}`;
            lines.push(`- ${id}: ${item.text}`);
        });
        lines.push('');
    }
    // Staged Learnings
    if (filtered.learnings.length > 0) {
        lines.push('## Staged Learnings');
        filtered.learnings.forEach((item, index) => {
            const id = `le_${String(index + 1).padStart(3, '0')}`;
            lines.push(`- ${id}: ${item.text}`);
        });
        lines.push('');
    }
    return lines.join('\n');
}
/**
 * Remove approved sections from meeting content.
 * Removes: ## Approved Action Items, ## Approved Decisions, ## Approved Learnings
 */
function clearApprovedSections(content) {
    const lines = content.split('\n');
    const result = [];
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
        let extraction;
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
            const coreResult = await extractMeetingIntelligence(content, callLLM, {
                attendees: attendeeNames,
            });
            // If LLM failed and we got empty results, propagate the original error
            // (core extraction catches errors and returns empty results)
            if (llmError && coreResult.intelligence.summary === '') {
                throw llmError;
            }
            // Transform core result to backend format
            extraction = adaptCoreToBackend(coreResult.intelligence);
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
        // 4. Filter items by confidence threshold (exclude confidence < 0.5)
        jobs.appendEvent(jobId, 'Applying confidence thresholds...');
        const filtered = filterByConfidence(extraction);
        // Log filtered counts
        const filteredOutCount = (extraction.actionItems.length - filtered.actionItems.length) +
            (extraction.decisions.length - filtered.decisions.length) +
            (extraction.learnings.length - filtered.learnings.length);
        if (filteredOutCount > 0) {
            jobs.appendEvent(jobId, `Filtered out ${filteredOutCount} low-confidence items.`);
        }
        // 5. Extract user notes and determine item sources
        jobs.appendEvent(jobId, 'Checking for user notes...');
        const userNotes = extractUserNotes(content);
        const itemSources = determineItemSources(filtered, userNotes);
        // Count dedup items for logging
        const dedupCount = Object.values(itemSources).filter(s => s === 'dedup').length;
        if (dedupCount > 0) {
            jobs.appendEvent(jobId, `Found ${dedupCount} items matching your notes (auto-approved).`);
        }
        // 6. Build confidence map, owner map, and determine item status
        const confidences = buildConfidenceMap(filtered);
        const owners = buildOwnerMap(filtered);
        const itemStatus = determineItemStatus(itemSources, confidences);
        // Count high-confidence auto-approved items (excluding dedup)
        const highConfidenceApproved = Object.entries(itemStatus)
            .filter(([id, status]) => status === 'approved' && itemSources[id] !== 'dedup')
            .length;
        if (highConfidenceApproved > 0) {
            jobs.appendEvent(jobId, `Auto-approved ${highConfidenceApproved} high-confidence items.`);
        }
        // 7. Format staged sections
        const stagedSections = formatStagedSections(filtered, extraction.summary);
        // 8. Update content with staged sections
        const updatedContent = updateMeetingContent(content, stagedSections);
        // 9. Update frontmatter with status, sources, confidence, owner, and item status
        fm['status'] = 'processed';
        fm['processed_at'] = new Date().toISOString();
        fm['staged_item_source'] = itemSources;
        fm['staged_item_confidence'] = confidences;
        fm['staged_item_status'] = itemStatus;
        // Only write owner map if there's actual owner metadata
        if (Object.keys(owners).length > 0) {
            fm['staged_item_owner'] = owners;
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
 * Initialize the AIService and extraction thresholds for meeting processing.
 * Call this at server startup after loading config.
 */
export function initializeAIService(aiService, config) {
    moduleAiService = aiService;
    // Apply config thresholds if provided, otherwise use defaults
    if (config?.intelligence?.extraction) {
        const extraction = config.intelligence.extraction;
        moduleThresholds = {
            confidenceApproved: extraction.confidence_threshold_approved ?? DEFAULT_CONFIDENCE_THRESHOLD_APPROVED,
            confidenceInclude: extraction.confidence_threshold_include ?? DEFAULT_CONFIDENCE_THRESHOLD_INCLUDE,
            dedupJaccard: extraction.dedup_jaccard_threshold ?? DEFAULT_DEDUP_JACCARD_THRESHOLD,
        };
    }
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
