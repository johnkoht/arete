/**
 * Goals routes — /api/goals endpoints.
 * Reads goals/strategy.md, goals/quarter.md, now/week.md.
 *
 * Uses parseGoals service from @arete/core for goal parsing,
 * which supports both individual goal files (with frontmatter)
 * and legacy quarter.md formats.
 */

import { Hono } from 'hono';
import { join } from 'node:path';
import fs from 'node:fs/promises';
import { parseGoals, FileStorageAdapter, type Goal } from '@arete/core';

export type QuarterOutcome = {
  id: string;
  title: string;
  successCriteria: string;
  orgAlignment: string;
};

export type WeekPriority = {
  index: number;
  title: string;
  successCriteria: string;
  advancesGoal: string;
  effort: string;
  done: boolean;
};

export type WeekCommitment = {
  text: string;
  done: boolean;
};

/**
 * Convert a Goal entity to the QuarterOutcome type used by the web UI.
 * Maintains backward compatibility with the existing API response shape.
 */
function goalToOutcome(goal: Goal): QuarterOutcome {
  return {
    id: goal.id,
    title: goal.title,
    successCriteria: goal.successCriteria,
    orgAlignment: goal.orgAlignment,
  };
}

/**
 * Extract quarter label from goals array.
 * Uses the quarter from the first goal, or returns empty string.
 */
function extractQuarterFromGoals(goals: Goal[]): string {
  if (goals.length === 0) return '';
  return goals[0]?.quarter ?? '';
}

/**
 * Parse week.md — extract priorities (checklist-style or numbered headings).
 */
function parseWeekPriorities(content: string): WeekPriority[] {
  const priorities: WeekPriority[] = [];

  // Match ### N. Title or ### N Title sections
  const priorityPattern = /^###\s+(\d+)[.\s]+(.+)$/gm;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = priorityPattern.exec(content)) !== null) {
    idx++;
    const num = parseInt(match[1] ?? '0', 10);
    const title = (match[2] ?? '').trim();

    const startIdx = match.index + match[0].length;
    // Find next ### or ## header
    const nextHeader = /^##/m.exec(content.slice(startIdx));
    const endIdx = nextHeader ? startIdx + nextHeader.index : content.length;
    const body = content.slice(startIdx, endIdx);

    const scMatch = /\*\*Success criteria\*\*:\s*(.+)$/im.exec(body);
    const successCriteria = scMatch ? (scMatch[1] ?? '').trim() : '';

    const advancesMatch = /\*\*Advances quarter goal\*\*:\s*(.+)$/im.exec(body);
    const advancesGoal = advancesMatch ? (advancesMatch[1] ?? '').trim() : '';

    const effortMatch = /\*\*Effort\*\*:\s*(.+)$/im.exec(body);
    const effort = effortMatch ? (effortMatch[1] ?? '').trim() : '';

    // Check if done (look for [x] in the body)
    const done = /\[x\]/i.test(body);

    priorities.push({ index: num || idx, title, successCriteria, advancesGoal, effort, done });
  }

  return priorities;
}

/**
 * Parse week commitments section.
 */
function parseWeekCommitments(content: string): WeekCommitment[] {
  // Use index-based parsing to avoid \z (PCRE-only, not valid in JS regex)
  const headerIdx = content.search(/^##\s+Commitments due this week/im);
  if (headerIdx === -1) return [];
  const afterHeader = content.slice(content.indexOf('\n', headerIdx) + 1);
  const nextHeader = afterHeader.search(/^##\s/m);
  const sectionBody = nextHeader === -1 ? afterHeader : afterHeader.slice(0, nextHeader);
  const sectionMatch: [string, string] | null = sectionBody ? [sectionBody, sectionBody] : null;
  if (!sectionMatch) return [];

  const commitments: WeekCommitment[] = [];
  const lines = (sectionMatch[1] ?? '').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '-') continue;
    // Match - [x] text or - [ ] text or - text
    const doneMatch = /^[-*]\s+\[x\]\s+(.+)$/i.exec(trimmed);
    const pendingMatch = /^[-*]\s+\[\s*\]\s+(.+)$/.exec(trimmed);
    const plainMatch = /^[-*]\s+(.+)$/.exec(trimmed);

    if (doneMatch) {
      commitments.push({ text: (doneMatch[1] ?? '').trim(), done: true });
    } else if (pendingMatch) {
      commitments.push({ text: (pendingMatch[1] ?? '').trim(), done: false });
    } else if (plainMatch) {
      commitments.push({ text: (plainMatch[1] ?? '').trim(), done: false });
    }
  }

  return commitments;
}

