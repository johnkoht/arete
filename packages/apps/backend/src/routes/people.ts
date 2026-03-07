/**
 * People routes — /api/people endpoints.
 * Scans people/**\/*.md, parses frontmatter + auto-memory block.
 */

import { Hono } from 'hono';
import { join } from 'node:path';
import fs from 'node:fs/promises';
import matter from 'gray-matter';

export type PersonCategory = 'internal' | 'customer' | 'user';

export type PersonSummary = {
  slug: string;
  name: string;
  role: string;
  company: string;
  category: PersonCategory;
  healthScore: number | null;
  healthStatus: string | null;
  lastMeetingDate: string | null;
  lastMeetingTitle: string | null;
  openCommitments: number;
  trend: 'up' | 'flat' | 'down' | null;
};

export type PersonDetail = PersonSummary & {
  email: string;
  recentMeetings: Array<{ date: string; title: string }>;
  openCommitmentItems: Array<{
    id: string;
    text: string;
    direction: string;
    date: string;
  }>;
  stances: string[];
  repeatedAsks: string[];
  repeatedConcerns: string[];
  rawContent: string;
  allMeetings: Array<{ slug: string; date: string; title: string; attendeeIds: string[] }>;
};

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

async function loadCommitments(workspaceRoot: string): Promise<CommitmentEntry[]> {
  try {
    const raw = await fs.readFile(join(workspaceRoot, '.arete', 'commitments.json'), 'utf8');
    const parsed = JSON.parse(raw) as CommitmentsFile;
    return parsed.commitments ?? [];
  } catch {
    return [];
  }
}

function parseAutoMemoryBlock(content: string): {
  healthScore: number | null;
  healthStatus: string | null;
  lastMeetingDate: string | null;
  meetingsLast30d: number;
  meetingsLast90d: number;
  stances: string[];
  repeatedAsks: string[];
  repeatedConcerns: string[];
} {
  const blockMatch = /<!-- AUTO_PERSON_MEMORY:START -->([\s\S]*?)<!-- AUTO_PERSON_MEMORY:END -->/i.exec(content);
  if (!blockMatch) {
    return {
      healthScore: null,
      healthStatus: null,
      lastMeetingDate: null,
      meetingsLast30d: 0,
      meetingsLast90d: 0,
      stances: [],
      repeatedAsks: [],
      repeatedConcerns: [],
    };
  }

  const block = blockMatch[1] ?? '';

  // Parse relationship health section
  let healthScore: number | null = null;
  let healthStatus: string | null = null;
  let lastMeetingDate: string | null = null;
  let meetingsLast30d = 0;
  let meetingsLast90d = 0;

  // Last met: 2026-03-04 (1 days ago)
  const lastMetMatch = /Last met:\s*(\d{4}-\d{2}-\d{2})/i.exec(block);
  if (lastMetMatch) lastMeetingDate = lastMetMatch[1] ?? null;

  // Meetings: 3 in last 30d, 9 in last 90d
  const meetingsMatch = /Meetings:\s*(\d+)\s+in last 30d,\s*(\d+)\s+in last 90d/i.exec(block);
  if (meetingsMatch) {
    meetingsLast30d = parseInt(meetingsMatch[1] ?? '0', 10);
    meetingsLast90d = parseInt(meetingsMatch[2] ?? '0', 10);
  }

  // Status: Active
  const statusMatch = /Status:\s*(.+)$/im.exec(block);
  if (statusMatch) healthStatus = (statusMatch[1] ?? '').trim();

  // Compute health score from meetings frequency (heuristic)
  if (meetingsLast30d > 0) {
    if (meetingsLast30d >= 4) healthScore = 90;
    else if (meetingsLast30d >= 2) healthScore = 70;
    else healthScore = 50;
  } else if (lastMeetingDate) {
    const daysSince = Math.floor((Date.now() - new Date(lastMeetingDate).getTime()) / 86400000);
    if (daysSince <= 14) healthScore = 60;
    else if (daysSince <= 30) healthScore = 40;
    else healthScore = 20;
  }

  // Parse stances section
  const stancesMatch = /### Stances\s*\n([\s\S]*?)(?=\n###|\n<!--)/i.exec(block);
  const stances: string[] = [];
  if (stancesMatch) {
    const stanceLines = stancesMatch[1]?.split('\n') ?? [];
    for (const line of stanceLines) {
      const trimmed = line.replace(/^[-*]\s+/, '').trim();
      if (trimmed && trimmed !== 'None detected yet.') {
        stances.push(trimmed);
      }
    }
  }

  // Parse repeated asks
  const asksMatch = /### Repeated asks\s*\n([\s\S]*?)(?=\n###|\n<!--)/i.exec(block);
  const repeatedAsks: string[] = [];
  if (asksMatch) {
    const lines = asksMatch[1]?.split('\n') ?? [];
    for (const line of lines) {
      const trimmed = line.replace(/^[-*]\s+/, '').trim();
      if (trimmed && trimmed !== 'None detected yet.') {
        repeatedAsks.push(trimmed);
      }
    }
  }

  // Parse repeated concerns
  const concernsMatch = /### Repeated concerns\s*\n([\s\S]*?)(?=\n###|\n<!--)/i.exec(block);
  const repeatedConcerns: string[] = [];
  if (concernsMatch) {
    const lines = concernsMatch[1]?.split('\n') ?? [];
    for (const line of lines) {
      const trimmed = line.replace(/^[-*]\s+/, '').trim();
      if (trimmed && trimmed !== 'None detected yet.') {
        repeatedConcerns.push(trimmed);
      }
    }
  }

  return {
    healthScore,
    healthStatus,
    lastMeetingDate,
    meetingsLast30d,
    meetingsLast90d,
    stances,
    repeatedAsks,
    repeatedConcerns,
  };
}

