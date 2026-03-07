/**
 * Pi SDK agent integration for meeting processing.
 *
 * Creates an in-memory agent session, streams events into the job store,
 * and resolves when the agent finishes.
 */
import { createAgentSession, SessionManager, createCodingTools } from '@mariozechner/pi-coding-agent';
import { getEnvApiKey } from '@mariozechner/pi-ai';
import * as jobsService from './jobs.js';
/**
 * Build the processing prompt for a given meeting slug.
 */
function processingPrompt(meetingSlug) {
    return `Process the meeting at resources/meetings/${meetingSlug}.md. Use the process-meetings skill.
Write extracted action items, decisions, and learnings as staged sections in the meeting file with these EXACT headers and ID format:

## Staged Action Items
- ai_001: [action item text]

## Staged Decisions
- de_001: [decision text]

## Staged Learnings
- le_001: [learning text]

IDs must be zero-padded 3 digits (ai_001, de_001, le_001, etc.). Do NOT commit items to .arete/memory/ — write staged sections only. Set the meeting's status frontmatter field to 'processed' and add processed_at with an ISO timestamp.`;
}
/**
 * Run a Pi SDK agent session to process a meeting.
 *
 * - Checks for API key before creating the session.
 * - Streams text deltas and tool-start events to the job event log.
 * - Sets job status to 'done' on completion, or 'error' on exception.
 *
 * @param workspaceRoot  Absolute path to the Areté workspace
 * @param meetingSlug    Meeting file slug (no .md extension)
 * @param jobId          ID of the background job to append events to
 * @param jobs           Jobs service (real or mock) — defaults to the real module
 */
export async function runProcessingSession(workspaceRoot, meetingSlug, jobId, jobs = jobsService) {
    // 1. Validate API key before doing anything expensive
    const apiKey = getEnvApiKey('anthropic');
    if (!apiKey) {
        jobs.setJobStatus(jobId, 'error');
        jobs.appendEvent(jobId, 'Error: ANTHROPIC_API_KEY is not configured');
        throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    // 2. Create in-memory session rooted at the workspace
    const { session } = await createAgentSession({
        cwd: workspaceRoot,
        sessionManager: SessionManager.inMemory(),
        tools: createCodingTools(workspaceRoot),
    });
    // 3. Subscribe to events — capture text deltas and tool starts
    const unsubscribe = session.subscribe((event) => {
        switch (event.type) {
            case 'message_update': {
                // AssistantMessageEvent has type:'text_delta' with delta: string
                const ev = event.assistantMessageEvent;
                if (ev?.type === 'text_delta') {
                    jobs.appendEvent(jobId, ev.delta);
                }
                break;
            }
            case 'tool_execution_start': {
                jobs.appendEvent(jobId, `[tool] ${event.toolName}`);
                break;
            }
            // Ignore all other event types
        }
    });
    try {
        // 4. Send the processing prompt and await completion
        await session.prompt(processingPrompt(meetingSlug));
        // 5. Mark job done
        jobs.setJobStatus(jobId, 'done');
    }
    catch (err) {
        // 6. On any exception — mark job error and re-throw
        jobs.setJobStatus(jobId, 'error');
        throw err;
    }
    finally {
        unsubscribe();
    }
}
