/**
 * Activity service — persist and retrieve activity events from .arete/activity.json.
 *
 * Activity events track what Areté has done autonomously (meeting processing,
 * pattern detection, etc.) so users can see what happened while away.
 */
import { join } from 'node:path';
import fs from 'node:fs/promises';
const ACTIVITY_MAX = 50;
// ── Helpers ───────────────────────────────────────────────────────────────────
function activityPath(workspaceRoot) {
    return join(workspaceRoot, '.arete', 'activity.json');
}
async function readActivityFile(filePath) {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        return { events: parsed.events ?? [] };
    }
    catch {
        return { events: [] };
    }
}
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Prepend an activity event to .arete/activity.json.
 * Keeps only the most recent ACTIVITY_MAX events.
 */
export async function writeActivityEvent(workspaceRoot, event) {
    const filePath = activityPath(workspaceRoot);
    // Ensure .arete dir exists
    try {
        await fs.mkdir(join(workspaceRoot, '.arete'), { recursive: true });
    }
    catch {
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
export async function readActivityEvents(workspaceRoot, limit = 10) {
    const filePath = activityPath(workspaceRoot);
    const { events } = await readActivityFile(filePath);
    return events.slice(0, limit);
}