function parseRecentMeetings(content: string): Array<{ date: string; title: string }> {
  // Parse ## Recent Meetings section
  const sectionMatch = /^##\s+Recent Meetings\s*\n([\s\S]*?)(?=\n##\s|\n<!--|\z)/im.exec(content);
  if (!sectionMatch) return [];

  const meetings: Array<{ date: string; title: string }> = [];
  const lines = (sectionMatch[1] ?? '').split('\n');

  for (const line of lines) {
    // Format: - 2026-03-04 — Title
    const match = /^[-*]\s+(\d{4}-\d{2}-\d{2})\s+[—–-]\s+(.+)$/.exec(line.trim());
    if (match) {
      meetings.push({ date: match[1] ?? '', title: (match[2] ?? '').trim() });
    }
  }

  return meetings;
}

function computeTrend(
  meetingsLast30d: number,
  meetingsLast90d: number
): 'up' | 'flat' | 'down' | null {
  if (meetingsLast30d === 0 && meetingsLast90d === 0) return null;
  const avg30 = meetingsLast30d;
  const avg60to90 = Math.max(0, meetingsLast90d - meetingsLast30d) / 2;
  if (avg30 > avg60to90 + 0.5) return 'up';
  if (avg30 < avg60to90 - 0.5) return 'down';
  return 'flat';
}

async function scanPeopleDir(
  workspaceRoot: string
): Promise<Array<{ slug: string; category: PersonCategory; filePath: string }>> {
  const categories: PersonCategory[] = ['internal', 'customer', 'user'];
  const results: Array<{ slug: string; category: PersonCategory; filePath: string }> = [];

  for (const category of categories) {
    const dirName = category === 'user' ? 'users' : category === 'internal' ? 'internal' : `${category}s`;
    const dir = join(workspaceRoot, 'people', dirName);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith('.md') || entry === 'index.md') continue;
      const slug = entry.slice(0, -3);
      results.push({ slug, category, filePath: join(dir, entry) });
    }
  }

  return results;
}

async function findMeetingsForPerson(
  workspaceRoot: string,
  personSlug: string
): Promise<Array<{ slug: string; date: string; title: string; attendeeIds: string[] }>> {
  const meetingsDir = join(workspaceRoot, 'resources', 'meetings');
  let files: string[];
  try {
    files = await fs.readdir(meetingsDir);
  } catch {
    return [];
  }

  const meetings: Array<{ slug: string; date: string; title: string; attendeeIds: string[] }> = [];

  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    try {
      const raw = await fs.readFile(join(meetingsDir, file), 'utf8');
      const { data } = matter(raw);
      const fm = data as Record<string, unknown>;
      const attendeeIds = Array.isArray(fm['attendee_ids']) ? (fm['attendee_ids'] as string[]) : [];
      if (!attendeeIds.includes(personSlug)) continue;
      const slug = file.slice(0, -3);
      const date = typeof fm['date'] === 'string' ? fm['date'] : slug.slice(0, 10);
      const title = typeof fm['title'] === 'string' ? fm['title'] : slug;
      meetings.push({ slug, date, title, attendeeIds });
    } catch {
      // skip unreadable files
    }
  }

  meetings.sort((a, b) => b.date.localeCompare(a.date));
  return meetings;
}

