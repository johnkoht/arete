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
function buildExtractionPrompt(content) {
    return `Analyze this meeting transcript and extract the following:

1. A 2-4 sentence summary of the meeting highlighting key topics and outcomes.
2. Action items - specific tasks that were assigned or committed to.
3. Decisions - choices or conclusions that were made.
4. Learnings - insights, lessons learned, or knowledge gained.

Meeting content:
---
${content}
---

Extract the above information. For action items, decisions, and learnings, only include items that are clearly stated or implied in the meeting. If a category has no items, return an empty array.`;
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
 * Replace or insert staged sections in meeting content.
 * Preserves content before ## Summary and after staged sections.
 */
function updateMeetingContent(originalContent, stagedSections) {
    // Find where ## Summary starts (or where to insert)
    const summaryMatch = originalContent.match(/^## Summary\s*$/m);
    if (!summaryMatch) {
        // No existing summary — append staged sections at end
        return originalContent.trimEnd() + '\n\n' + stagedSections;
    }
    // Find the position of ## Summary
    const summaryIndex = originalContent.indexOf(summaryMatch[0]);
    // Get content before ## Summary
    const beforeSummary = originalContent.substring(0, summaryIndex).trimEnd();
    // Find content after staged sections (look for ## that isn't Summary, Staged Action Items, Staged Decisions, or Staged Learnings)
    const stagedHeaders = /^## (?:Summary|Staged Action Items|Staged Decisions|Staged Learnings)\s*$/gm;
    let afterStagedContent = '';
    // Find all headers in the original content
    const lines = originalContent.substring(summaryIndex).split('\n');
    let pastStagedSections = false;
    const afterLines = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('## ')) {
            const headerName = line.replace(/^## /, '').trim();
            if (['Summary', 'Staged Action Items', 'Staged Decisions', 'Staged Learnings'].includes(headerName)) {
                // This is a staged section header - skip until next header
                continue;
            }
            else {
                // This is a different header - keep everything from here
                pastStagedSections = true;
            }
        }
        if (pastStagedSections) {
            afterLines.push(line);
        }
    }
    if (afterLines.length > 0) {
        afterStagedContent = '\n' + afterLines.join('\n');
    }
    return beforeSummary + '\n\n' + stagedSections + afterStagedContent;
}
/**
 * Testable version of runProcessingSession with injected dependencies.
 * Used by tests to mock file operations and AI service.
 */
export async function runProcessingSessionTestable(workspaceRoot, meetingSlug, jobId, jobs, deps) {
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
        const { data, content } = matter(fileContent);
        // Clone frontmatter before mutating (gray-matter caching gotcha)
        const fm = { ...data };
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
 */
export async function runProcessingSession(workspaceRoot, meetingSlug, jobId, jobs = jobsService) {
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
    return runProcessingSessionTestable(workspaceRoot, meetingSlug, jobId, jobs, deps);
}
