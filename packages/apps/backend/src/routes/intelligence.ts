/**
 * Intelligence routes — /api/intelligence endpoints.
 */

import { join } from 'node:path';
import { Hono } from 'hono';
import { FileStorageAdapter, detectCrossPersonPatterns } from '@arete/core';

export function createIntelligenceRouter(workspaceRoot: string): Hono {
  const app = new Hono();
  const storage = new FileStorageAdapter();

  // GET /api/intelligence/patterns — cross-person signal patterns
  app.get('/patterns', async (c) => {
    try {
      const daysParam = c.req.query('days');
      const days = daysParam ? parseInt(daysParam, 10) : 30;
      const lookbackDays = Number.isNaN(days) || days < 1 ? 30 : days;

      const meetingsDir = join(workspaceRoot, 'resources', 'meetings');
      const patterns = await detectCrossPersonPatterns(meetingsDir, storage, {
        days: lookbackDays,
      });

      return c.json({ success: true, patterns, count: patterns.length });
    } catch (err) {
      console.error('[intelligence] patterns error:', err);
      return c.json({ error: 'Failed to detect patterns' }, 500);
    }
  });

  return app;
}
