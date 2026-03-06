/**
 * Activity service — persist and retrieve activity events from .arete/activity.json.
 *
 * Activity events track what Areté has done autonomously (meeting processing,
 * pattern detection, etc.) so users can see what happened while away.
 */

import { join } from 'node:path';
import fs from 'node:fs/promises';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActivityEvent = {
  id: string;
  type: string;
  title: string;
  detail?: string;
  timestamp: string;
};

type ActivityFile = {
  events: ActivityEvent[];
};

const ACTIVITY_MAX = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────

function activityPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.arete', 'activity.json');
}

async function readActivityFile(filePath: string): Promise<ActivityFile> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as ActivityFile;
    return { events: parsed.events ?? [] };
  } catch {
    return { events: [] };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Prepend an activity event to .arete/activity.json.
 * Keeps only the most recent ACTIVITY_MAX events.
 */
export async function writeActivityEvent(
  workspaceRoot: string,
  event: ActivityEvent,
): Promise<void> {
  const filePath = activityPath(workspaceRoot);

  // Ensure .arete dir exists
  try {
    await fs.mkdir(join(workspaceRoot, '.arete'), { recursive: true });
  } catch {
    // already exists
  }

  const current = await readActivityFile(filePath);
  const events = [event, ...current.events].slice(0, ACTIVITY_MAX);

  await fs.writeFile(filePath, JSON.stringify({ events }, null, 2), 'utf8');
}

/**
 * Read the most recent N activity events from .arete/activity.json.
 * Returns empty array if the file doesn't exist.
 */
export async function readActivityEvents(
  workspaceRoot: string,
  limit = 10,
): Promise<ActivityEvent[]> {
  const filePath = activityPath(workspaceRoot);
  const { events } = await readActivityFile(filePath);
  return events.slice(0, limit);
}
