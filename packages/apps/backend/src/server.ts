/**
 * Hono app factory.
 */

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

// Absolute path to packages/apps/web/dist/ — resolved from this file's location
const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIST_ABS = join(__dirname, '..', '..', 'web', 'dist');

// serveStatic requires a path relative to process.cwd() (absolute paths not supported)
const webDistRelative = relative(process.cwd(), WEB_DIST_ABS);

export function createApp(workspaceRoot: string): Hono {
  const app = new Hono();

  // Middleware
  app.use('*', cors({ origin: '*' }));

  // Health check
  app.get('/health', (c) => c.json({ ok: true }));

  // API Routes
  app.route('/api/meetings', createMeetingsRouter(workspaceRoot));
  app.route('/api/jobs', jobsRouter);

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
