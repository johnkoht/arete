/**
 * Calendar routes — /api/calendar endpoints.
 */

import { Hono } from 'hono';
import { spawn } from 'node:child_process';

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees: string[];
  location?: string;
};

export function createCalendarRouter(_workspaceRoot: string): Hono {
  const app = new Hono();

  // GET /api/calendar/today — shell out to `arete pull calendar --today --json`
  app.get('/today', async (c) => {
    return new Promise<Response>((resolve) => {
      const chunks: string[] = [];
      const errChunks: string[] = [];

      const child = spawn('arete', ['pull', 'calendar', '--today', '--json'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout.on('data', (chunk: Buffer) => {
        chunks.push(chunk.toString());
      });

      child.stderr.on('data', (chunk: Buffer) => {
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
          const raw = JSON.parse(chunks.join('')) as unknown;
          // Normalize: arete may return array or { events: [...] }
          const events = Array.isArray(raw)
            ? raw
            : (raw as Record<string, unknown>)['events'] ?? [];
          resolve(c.json({ events, configured: true }));
        } catch {
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
