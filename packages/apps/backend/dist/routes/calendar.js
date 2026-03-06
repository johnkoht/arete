/**
 * Calendar routes — /api/calendar endpoints.
 */
import { Hono } from 'hono';
import { spawn } from 'node:child_process';
export function createCalendarRouter(_workspaceRoot) {
    const app = new Hono();
    // GET /api/calendar/today — shell out to `arete pull calendar --today --json`
    app.get('/today', async (c) => {
        return new Promise((resolve) => {
            const chunks = [];
            const errChunks = [];
            const child = spawn('arete', ['pull', 'calendar', '--today', '--json'], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            child.stdout.on('data', (chunk) => {
                chunks.push(chunk.toString());
            });
            child.stderr.on('data', (chunk) => {
                errChunks.push(chunk.toString());
            });
            child.on('close', (code) => {
                if (code !== 0) {
                    // Calendar not configured or arete not available — return empty gracefully
                    console.warn('[calendar] arete pull calendar failed:', errChunks.join(''));
                    resolve(c.json({ events: [], configured: false }));
                    return;
                }
                try {
                    const raw = JSON.parse(chunks.join(''));
                    // Normalize: arete may return array or { events: [...] }
                    const events = Array.isArray(raw)
                        ? raw
                        : raw['events'] ?? [];
                    resolve(c.json({ events, configured: true }));
                }
                catch {
                    // JSON parse failed — return empty
                    resolve(c.json({ events: [], configured: false }));
                }
            });
            child.on('error', () => {
                // arete not found — return empty gracefully
                resolve(c.json({ events: [], configured: false }));
            });
        });
    });
    return app;
}
