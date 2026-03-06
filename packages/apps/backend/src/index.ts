/**
 * Entry point — reads env, validates workspace, starts server and watcher.
 */

import { serve } from '@hono/node-server';
import { createApp, broadcastSseEvent } from './server.js';
import { startMeetingWatcher } from './services/watcher.js';
import * as jobsService from './services/jobs.js';
import { runProcessingSession } from './services/agent.js';

const workspaceRoot = process.env['ARETE_WORKSPACE'];
if (!workspaceRoot) {
  console.error('ARETE_WORKSPACE environment variable is required');
  process.exit(1);
}

const port = parseInt(process.env['PORT'] ?? '3847', 10);
const app = createApp(workspaceRoot);

// Start the server
const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`Backend ready on http://localhost:${port}`);

  // Start the meeting file watcher after server is ready
  const stopWatcher = startMeetingWatcher(workspaceRoot, async (slug) => {
    console.log(`[watcher] New synced meeting detected: ${slug}`);

    // Create a background job for auto-processing
    const jobId = jobsService.createJob('auto-process');
    console.log(`[watcher] Created job ${jobId} for meeting ${slug}`);

    try {
      await runProcessingSession(workspaceRoot, slug, jobId);
      console.log(`[watcher] Auto-processed meeting ${slug}`);

      // Emit SSE event to connected clients
      broadcastSseEvent('meeting:processed', {
        slug,
        jobId,
        processedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[watcher] Failed to process meeting ${slug}:`, err);
    }
  });

  // Clean up watcher on process exit
  process.on('SIGTERM', () => {
    stopWatcher();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    stopWatcher();
    process.exit(0);
  });
});