export function createGoalsRouter(workspaceRoot: string): Hono {
  const app = new Hono();

  // GET /api/goals/strategy — read goals/strategy.md
  app.get('/strategy', async (c) => {
    const filePath = join(workspaceRoot, 'goals', 'strategy.md');
    try {
      const content = await fs.readFile(filePath, 'utf8');
      // Extract title from first # heading
      const titleMatch = /^#\s+(.+)$/m.exec(content);
      const title = titleMatch ? (titleMatch[1] ?? '').trim() : 'Strategy';
      // First 200 chars of content after title
      const preview = content.slice(0, 500).trim();
      return c.json({ title, content, preview, found: true });
    } catch {
      return c.json({ title: 'Strategy', content: '', preview: '', found: false });
    }
  });

  // GET /api/goals/quarter — parse goals from goals/ directory, return as outcomes
  app.get('/quarter', async (c) => {
    const goalsDir = join(workspaceRoot, 'goals');
    const storage = new FileStorageAdapter();
    try {
      const goals = await parseGoals(goalsDir, storage);
      const outcomes = goals.map(goalToOutcome);
      const quarter = extractQuarterFromGoals(goals);
      return c.json({ outcomes, quarter, found: goals.length > 0 });
    } catch {
      return c.json({ outcomes: [], quarter: '', found: false });
    }
  });

  // GET /api/goals/list — return full Goal[] with all metadata
  app.get('/list', async (c) => {
    const goalsDir = join(workspaceRoot, 'goals');
    const storage = new FileStorageAdapter();
    try {
      const goals = await parseGoals(goalsDir, storage);
      return c.json({ goals, found: goals.length > 0 });
    } catch {
      return c.json({ goals: [], found: false });
    }
  });

  // GET /api/goals/week — read now/week.md, parse priorities
  app.get('/week', async (c) => {
    const filePath = join(workspaceRoot, 'now', 'week.md');
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const priorities = parseWeekPriorities(content);
      const commitments = parseWeekCommitments(content);

      // Extract week label
      const weekMatch = /\*\*Week of\*\*:\s*(.+)$/im.exec(content);
      const weekOf = weekMatch ? (weekMatch[1] ?? '').trim() : '';

      return c.json({ priorities, commitments, weekOf, found: true });
    } catch {
      return c.json({ priorities: [], commitments: [], weekOf: '', found: false });
    }
  });

  // PATCH /api/goals/week/priority — toggle a priority's done state
  app.patch('/week/priority', async (c) => {
    try {
      const body = await c.req.json() as { index: number; done: boolean };
      const { index, done } = body;
      if (typeof index !== 'number' || typeof done !== 'boolean') {
        return c.json({ error: 'index (number) and done (boolean) required' }, 400);
      }

      const filePath = join(workspaceRoot, 'now', 'week.md');
      const content = await fs.readFile(filePath, 'utf8');

      // Find the Nth priority section (### N. Title or ### N Title)
      const sectionPattern = new RegExp(`^(###\\s+${index}[.\\s].+)$`, 'm');
      const match = sectionPattern.exec(content);
      if (!match || match.index === undefined) {
        return c.json({ error: `Priority ${index} not found` }, 404);
      }

      const sectionStart = match.index;
      const headerEnd = sectionStart + match[0].length;
      // Find the end of this section (next ### or ## or end of file)
      const rest = content.slice(headerEnd);
      const nextHeaderMatch = /^##/m.exec(rest);
      const sectionEnd = nextHeaderMatch
        ? headerEnd + nextHeaderMatch.index
        : content.length;

      const before = content.slice(0, headerEnd);
      let sectionBody = content.slice(headerEnd, sectionEnd);
      const after = content.slice(sectionEnd);

      if (done) {
        // Toggle first unchecked box to checked
        if (/- \[\s*\]/.test(sectionBody)) {
          sectionBody = sectionBody.replace(/- \[\s*\]/, '- [x]');
        } else {
          return c.json({ error: 'No unchecked items to mark done' }, 400);
        }
      } else {
        // Toggle first checked box to unchecked
        if (/- \[x\]/i.test(sectionBody)) {
          sectionBody = sectionBody.replace(/- \[x\]/i, '- [ ]');
        } else if (/^\[x\]$/im.test(sectionBody)) {
          // Handle legacy standalone [x] lines (from old buggy code)
          sectionBody = sectionBody.split('\n').filter(line => !/^\[x\]$/i.test(line.trim())).join('\n');
          // Ensure section ends with newline
          if (!sectionBody.endsWith('\n')) sectionBody += '\n';
        } else {
          return c.json({ error: 'No checked items to uncheck' }, 400);
        }
      }

      const updated = before + sectionBody + after;
      await fs.writeFile(filePath, updated, 'utf8');

      return c.json({ success: true, updatedContent: updated });
    } catch (err) {
      console.error('[goals] priority patch error:', err);
      return c.json({ error: 'Failed to update priority' }, 500);
    }
  });

  return app;
}
