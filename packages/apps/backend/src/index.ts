/**
 * Entry point — reads env, validates workspace, starts server.
 */

import { serve } from '@hono/node-server';
import { createApp } from './server.js';

const workspaceRoot = process.env['ARETE_WORKSPACE'];
if (!workspaceRoot) {
  console.error('ARETE_WORKSPACE environment variable is required');
  process.exit(1);
}

const port = parseInt(process.env['PORT'] ?? '3847', 10);
const app = createApp(workspaceRoot);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Backend ready on http://localhost:${port}`);
});
