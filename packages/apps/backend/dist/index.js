/**
 * Entry point — reads env, validates workspace, starts server and watcher.
 */
import { serve } from '@hono/node-server';
import { join } from 'node:path';
import fs from 'node:fs/promises';
import { createApp, broadcastSseEvent } from './server.js';
import { startMeetingWatcher } from './services/watcher.js';
import * as jobsService from './services/jobs.js';
import { runProcessingSession } from './services/agent.js';
import { writeActivityEvent } from './services/activity.js';
const workspaceRoot = process.env['ARETE_WORKSPACE'];
if (!workspaceRoot) {
    console.error('ARETE_WORKSPACE environment variable is required');
    process.exit(1);
}
// Load API key from file if not already in env (persisted from previous session)
async function loadApiKeyFromFile(workspace) {
    if (process.env['ANTHROPIC_API_KEY'])
        return; // Already set
    const keyFile = join(workspace, '.credentials', 'anthropic-api-key');
    try {
        const key = (await fs.readFile(keyFile, 'utf8')).trim();
        if (key) {
            process.env['ANTHROPIC_API_KEY'] = key;
            console.log('[startup] Loaded API key from .credentials/anthropic-api-key');
        }
    }
    catch {
        // File doesn't exist — that's fine
    }
}
await loadApiKeyFromFile(workspaceRoot);
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
            const processedAt = new Date().toISOString();
            // Emit SSE event to connected clients
            broadcastSseEvent('meeting:processed', { slug, jobId, processedAt });
            // Persist activity event for the feed
            await writeActivityEvent(workspaceRoot, {
                id: crypto.randomUUID(),
                type: 'meeting:processed',
                title: `Meeting processed: ${slug}`,
                detail: slug,
                timestamp: processedAt,
            });
        }
        catch (err) {
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
