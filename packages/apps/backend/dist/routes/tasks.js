/**
 * Tasks routes — all /api/tasks endpoints.
 *
 * Uses createServices() from @arete/core for TaskService, CommitmentsService, and EntityService.
 * File locks via withFileLock() for write operations.
 */
import { join } from 'node:path';
import { Hono } from 'hono';
import { createServices, TaskNotFoundError, AmbiguousIdError, FileStorageAdapter, computeCommitmentPriority, scoreTasks, } from '@arete/core';
import { withFileLock } from '../services/locks.js';
// ──────────────────────────────────────────────────────────────────────────────
// Section to destination mapping (reverse of DESTINATION_MAP in TaskService)
// ──────────────────────────────────────────────────────────────────────────────
const SECTION_TO_DESTINATION = {
    '## Inbox': 'inbox',
    '### Must complete': 'must',
    '### Should complete': 'should',
    '### Could complete': 'could',
    '## Anytime': 'anytime',
    '## Someday': 'someday',
};
function sectionToDestination(section) {
    return SECTION_TO_DESTINATION[section] ?? 'inbox';
}
// ──────────────────────────────────────────────────────────────────────────────
// Person name resolution helper
// ──────────────────────────────────────────────────────────────────────────────
const storage = new FileStorageAdapter();
async function resolvePersonName(personSlug, workspaceRoot) {
    const categories = ['internal', 'customers', 'users'];
    const peopleDir = join(workspaceRoot, 'people');
    for (const cat of categories) {
        const filePath = join(peopleDir, cat, `${personSlug}.md`);
        const content = await storage.read(filePath);
        if (!content)
            continue;
        // Extract name from frontmatter
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
        if (fmMatch) {
            const nameMatch = fmMatch[1].match(/^name:\s*(.+)$/m);
            if (nameMatch) {
                return { slug: personSlug, name: nameMatch[1].trim() };
            }
            const fullNameMatch = fmMatch[1].match(/^full_name:\s*(.+)$/m);
            if (fullNameMatch) {
                return { slug: personSlug, name: fullNameMatch[1].trim() };
            }
        }
    }
    // Fallback: use slug as name
    return { slug: personSlug, name: personSlug };
}
// ──────────────────────────────────────────────────────────────────────────────
// Task enrichment
// ──────────────────────────────────────────────────────────────────────────────
async function enrichTask(task, allCommitments, workspaceRoot) {
    // Resolve person
    let person = null;
    if (task.metadata.person) {
        person = await resolvePersonName(task.metadata.person, workspaceRoot);
    }
    // Resolve commitment reference
    let from = null;
    if (task.metadata.from?.type === 'commitment') {
        const commitmentId = task.metadata.from.id;
        const commitment = allCommitments.find((c) => c.id === commitmentId || c.id.startsWith(commitmentId));
        if (commitment) {
            const daysOpen = Math.floor((Date.now() - new Date(commitment.date).getTime()) / (1000 * 60 * 60 * 24));
            const priorityResult = computeCommitmentPriority({
                daysOpen,
                healthIndicator: 'active', // Default to active — full lookup would require more context
                direction: commitment.direction,
                text: commitment.text,
            });
            from = {
                type: 'commitment',
                id: commitment.id.slice(0, 8),
                text: commitment.text,
                priority: priorityResult.level,
                daysOpen,
            };
        }
    }
    return {
        id: task.id,
        text: task.text,
        destination: sectionToDestination(task.source.section),
        due: task.metadata.due ?? null,
        completedAt: task.metadata.completedAt ?? null,
        area: task.metadata.area ?? null,
        project: task.metadata.project ?? null,
        person,
        from,
        completed: task.completed,
        source: task.source,
    };
}
// ──────────────────────────────────────────────────────────────────────────────
// Week priorities parsing
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Parse week priorities from now/week.md content.
 * Extracts titles from lines like "### 1. Ship task UI" or "### 2 Review PRD"
 * Returns empty array if file doesn't exist or has no priorities section.
 */
async function parseWeekPriorities(workspaceRoot) {
    const weekPath = join(workspaceRoot, 'now', 'week.md');
    const content = await storage.read(weekPath);
    if (!content) {
        return [];
    }
    const regex = /^###\s+\d+[.\s]+(.+)$/gm;
    const priorities = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
        priorities.push(match[1].trim());
    }
    return priorities;
}
/**
 * Transform ScoredTask to SuggestedTaskWire (flatten breakdown).
 */
