/**
 * Meeting processing using AIService.
 *
 * Reads meeting files, extracts content via AI, and writes staged sections.
 * Replaces the previous pi-coding-agent implementation with direct AI calls.
 */
import { Type } from '@sinclair/typebox';
import { join } from 'node:path';
import fs from 'node:fs/promises';
import matter from 'gray-matter';
import { updateMeetingContent } from '@arete/core';
import * as jobsService from './jobs.js';
/**
 * TypeBox schema for meeting extraction response.
 */
const MeetingExtractionSchema = Type.Object({
    summary: Type.String({ description: '2-4 sentence summary of the meeting' }),
    actionItems: Type.Array(Type.String(), { description: 'Action items extracted' }),
    decisions: Type.Array(Type.String(), { description: 'Decisions made in the meeting' }),
    learnings: Type.Array(Type.String(), { description: 'Learnings or insights' }),
});
/**
 * Build extraction prompt from meeting content.
 */
/**
 * Extract just the raw transcript portion from meeting content.
 * The raw transcript has speaker names with timestamps like "**John Koht | 00:14**"
 * We want to skip pre-processed sections like "## Action Items", "## Key Points", etc.
 */
function extractRawTranscript(content) {
    const lines = content.split('\n');
    const transcriptLines = [];
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
        }
        else if (line.match(/^\*\*[^|]+\|\s*\d{2}:\d{2}\*\*$/)) {
            // Speaker line outside explicit transcript section - start collecting
            inTranscript = true;
            transcriptLines.push(line);
        }
        else if (inTranscript && !line.startsWith('## ')) {
            transcriptLines.push(line);
        }
    }
    return transcriptLines.join('\n').trim();
}
function buildExtractionPrompt(content) {
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
function formatStagedSections(extraction) {
    const lines = [];
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
        // 3. Call AI for extraction
        jobs.appendEvent(jobId, 'Extracting content with AI...');
        let extraction;
        try {
            const result = await deps.aiService.callStructured('extraction', buildExtractionPrompt(content), MeetingExtractionSchema);
            extraction = result.data;
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
        // 4. Format staged sections
        const stagedSections = formatStagedSections(extraction);
        // 5. Update content with staged sections
        const updatedContent = updateMeetingContent(content, stagedSections);
        // 6. Update frontmatter
        fm['status'] = 'processed';
        fm['processed_at'] = new Date().toISOString();
        // 7. Write updated file
        jobs.appendEvent(jobId, 'Writing staged sections...');
        const updatedFile = matter.stringify(updatedContent, fm);
        await deps.writeFile(meetingPath, updatedFile);
        // 8. Mark job done
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
            callStructured: (task, prompt, schema) => aiService.callStructured(task, prompt, schema),
        },
    };
}
// Module-level AIService reference, set by initializeAIService()
let moduleAiService = null;
/**
 * Initialize the AIService for meeting processing.
 * Call this at server startup after loading config.
 */
export function initializeAIService(aiService) {
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
