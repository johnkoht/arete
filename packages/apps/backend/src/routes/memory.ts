/**
 * Memory routes — /api/memory endpoints.
 * Parses .arete/memory/items/decisions.md and learnings.md.
 */

import { Hono } from 'hono';
import { join } from 'node:path';
import fs from 'node:fs/promises';

export type MemoryItemType = 'decision' | 'learning';

export type MemoryItem = {
  id: string;
  type: MemoryItemType;
  date: string;
  title: string;
  content: string;
  source?: string;
};

/**
 * Parse a memory markdown file (decisions.md or learnings.md).
 * Entries are separated by `### YYYY-MM-DD: Title` headers.
 */
function parseMemoryFile(raw: string, type: MemoryItemType): MemoryItem[] {
  const items: MemoryItem[] = [];

  // Split on `### YYYY-MM-DD` headers
  const sections = raw.split(/^(?=###\s+\d{4}-\d{2}-\d{2})/m);

  for (const section of sections) {
    const headerMatch = /^###\s+(\d{4}-\d{2}-\d{2})(?:[:\s]+(.+))?$/m.exec(section);
    if (!headerMatch) continue;

    const date = headerMatch[1] ?? '';
    const title = (headerMatch[2] ?? '').trim();
    const content = section.replace(/^###.*\n/, '').trim();

    // Extract source if present
    const sourceMatch = /\*\*Source\*\*:\s*(.+)$/m.exec(content);
    const source = sourceMatch ? sourceMatch[1].trim() : undefined;

    items.push({
      id: `${type}-${date}-${title.toLowerCase().replace(/\s+/g, '-').slice(0, 40)}`,
      type,
      date,
      title: title || `${type} from ${date}`,
      content,
      source,
    });
  }

  return items;
}

export async function loadMemoryItems(workspaceRoot: string): Promise<MemoryItem[]> {
  const memoryDir = join(workspaceRoot, '.arete', 'memory', 'items');
  const items: MemoryItem[] = [];

  // Read decisions
  try {
    const raw = await fs.readFile(join(memoryDir, 'decisions.md'), 'utf8');
    items.push(...parseMemoryFile(raw, 'decision'));
  } catch {
    // file not found — skip
  }

  // Read learnings
  try {
    const raw = await fs.readFile(join(memoryDir, 'learnings.md'), 'utf8');
    items.push(...parseMemoryFile(raw, 'learning'));
  } catch {
    // file not found — skip
  }

  // Sort by date descending (newest first)
  items.sort((a, b) => b.date.localeCompare(a.date));

  return items;
}

export function createMemoryRouter(workspaceRoot: string): Hono {
  const app = new Hono();

  /**
   * GET /api/memory — paginated, filterable memory feed
   * Query params:
   *   type=all|decision|learning (default: all)
   *   q=<search> (optional, title+content search)
   *   limit=N (default: 50)
   *   offset=N (default: 0)
   */
  app.get('/', async (c) => {
    const typeParam = c.req.query('type') ?? 'all';
    const q = c.req.query('q') ?? '';
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    try {
      let items = await loadMemoryItems(workspaceRoot);

      // Filter by type
      if (typeParam === 'decision') {
        items = items.filter((i) => i.type === 'decision');
      } else if (typeParam === 'learning') {
        items = items.filter((i) => i.type === 'learning');
      }

      // Search filter
      if (q.trim()) {
        const lower = q.toLowerCase();
        items = items.filter(
          (i) =>
            i.title.toLowerCase().includes(lower) ||
            i.content.toLowerCase().includes(lower)
        );
      }

      const total = items.length;
      const page = items.slice(offset, offset + limit);

      return c.json({ items: page, total, offset, limit });
    } catch (err) {
      console.error('[memory] error:', err);
      return c.json({ error: 'Failed to load memory' }, 500);
    }
  });

  /**
   * GET /api/memory/recent — last N items interleaved across types
   * Query params:
   *   limit=N (default: 5)
   */
  app.get('/recent', async (c) => {
    const limit = Math.min(parseInt(c.req.query('limit') ?? '5', 10), 50);

    try {
      const items = await loadMemoryItems(workspaceRoot);
      return c.json({ items: items.slice(0, limit) });
    } catch (err) {
      console.error('[memory] recent error:', err);
      return c.json({ error: 'Failed to load recent memory' }, 500);
    }
  });

  return app;
}
