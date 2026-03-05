/**
 * Hono app factory.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMeetingsRouter } from './routes/meetings.js';
import jobsRouter from './routes/jobs.js';

export function createApp(workspaceRoot: string): Hono {
  const app = new Hono();

  // Middleware
  app.use('*', cors({ origin: '*' }));

  // Health check
  app.get('/health', (c) => c.json({ ok: true }));

  // Routes
  app.route('/api/meetings', createMeetingsRouter(workspaceRoot));
  app.route('/api/jobs', jobsRouter);

  // JSON error handler
  app.onError((err, c) => {
    console.error('[backend] Unhandled error:', err);
    return c.json({ error: err.message ?? 'Internal server error' }, 500);
  });

  return app;
}
