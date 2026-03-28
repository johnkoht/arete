/**
 * Hono app factory.
 */
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { createMeetingsRouter } from './routes/meetings.js';
import jobsRouter from './routes/jobs.js';
import { createIntelligenceRouter, createCommitmentsRouter } from './routes/intelligence.js';
import { createCalendarRouter } from './routes/calendar.js';
import { createProjectsRouter } from './routes/projects.js';
import { createMemoryRouter } from './routes/memory.js';
import { createPeopleRouter } from './routes/people.js';
import { createGoalsRouter } from './routes/goals.js';
import { createSearchRouter } from './routes/search.js';
import { createSettingsRouter } from './routes/settings.js';
import { createReviewRouter } from './routes/review.js';
import { readActivityEvents } from './services/activity.js';
// Absolute path to packages/apps/web/dist/ — resolved from this file's location
const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIST_ABS = join(__dirname, '..', '..', 'web', 'dist');
// serveStatic requires a path relative to process.cwd() (absolute paths not supported)
const webDistRelative = relative(process.cwd(), WEB_DIST_ABS);
const sseClients = new Map();
/**
 * Broadcast an SSE event to all connected clients.
 */
export function broadcastSseEvent(eventName, data) {
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients.values()) {
        try {
            client.write(payload);
        }
        catch {
            sseClients.delete(client.id);
        }
    }
}
export function createApp(workspaceRoot) {
    const app = new Hono();
    // Middleware
    app.use('*', cors({ origin: '*' }));
    // Health check
    app.get('/health', (c) => c.json({ ok: true }));
    // SSE endpoint — clients connect to receive real-time events
    app.get('/api/events', (c) => {
        const clientId = crypto.randomUUID();
        const stream = new ReadableStream({
            start(controller) {
                const encoder = new TextEncoder();
                // Send initial connection event
                controller.enqueue(encoder.encode(`event: connected\ndata: {"clientId":"${clientId}"}\n\n`));
                const client = {
                    id: clientId,
                    write(data) {
                        controller.enqueue(encoder.encode(data));
                    },
                    close() {
                        try {
                            controller.close();
                        }
                        catch { /* already closed */ }
                    },
                };
                sseClients.set(clientId, client);
                // Cleanup on disconnect
                c.req.raw.signal.addEventListener('abort', () => {
                    sseClients.delete(clientId);
                });
            },
        });
        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
            },
        });
    });
    // API Routes
    app.route('/api/meetings', createMeetingsRouter(workspaceRoot));
    app.route('/api/jobs', jobsRouter);
    app.route('/api/intelligence', createIntelligenceRouter(workspaceRoot));
    app.route('/api/commitments', createCommitmentsRouter(workspaceRoot));
    app.route('/api/calendar', createCalendarRouter(workspaceRoot));
    app.route('/api/projects', createProjectsRouter(workspaceRoot));
    app.route('/api/memory', createMemoryRouter(workspaceRoot));
    app.route('/api/people', createPeopleRouter(workspaceRoot));
    app.route('/api/goals', createGoalsRouter(workspaceRoot));
    app.route('/api/search', createSearchRouter(workspaceRoot));
    app.route('/api/settings', createSettingsRouter(workspaceRoot));
    app.route('/api/review', createReviewRouter(workspaceRoot));
    // GET /api/activity?limit=10 — recent activity events
    app.get('/api/activity', async (c) => {
        try {
            const limitParam = c.req.query('limit');
            const limit = limitParam ? Math.max(1, parseInt(limitParam, 10)) : 10;
            const safeLimit = Number.isNaN(limit) ? 10 : limit;
            const events = await readActivityEvents(workspaceRoot, safeLimit);
            return c.json({ events });
        }
        catch (err) {
            console.error('[activity] error:', err);
            return c.json({ error: 'Failed to load activity' }, 500);
        }
    });
    // Serve static web app from packages/apps/web/dist/
    // Assets (JS/CSS with content-hashed filenames)
    app.use('/assets/*', serveStatic({ root: webDistRelative }));
    // All other paths → index.html for client-side routing
    app.use('*', serveStatic({ root: webDistRelative, path: 'index.html' }));
    // JSON error handler
    app.onError((err, c) => {
        console.error('[backend] Unhandled error:', err);
        return c.json({ error: err.message ?? 'Internal server error' }, 500);
    });
    return app;
}
