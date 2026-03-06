/**
 * Intelligence routes — /api/intelligence endpoints.
 */

import { join } from 'node:path';
import fs from 'node:fs/promises';
import { Hono } from 'hono';
import { FileStorageAdapter, detectCrossPersonPatterns } from '@arete/core';

type CommitmentEntry = {
  id: string;
  text: string;
  direction: string;
  personSlug: string;
  personName: string;
  source: string;
  date: string;
  status: string;
  resolvedAt: string | null;
};

type CommitmentsFile = {
  commitments: CommitmentEntry[];
};

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

  // GET /api/intelligence/commitments/summary — commitment counts
  app.get('/commitments/summary', async (c) => {
    try {
      const filePath = join(workspaceRoot, '.arete', 'commitments.json');
      let commitments: CommitmentEntry[] = [];

      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw) as CommitmentsFile;
        commitments = parsed.commitments ?? [];
      } catch {
        // File doesn't exist or invalid JSON — return zeros
      }

      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);

      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 7);

      const open = commitments.filter((c) => c.status === 'open');
      const openCount = open.length;

      const dueThisWeek = open.filter((c) => {
        const d = new Date(c.date);
        return d >= sevenDaysAgo && d <= now;
      }).length;

      const overdue = open.filter((c) => {
        const d = new Date(c.date);
        return d < sevenDaysAgo;
      }).length;

      return c.json({ open: openCount, dueThisWeek, overdue });
    } catch (err) {
      console.error('[intelligence] commitments/summary error:', err);
      return c.json({ error: 'Failed to load commitments summary' }, 500);
    }
  });

  return app;
}
