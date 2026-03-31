/**
 * Review routes — /api/review endpoints for aggregated review data.
 *
 * Used by CLI polling and web UI for task triage.
 */
import { join } from 'node:path';
import { Hono } from 'hono';
import { FileStorageAdapter, createServices, } from '@arete/core';
import * as workspaceService from '../services/workspace.js';
// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export function createReviewRouter(workspaceRoot) {
    const app = new Hono();
    const storage = new FileStorageAdapter();
    // GET /api/review/pending — aggregated pending items
    app.get('/pending', async (c) => {
        try {
            const services = await createServices(workspaceRoot);
            // 1. Get inbox tasks
            const tasks = await services.tasks.listTasks({ destination: 'inbox' });
            // 2. List all meetings and filter to 'processed' status
            const allMeetings = await workspaceService.listMeetings(workspaceRoot);
            const processedMeetings = allMeetings.filter(m => m.status === 'processed');
            // Build set of processed meeting slugs for filtering
            const processedMeetingSlugs = new Set(processedMeetings.map(m => m.slug));
            // 3. Get open commitments — filter to only those from processed meetings
            const allCommitments = await services.commitments.listOpen();
            const commitments = allCommitments.filter(c => {
                // source format is "meeting:slug" — extract slug and check if it's processed
                if (c.source.startsWith('meeting:')) {
                    const meetingSlug = c.source.slice('meeting:'.length);
                    return processedMeetingSlugs.has(meetingSlug);
                }
                return false;
            });
            // 4. Get staged decisions/learnings from processed meetings
            const decisions = [];
            const learnings = [];
            for (const meeting of processedMeetings) {
                const fullMeeting = await workspaceService.getMeeting(workspaceRoot, meeting.slug);
                if (!fullMeeting)
                    continue;
                const stagedItemStatus = fullMeeting.stagedItemStatus ?? {};
                // Extract decisions with 'pending' status
                for (const item of fullMeeting.stagedSections.decisions) {
                    const status = stagedItemStatus[item.id];
                    if (status === 'pending' || status === undefined) {
                        decisions.push({
                            id: item.id,
                            text: item.text,
                            type: 'decision',
                            meetingSlug: meeting.slug,
                            meetingTitle: meeting.title,
                            meetingDate: meeting.date,
                            source: item.source,
                            confidence: item.confidence,
                        });
                    }
                }
                // Extract learnings with 'pending' status
                for (const item of fullMeeting.stagedSections.learnings) {
                    const status = stagedItemStatus[item.id];
                    if (status === 'pending' || status === undefined) {
                        learnings.push({
                            id: item.id,
                            text: item.text,
                            type: 'learning',
                            meetingSlug: meeting.slug,
                            meetingTitle: meeting.title,
                            meetingDate: meeting.date,
                            source: item.source,
                            confidence: item.confidence,
                        });
                    }
                }
            }
            const response = {
                tasks,
                decisions,
                learnings,
                commitments,
            };
            return c.json(response);
        }
        catch (err) {
            console.error('[review] pending error:', err);
            return c.json({ error: 'Failed to load pending review items' }, 500);
        }
    });
    // POST /api/review/complete — write completion file for CLI polling
    app.post('/complete', async (c) => {
        try {
            const body = await c.req.json();
            // Validate request body
            if (!body.sessionId || typeof body.sessionId !== 'string') {
                return c.json({ error: 'sessionId is required' }, 400);
            }
            if (!Array.isArray(body.approved)) {
                return c.json({ error: 'approved must be an array' }, 400);
            }
            if (!Array.isArray(body.skipped)) {
                return c.json({ error: 'skipped must be an array' }, 400);
            }
            const sessionId = body.sessionId;
            const areteDir = join(workspaceRoot, '.arete');
            const sessionFile = join(areteDir, `.review-session-${sessionId}`);
            const completeFile = join(areteDir, `.review-complete-${sessionId}`);
            // Validate session file exists
            const sessionExists = await storage.read(sessionFile);
            if (sessionExists === null) {
                return c.json({ error: `Session not found: ${sessionId}` }, 400);
            }
            // Write completion file with approved/skipped arrays
            const completionData = {
                sessionId,
                approved: body.approved,
                skipped: body.skipped,
                completedAt: new Date().toISOString(),
            };
            await storage.write(completeFile, JSON.stringify(completionData, null, 2));
            return c.json({ success: true });
        }
        catch (err) {
            console.error('[review] complete error:', err);
            return c.json({ error: 'Failed to complete review session' }, 500);
        }
    });
    return app;
}