async function toSuggestedWire(scored, allCommitments, workspaceRoot) {
    const enriched = await enrichTask(scored.task, allCommitments, workspaceRoot);
    return {
        ...enriched,
        score: scored.score,
        breakdown: {
            dueDate: scored.breakdown.dueDate.score,
            commitment: scored.breakdown.commitment.score,
            meetingRelevance: scored.breakdown.meetingRelevance.score,
            weekPriority: scored.breakdown.weekPriority.score,
        },
    };
}
// ──────────────────────────────────────────────────────────────────────────────
// Router factory
// ──────────────────────────────────────────────────────────────────────────────
export function createTasksRouter(workspaceRoot) {
    const app = new Hono();
    // GET /api/tasks — list tasks with filters and pagination
    app.get('/', async (c) => {
        try {
            const filterParam = c.req.query('filter');
            const waitingOn = c.req.query('waitingOn') === 'true';
            const limit = Math.min(parseInt(c.req.query('limit') ?? '25', 10), 100);
            const offset = parseInt(c.req.query('offset') ?? '0', 10);
            // Validate filter param
            const validFilters = ['today', 'upcoming', 'anytime', 'someday', 'completed', 'completed-today'];
            if (filterParam && !validFilters.includes(filterParam)) {
                return c.json({
                    error: `Invalid filter: ${filterParam}. Valid filters: ${validFilters.join(', ')}`,
                }, 400);
            }
            const services = await createServices(workspaceRoot);
            const allTasks = await services.tasks.listTasks();
            const allCommitments = await services.commitments.listOpen();
            const today = new Date().toISOString().split('T')[0];
            let filteredTasks;
            if (filterParam === 'today') {
                // today: @due(today) or overdue UNION must bucket, deduped
                const seenIds = new Set();
                const todayTasks = [];
                // Tasks with @due(today) or overdue
                for (const task of allTasks) {
                    if (task.metadata.due && task.metadata.due <= today && !task.completed) {
                        if (!seenIds.has(task.id)) {
                            seenIds.add(task.id);
                            todayTasks.push(task);
                        }
                    }
                }
                // Tasks in must bucket
                for (const task of allTasks) {
                    if (task.source.section === '### Must complete' && !task.completed) {
                        if (!seenIds.has(task.id)) {
                            seenIds.add(task.id);
                            todayTasks.push(task);
                        }
                    }
                }
                // Sort: overdue first (by due date ascending — older overdue dates first)
                todayTasks.sort((a, b) => {
                    const aDue = a.metadata.due;
                    const bDue = b.metadata.due;
                    // Both have due dates — sort by date ascending (oldest first)
                    if (aDue && bDue) {
                        return aDue.localeCompare(bDue);
                    }
                    // Tasks with due dates come first
                    if (aDue && !bDue)
                        return -1;
                    if (!aDue && bDue)
                        return 1;
                    return 0;
                });
                filteredTasks = todayTasks;
            }
            else if (filterParam === 'upcoming') {
                // upcoming: @due in next 7 days, excluding today
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const tomorrowStr = tomorrow.toISOString().split('T')[0];
                const weekFromNow = new Date();
                weekFromNow.setDate(weekFromNow.getDate() + 7);
                const weekStr = weekFromNow.toISOString().split('T')[0];
                filteredTasks = allTasks
                    .filter((t) => t.metadata.due &&
                    t.metadata.due >= tomorrowStr &&
                    t.metadata.due <= weekStr &&
                    !t.completed)
                    .sort((a, b) => (a.metadata.due ?? '').localeCompare(b.metadata.due ?? ''));
            }
            else if (filterParam === 'anytime') {
                filteredTasks = allTasks.filter((t) => t.source.section === '## Anytime' && !t.completed);
            }
            else if (filterParam === 'someday') {
                filteredTasks = allTasks.filter((t) => t.source.section === '## Someday' && !t.completed);
            }
            else if (filterParam === 'completed') {
                filteredTasks = allTasks.filter((t) => t.completed);
                // Sort by completedAt descending (most recent first), tasks without completedAt last
                filteredTasks.sort((a, b) => {
                    const aDate = a.metadata.completedAt;
                    const bDate = b.metadata.completedAt;
                    if (aDate && bDate)
                        return bDate.localeCompare(aDate);
                    if (aDate && !bDate)
                        return -1;
                    if (!aDate && bDate)
                        return 1;
                    return 0;
                });
            }
            else if (filterParam === 'completed-today') {
                filteredTasks = allTasks.filter((t) => t.completed && t.metadata.completedAt === today);
            }
            else {
                // No filter: all tasks
                filteredTasks = allTasks;
            }
            // Apply waitingOn filter
            if (waitingOn) {
                filteredTasks = filteredTasks.filter((t) => t.metadata.from?.type === 'commitment');
            }
            // Paginate
            const total = filteredTasks.length;
            const paginated = filteredTasks.slice(offset, offset + limit);
            // Enrich tasks
            const enrichedTasks = await Promise.all(paginated.map((t) => enrichTask(t, allCommitments, workspaceRoot)));
            return c.json({ tasks: enrichedTasks, total, offset, limit });
        }
        catch (err) {
            console.error('[tasks] listTasks error:', err);
            return c.json({ error: 'Failed to list tasks' }, 500);
        }
    });
    // GET /api/tasks/suggested — AI-scored task recommendations
    // NOTE: This route must be defined BEFORE /:id to avoid "suggested" matching as an ID
    app.get('/suggested', async (c) => {
        try {
            const dateParam = c.req.query('date');
            // Parse week priorities from now/week.md
            const weekPriorities = await parseWeekPriorities(workspaceRoot);
            // Build scoring context
            const context = {
                todayMeetingAttendees: [],
                todayMeetingAreas: [],
                weekPriorities,
                availableFocusHours: 8,
                needsAttentionPeople: [],
                referenceDate: dateParam ? new Date(dateParam) : new Date(),
            };
            // Get incomplete tasks
            const services = await createServices(workspaceRoot);
            const allTasks = await services.tasks.listTasks({ completed: false });
            // Return empty array when no tasks
            if (allTasks.length === 0) {
                return c.json({ tasks: [] });
            }
            // Score and sort tasks
            const scoredTasks = scoreTasks(allTasks, context);
            // Take top 10
            const topTasks = scoredTasks.slice(0, 10);
            // Enrich and transform to wire format
            const allCommitments = await services.commitments.listOpen();
            const wireTasks = await Promise.all(topTasks.map((scored) => toSuggestedWire(scored, allCommitments, workspaceRoot)));
            return c.json({ tasks: wireTasks });
        }
        catch (err) {
            console.error('[tasks] suggested error:', err);
            return c.json({ error: 'Failed to get suggested tasks' }, 500);
        }
    });
    // PATCH /api/tasks/:id — update task properties
    app.patch('/:id', async (c) => {
        const id = c.req.param('id');
        const body = await c.req.json();
        // Validate due date format if provided
        if (body.due !== undefined && body.due !== null) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(body.due)) {
                return c.json({ error: 'Invalid due date format. Expected YYYY-MM-DD.' }, 400);
            }
        }
        try {
            const services = await createServices(workspaceRoot);
            const foundTask = await services.tasks.findTask(id);
            if (!foundTask) {
                return c.json({ error: `No task found matching id "${id}"` }, 404);
            }
            let task = foundTask;
            // 1. Move first (changes file path)
            if (body.destination !== undefined) {
                task = await withFileLock(task.source.file, () => services.tasks.moveTask(task.id, body.destination));
            }
            // 2. Update due (use new file path after move)
            if ('due' in body) {
                task = await withFileLock(task.source.file, () => services.tasks.updateTask(task.id, { due: body.due }));
            }
            // 3. Complete last (triggers side effects like completedAt)
            if (body.completed !== undefined && body.completed) {
                const result = await withFileLock(task.source.file, () => services.tasks.completeTask(task.id));
                task = result.task;
            }
            // If nothing was processed
            if (body.destination === undefined && !('due' in body) && body.completed === undefined) {
                return c.json({ error: 'No valid updates provided' }, 400);
            }
            const allCommitments = await services.commitments.listOpen();
            const taskWire = await enrichTask(task, allCommitments, workspaceRoot);
            return c.json({ task: taskWire });
        }
        catch (err) {
            if (err instanceof TaskNotFoundError) {
                return c.json({ error: err.message }, 404);
            }
            if (err instanceof AmbiguousIdError) {
                return c.json({ error: err.message }, 400);
            }
            // Check error message for legacy error handling
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('No task found')) {
                return c.json({ error: message }, 404);
            }
            if (message.includes('Ambiguous prefix')) {
                return c.json({ error: message }, 400);
            }
            console.error('[tasks] updateTask error:', err);
            return c.json({ error: 'Failed to update task' }, 500);
        }
    });
    // DELETE /api/tasks/:id — delete a task
    app.delete('/:id', async (c) => {
        const id = c.req.param('id');
        try {
            const services = await createServices(workspaceRoot);
            // Find task to get file path for lock
            const foundTask = await services.tasks.findTask(id);
            if (!foundTask) {
                return c.json({ error: `No task found matching id "${id}"` }, 404);
            }
            await withFileLock(foundTask.source.file, () => services.tasks.deleteTask(id));
            return c.body(null, 204);
        }
        catch (err) {
            if (err instanceof TaskNotFoundError) {
                return c.json({ error: err.message }, 404);
            }
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('No task found')) {
                return c.json({ error: message }, 404);
            }
            console.error('[tasks] deleteTask error:', err);
            return c.json({ error: 'Failed to delete task' }, 500);
        }
    });
    return app;
}