export function createPeopleRouter(workspaceRoot: string): Hono {
  const app = new Hono();

  // GET /api/people — all people with summary data
  app.get('/', async (c) => {
    try {
      const [personFiles, commitments] = await Promise.all([
        scanPeopleDir(workspaceRoot),
        loadCommitments(workspaceRoot),
      ]);

      const people: PersonSummary[] = [];

      for (const { slug, category, filePath } of personFiles) {
        try {
          const raw = await fs.readFile(filePath, 'utf8');
          const { data, content } = matter(raw);
          const fm = data as Record<string, unknown>;

          const autoMemory = parseAutoMemoryBlock(raw);
          const recentMeetings = parseRecentMeetings(content);

          // Commitments count
          const openCommitments = commitments.filter(
            (c) => c.personSlug === slug && c.status === 'open'
          ).length;

          // Last meeting — prefer auto-memory date, fall back to parsed meetings
          const lastMeetingDate =
            autoMemory.lastMeetingDate ??
            (recentMeetings.length > 0 ? (recentMeetings[0]?.date ?? null) : null);

          const lastMeetingTitle =
            recentMeetings.length > 0 ? (recentMeetings[0]?.title ?? null) : null;

          const trend = computeTrend(
            autoMemory.meetingsLast30d,
            autoMemory.meetingsLast90d
          );

          people.push({
            slug,
            name: typeof fm['name'] === 'string' ? fm['name'] : slug,
            role: typeof fm['role'] === 'string' ? fm['role'] : '',
            company: typeof fm['company'] === 'string' ? fm['company'] : '',
            category,
            healthScore: autoMemory.healthScore,
            healthStatus: autoMemory.healthStatus,
            lastMeetingDate,
            lastMeetingTitle,
            openCommitments,
            trend,
          });
        } catch {
          // skip unreadable files
        }
      }

      // Sort by name
      people.sort((a, b) => a.name.localeCompare(b.name));

      return c.json({ people });
    } catch (err) {
      console.error('[people] error:', err);
      return c.json({ error: 'Failed to load people' }, 500);
    }
  });

  // GET /api/people/:slug — full person detail
  app.get('/:slug', async (c) => {
    const slug = c.req.param('slug');

    try {
      const personFiles = await scanPeopleDir(workspaceRoot);
      const found = personFiles.find((p) => p.slug === slug);

      if (!found) {
        return c.json({ error: 'Person not found' }, 404);
      }

      const [raw, commitments, allMeetings] = await Promise.all([
        fs.readFile(found.filePath, 'utf8'),
        loadCommitments(workspaceRoot),
        findMeetingsForPerson(workspaceRoot, slug),
      ]);

      const { data, content } = matter(raw);
      const fm = data as Record<string, unknown>;

      const autoMemory = parseAutoMemoryBlock(raw);
      const recentMeetings = parseRecentMeetings(content);

      // Strip auto-managed sections from content for rawContent.
      // Use greedy [\s\S]* (no ?) so the heading + ALL content after it is consumed.
      // ## Recent Meetings is always the last user-visible section, so greedy is safe.
      const rawContent = content
        .replace(/<!-- AUTO_PERSON_MEMORY:START -->[\s\S]*?<!-- AUTO_PERSON_MEMORY:END -->/i, '')
        .replace(/\n?^##\s+Recent Meetings[\s\S]*/im, '')
        .trim();

      const openCommitmentItems = commitments.filter(
        (c) => c.personSlug === slug && c.status === 'open'
      );

      const openCommitmentsCount = openCommitmentItems.length;
      const lastMeetingDate =
        autoMemory.lastMeetingDate ??
        (recentMeetings.length > 0 ? (recentMeetings[0]?.date ?? null) : null);
      const lastMeetingTitle =
        recentMeetings.length > 0 ? (recentMeetings[0]?.title ?? null) : null;

      const trend = computeTrend(autoMemory.meetingsLast30d, autoMemory.meetingsLast90d);

      const detail: PersonDetail = {
        slug,
        name: typeof fm['name'] === 'string' ? fm['name'] : slug,
        role: typeof fm['role'] === 'string' ? fm['role'] : '',
        company: typeof fm['company'] === 'string' ? fm['company'] : '',
        email: typeof fm['email'] === 'string' ? fm['email'] : '',
        category: found.category,
        healthScore: autoMemory.healthScore,
        healthStatus: autoMemory.healthStatus,
        lastMeetingDate,
        lastMeetingTitle,
        openCommitments: openCommitmentsCount,
        trend,
        recentMeetings: recentMeetings.slice(0, 5),
        openCommitmentItems: openCommitmentItems.map((ci) => ({
          id: ci.id,
          text: ci.text,
          direction: ci.direction,
          date: ci.date,
        })),
        stances: autoMemory.stances,
        repeatedAsks: autoMemory.repeatedAsks,
        repeatedConcerns: autoMemory.repeatedConcerns,
        rawContent,
        allMeetings,
      };

      return c.json(detail);
    } catch (err) {
      console.error('[people] detail error:', err);
      return c.json({ error: 'Failed to load person' }, 500);
    }
  });

  // PATCH /api/people/:slug/notes — update person notes (body after frontmatter)
  app.patch('/:slug/notes', async (c) => {
    const slug = c.req.param('slug');

    try {
      const personFiles = await scanPeopleDir(workspaceRoot);
      const found = personFiles.find((p) => p.slug === slug);
      if (!found) {
        return c.json({ error: 'Person not found' }, 404);
      }

      const body = await c.req.json() as { content?: string };
      if (typeof body.content !== 'string') {
        return c.json({ error: 'content (string) is required' }, 400);
      }

      const raw = await fs.readFile(found.filePath, 'utf8');
      const { data } = matter(raw);

      // matter.stringify(content, frontmatterData) correctly reconstructs frontmatter + body
      const updated = matter.stringify('\n' + body.content, data);
      await fs.writeFile(found.filePath, updated, 'utf8');

      return c.json({ success: true });
    } catch (err) {
      console.error('[people] notes patch error:', err);
      return c.json({ error: 'Failed to update notes' }, 500);
    }
  });

  return app;
}
