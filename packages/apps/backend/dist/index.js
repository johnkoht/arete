/**
 * Entry point — reads env, validates workspace, starts server and watcher.
 */
import { serve } from '@hono/node-server';
import { createApp, broadcastSseEvent } from './server.js';
import { startMeetingWatcher, startTaskFileWatcher } from './services/watcher.js';
import { initializeAIService } from './services/agent.js';
import { loadConfig, loadCredentialsIntoEnv, AIService, FileStorageAdapter, } from '@arete/core';
import { writeActivityEvent } from './services/activity.js';
const workspaceRoot = process.env['ARETE_WORKSPACE'];
if (!workspaceRoot) {
    console.error('ARETE_WORKSPACE environment variable is required');
    process.exit(1);
}
// Load credentials from ~/.arete/credentials.yaml into environment
loadCredentialsIntoEnv();
// Load configuration and initialize AIService
const storage = new FileStorageAdapter();
const config = await loadConfig(storage, workspaceRoot);
const aiService = new AIService(config);
initializeAIService(aiService, config);
if (aiService.isConfigured()) {
    console.log('[startup] AIService initialized with AI configuration');
}
else {
    console.log('[startup] AIService initialized but no AI provider configured');
}
const port = parseInt(process.env['PORT'] ?? '3847', 10);
const app = createApp(workspaceRoot);
// Start the server
const server = serve({ fetch: app.fetch, port }, () => {
    console.log(`Backend ready on http://localhost:${port}`);
    // Start the meeting file watcher after server is ready
    const stopWatcher = startMeetingWatcher(workspaceRoot, (slug) => {
        console.log(`[watcher] New synced meeting detected: ${slug}`);
        const detectedAt = new Date().toISOString();
        broadcastSseEvent('meeting:synced', { slug, detectedAt });
        writeActivityEvent(workspaceRoot, {
            id: `sync-${slug}-${Date.now()}`,
            type: 'meeting:synced',
            title: `Meeting synced: ${slug}`,
            timestamp: detectedAt,
        }).catch((err) => console.error('[watcher] Failed to write activity event:', err));
    });
    // Start the task file watcher — emits SSE events when week.md or tasks.md change
    const stopTaskWatcher = startTaskFileWatcher(workspaceRoot, (filename) => {
        console.log(`[task-watcher] File changed: ${filename}`);
        broadcastSseEvent('task:changed', { file: filename, changedAt: new Date().toISOString() });
    });
    // Clean up watchers on process exit
    process.on('SIGTERM', () => {
        stopWatcher();
        stopTaskWatcher();
        process.exit(0);
    });
    process.on('SIGINT', () => {
        stopWatcher();
        stopTaskWatcher();
        process.exit(0);
    });
});
