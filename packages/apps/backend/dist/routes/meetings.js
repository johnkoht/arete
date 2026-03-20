/**
 * Meeting routes — all /api/meetings endpoints.
 */
import { Hono } from 'hono';
import { spawn } from 'node:child_process';
import { getEnvApiKey } from '@mariozechner/pi-ai';
import { hasOAuthCredentials } from '@arete/core';
import * as workspaceService from '../services/workspace.js';
import * as jobsService from '../services/jobs.js';
import { runProcessingSession } from '../services/agent.js';
// Per-slug write queue — prevents concurrent write races
const writeQueue = new Map();
async function withSlugLock(slug, fn) {
    const prior = writeQueue.get(slug) ?? Promise.resolve();
    let resolve;
    const next = new Promise((r) => {
        resolve = r;
    });
    writeQueue.set(slug, next);
    await prior;
    try {
        return await fn();
    }
    finally {
        resolve();
    }
}
export function createMeetingsRouter(workspaceRoot) {
    const app = new Hono();
    // GET /api/meetings — list meeting summaries with pagination
    // Query params: limit (default 25, max 100), offset (default 0)
    app.get('/', async (c) => {
        try {
            const limit = Math.min(parseInt(c.req.query('limit') ?? '25', 10), 100);
            const offset = parseInt(c.req.query('offset') ?? '0', 10);
            const allMeetings = await workspaceService.listMeetings(workspaceRoot);
            const total = allMeetings.length;
            const meetings = allMeetings.slice(offset, offset + limit);
            return c.json({ meetings, total, offset, limit });
        }
        catch (err) {
            console.error('[meetings] listMeetings error:', err);
            return c.json({ error: 'Failed to list meetings' }, 500);
        }
    });
    // POST /api/meetings/sync — shell out to `arete pull krisp`, returns 202 + jobId
    app.post('/sync', async (c) => {
        const jobId = jobsService.createJob('sync');
        // Fire and forget
        setImmediate(() => {
            const child = spawn('arete', ['pull', 'krisp'], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            child.stdout.on('data', (chunk) => {
                const lines = chunk.toString().split('\n').filter(Boolean);
                for (const line of lines) {
                    jobsService.appendEvent(jobId, line);
                }
            });
            child.stderr.on('data', (chunk) => {
                const lines = chunk.toString().split('\n').filter(Boolean);
                for (const line of lines) {
                    jobsService.appendEvent(jobId, line);
                }
            });
            child.on('close', (code) => {
                jobsService.setJobStatus(jobId, code === 0 ? 'done' : 'error');
            });
            child.on('error', (err) => {
                jobsService.appendEvent(jobId, `Error: ${err.message}`);
                jobsService.setJobStatus(jobId, 'error');
            });
        });
        return c.json({ jobId }, 202);
    });
    // GET /api/meetings/:slug — full meeting with staged items
    app.get('/:slug', async (c) => {
        const slug = c.req.param('slug');
        try {
            const meeting = await workspaceService.getMeeting(workspaceRoot, slug);
            if (!meeting)
                return c.json({ error: 'Meeting not found' }, 404);
            return c.json(meeting);
        }
        catch (err) {
            console.error('[meetings] getMeeting error:', err);
            return c.json({ error: 'Failed to get meeting' }, 500);
        }
    });
    // DELETE /api/meetings/:slug — delete meeting file + refresh QMD index
    app.delete('/:slug', async (c) => {
        const slug = c.req.param('slug');
        try {
            await withSlugLock(slug, () => workspaceService.deleteMeeting(workspaceRoot, slug));
            return c.json({ ok: true });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('ENOENT') || message.includes('no such file')) {
                return c.json({ error: 'Meeting not found' }, 404);
            }
            console.error('[meetings] deleteMeeting error:', err);
            return c.json({ error: 'Failed to delete meeting' }, 500);
        }
    });
    // PUT /api/meetings/:slug — update title/summary
    app.put('/:slug', async (c) => {
        const slug = c.req.param('slug');
        const body = await c.req.json();
        try {
            await withSlugLock(slug, () => workspaceService.updateMeeting(workspaceRoot, slug, body));
            const meeting = await workspaceService.getMeeting(workspaceRoot, slug);
            if (!meeting)
                return c.json({ error: 'Meeting not found' }, 404);
            return c.json(meeting);
        }
        catch (err) {
            console.error('[meetings] updateMeeting error:', err);
            return c.json({ error: 'Failed to update meeting' }, 500);
        }
    });
    // PATCH /api/meetings/:slug/items/:id — update staged item status/edits
    app.patch('/:slug/items/:id', async (c) => {
        const slug = c.req.param('slug');
        const id = c.req.param('id');
        const body = await c.req.json();
        try {
            await withSlugLock(slug, () => workspaceService.updateItemStatus(workspaceRoot, slug, id, {
                status: body.status,
                editedText: body.editedText,
            }));
            const meeting = await workspaceService.getMeeting(workspaceRoot, slug);
            if (!meeting)
                return c.json({ error: 'Meeting not found' }, 404);
            return c.json(meeting);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('not found')) {
                return c.json({ error: 'Meeting not found' }, 404);
            }
            console.error('[meetings] updateItemStatus error:', err);
            return c.json({ error: 'Failed to update item' }, 500);
        }
    });
    // POST /api/meetings/:slug/approve — commit approved items
    // Body: { goalSlug?: string } - optional goal to link action items to
    app.post('/:slug/approve', async (c) => {
        const slug = c.req.param('slug');
        // Parse optional body for goalSlug
        let goalSlug;
        try {
            const body = await c.req.json();
            goalSlug = body.goalSlug;
        }
        catch {
            // No body or invalid JSON — use defaults
        }
        try {
            const meeting = await withSlugLock(slug, () => workspaceService.approveMeeting(workspaceRoot, slug, { goalSlug }));
            return c.json(meeting);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('not found')) {
                return c.json({ error: 'Meeting not found' }, 404);
            }
            console.error('[meetings] approveMeeting error:', err);
            return c.json({ error: 'Failed to approve meeting' }, 500);
        }
    });
    // POST /api/meetings/:slug/process-people — run arete meeting process --file <path> --json
    app.post('/:slug/process-people', async (c) => {
        const slug = c.req.param('slug');
        // The file path is relative to the workspace meetings dir
        const filePath = `${workspaceRoot}/resources/meetings/${slug}.md`;
        return new Promise((resolveResp) => {
            const chunks = [];
            const errChunks = [];
            const child = spawn('arete', ['meeting', 'process', '--file', filePath, '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
            child.stdout.on('data', (chunk) => {
                chunks.push(chunk.toString());
            });
            child.stderr.on('data', (chunk) => {
                errChunks.push(chunk.toString());
            });
            child.on('close', (code) => {
                if (code !== 0) {
                    resolveResp(c.json({ error: 'process-people failed', detail: errChunks.join('') }, 500));
                    return;
                }
                try {
                    const result = JSON.parse(chunks.join(''));
                    resolveResp(c.json(result));
                }
                catch {
                    resolveResp(c.json({ error: 'Invalid JSON from process-people' }, 500));
                }
            });
            child.on('error', (err) => {
                resolveResp(c.json({ error: 'Failed to spawn process-people', detail: err.message }, 500));
            });
        });
    });
    // POST /api/meetings/:slug/process — kick off Pi SDK agent session (returns 202 + jobId)
    // Body: { clearApproved?: boolean } - if true, clears previously approved items before reprocessing
    app.post('/:slug/process', async (c) => {
        const apiKey = getEnvApiKey('anthropic');
        const hasOAuth = hasOAuthCredentials('anthropic');
        if (!apiKey && !hasOAuth) {
            return c.json({
                error: 'AI not configured',
                hint: 'Run `arete credentials login anthropic` or set ANTHROPIC_API_KEY environment variable',
            }, 503);
        }
        const slug = c.req.param('slug');
        // Parse optional body for clearApproved flag
        let clearApproved = false;
        try {
            const body = await c.req.json();
            clearApproved = body.clearApproved ?? false;
        }
        catch {
            // No body or invalid JSON — use defaults
        }
        const jobId = jobsService.createJob('process');
        // Fire and forget — return 202 immediately
        runProcessingSession(workspaceRoot, slug, jobId, jobsService, { clearApproved }).catch((err) => {
            console.error('[process] Agent error:', err);
            jobsService.setJobStatus(jobId, 'error');
        });
        return c.json({ jobId }, 202);
    });
    // GET /api/meetings/:slug/process-stream — SSE endpoint that tails job events
    app.get('/:slug/process-stream', (c) => {
        const jobId = c.req.query('jobId');
        if (!jobId) {
            return c.json({ error: 'jobId required' }, 400);
        }
        let lastSent = 0;
        let closed = false;
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                const interval = setInterval(() => {
                    // Guard against enqueueing after close (race condition)
                    if (closed) {
                        clearInterval(interval);
                        return;
                    }
                    const job = jobsService.getJob(jobId);
                    if (!job) {
                        if (!closed) {
                            closed = true;
                            clearInterval(interval);
                            try {
                                controller.close();
                            }
                            catch { /* already closed */ }
                        }
                        return;
                    }
                    const newEvents = job.events.slice(lastSent);
                    for (const ev of newEvents) {
                        if (closed)
                            break;
                        try {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: ev })}\n\n`));
                            lastSent++;
                        }
                        catch { /* stream closed */ }
                    }
                    if (job.status === 'done' || job.status === 'error') {
                        if (!closed) {
                            try {
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, status: job.status })}\n\n`));
                            }
                            catch { /* stream closed */ }
                            closed = true;
                            clearInterval(interval);
                            try {
                                controller.close();
                            }
                            catch { /* already closed */ }
                        }
                    }
                }, 500);
            },
        });
        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
            },
        });
    });
    return app;
}
