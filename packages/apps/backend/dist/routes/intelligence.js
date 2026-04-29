/**
 * Intelligence routes — /api/intelligence endpoints.
 * Also exports createCommitmentsRouter for /api/commitments.
 */
import { join, basename } from 'node:path';
import fs from 'node:fs/promises';
import { Hono } from 'hono';
import { FileStorageAdapter, detectCrossPersonPatterns, computeCommitmentPriority, CommitmentsService, } from '@arete/core';
import { parse as parseYaml } from 'yaml';
// ---------------------------------------------------------------------------
// Helpers for meeting text extraction (used by reconcile endpoint)
// ---------------------------------------------------------------------------
/**
 * Parse YAML frontmatter from meeting content.
 */
function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match)
        return { data: {}, body: content };
    try {
        return {
            data: parseYaml(match[1]),
            body: match[2],
        };
    }
    catch {
        return { data: {}, body: content };
    }
}
/**
 * Parse a date string into a Date object, returning null if invalid.
 */
function parseDate(s) {
    if (typeof s !== 'string')
        return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
}
/**
 * Extract completion-related text from meeting body.
 * Looks at ## Summary and ## Key Points sections.
 * Returns array of text snippets that might indicate completed work.
 */
function extractCompletionText(body) {
    const results = [];
    const seen = new Set();
    function addItem(raw) {
        // Clean up markdown formatting
        const cleaned = raw
            .replace(/^\s*[-*•]\s*/, '')
            .replace(/^\s*\[[ x]\]\s*/i, '')
            .replace(/[*_`]/g, '')
            .trim();
        if (cleaned.length < 10 || cleaned.length > 200)
            return;
        const normalized = cleaned.toLowerCase();
        if (seen.has(normalized))
            return;
        seen.add(normalized);
        results.push(cleaned);
    }
    /**
     * Extract content from a markdown section (between ## headers).
     */
    function extractSection(header) {
        const m = body.match(header);
        if (!m)
            return '';
        const afterHeader = body.slice(m.index + m[0].length);
        const nextSection = afterHeader.search(/\n## /);
        return nextSection >= 0 ? afterHeader.slice(0, nextSection) : afterHeader.slice(0, 2000);
    }
    // Extract from lead-prose section. Accept either ## Summary (legacy /
    // light extraction shape) or ## Core (wiki-aware shape, Task 8). Both are
    // permanent — historical files keep their existing heading per Decision #7.
    const summary = extractSection(/^##\s+(?:Summary|Core)\s*$/m);
    if (summary.trim()) {
        // Split on sentence-ending punctuation and add each sentence
        const sentences = summary
            .replace(/\n+/g, ' ')
            .split(/(?<=[.!?])\s+/)
            .slice(0, 5);
        for (const s of sentences) {
            addItem(s);
        }
    }
    // Extract from ## Key Points
    const keyPoints = extractSection(/^## Key Points\s*$/m);
    for (const line of keyPoints.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
            addItem(trimmed);
        }
    }
    return results.slice(0, 20); // Cap per meeting
}
export function createIntelligenceRouter(workspaceRoot) {
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
        }
        catch (err) {
            console.error('[intelligence] patterns error:', err);
            return c.json({ error: 'Failed to detect patterns' }, 500);
        }
    });
    // GET /api/intelligence/commitments/summary — commitment counts
    app.get('/commitments/summary', async (c) => {
        try {
            const filePath = join(workspaceRoot, '.arete', 'commitments.json');
            let commitments = [];
            try {
                const raw = await fs.readFile(filePath, 'utf8');
                const parsed = JSON.parse(raw);
                commitments = parsed.commitments ?? [];
            }
            catch {
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
        }
        catch (err) {
            console.error('[intelligence] commitments/summary error:', err);
            return c.json({ error: 'Failed to load commitments summary' }, 500);
        }
    });
    return app;
}
// ---------------------------------------------------------------------------
// Health status helpers
// ---------------------------------------------------------------------------
/**
 * Map health status string from person file to HealthIndicator.
 * Handles variations like "Active", "active", "ACTIVE".
 */
function healthStatusToIndicator(status) {
    if (!status)
        return 'regular';
    const normalized = status.toLowerCase().trim();
    if (normalized === 'active')
        return 'active';
    if (normalized === 'cooling')
        return 'cooling';
    if (normalized === 'dormant')
        return 'dormant';
    return 'regular';
}
/**
 * Parse AUTO_PERSON_MEMORY block to extract health status.
 * Returns null if no block or no status found.
 */
function parseHealthStatusFromContent(content) {
    const blockMatch = /<!-- AUTO_PERSON_MEMORY:START -->([\s\S]*?)<!-- AUTO_PERSON_MEMORY:END -->/i.exec(content);
    if (!blockMatch)
        return null;
    const block = blockMatch[1] ?? '';
    const statusMatch = /Status:\s*(.+)$/im.exec(block);
    if (statusMatch)
        return (statusMatch[1] ?? '').trim();
    return null;
}
/**
 * Load health indicators for all people from their profile files.
 * Returns a Map<personSlug, HealthIndicator>.
 */
async function loadPersonHealthMap(workspaceRoot) {
    const healthMap = new Map();
    const categories = ['internal', 'customers', 'users'];
    for (const cat of categories) {
        const dir = join(workspaceRoot, 'people', cat);
        let entries;
        try {
            entries = await fs.readdir(dir);
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.endsWith('.md') || entry === 'index.md')
                continue;
            const slug = entry.slice(0, -3);
            try {
                const raw = await fs.readFile(join(dir, entry), 'utf8');
                const status = parseHealthStatusFromContent(raw);
                healthMap.set(slug, healthStatusToIndicator(status));
            }
            catch {
                // Skip unreadable files — use default
                healthMap.set(slug, 'regular');
            }
        }
    }
    return healthMap;
}
/**
 * Create the /api/commitments router.
 *
 * Supports query params:
 * - ?filter=overdue (daysOpen > 14) | thisweek (daysOpen <= 7) | open | all
 * - ?direction=mine (i_owe_them) | theirs (they_owe_me) — filters by direction
 * - ?person=<slug> — filters by person slug
 */
export function createCommitmentsRouter(workspaceRoot) {
    const app = new Hono();
    app.get('/', async (c) => {
        try {
            const filePath = join(workspaceRoot, '.arete', 'commitments.json');
            let allCommitments = [];
            try {
                const raw = await fs.readFile(filePath, 'utf8');
                const parsed = JSON.parse(raw);
                allCommitments = parsed.commitments ?? [];
            }
            catch {
                // File doesn't exist or invalid JSON — return empty
            }
            const now = new Date();
            const filterParam = c.req.query('filter');
            const directionParam = c.req.query('direction');
            const personParam = c.req.query('person');
            const priorityParam = c.req.query('priority'); // high, medium, low
            let sourceCommitments;
            if (filterParam === 'all') {
                sourceCommitments = allCommitments;
            }
            else {
                sourceCommitments = allCommitments.filter((c) => c.status === 'open');
            }
            // Apply direction filter
            if (directionParam === 'mine') {
                sourceCommitments = sourceCommitments.filter((c) => c.direction === 'i_owe_them');
            }
            else if (directionParam === 'theirs') {
                sourceCommitments = sourceCommitments.filter((c) => c.direction === 'they_owe_me');
            }
            // Apply person filter
            if (personParam) {
                sourceCommitments = sourceCommitments.filter((c) => c.personSlug === personParam);
            }
            // Load health indicators for all people (for priority scoring)
            const healthMap = await loadPersonHealthMap(workspaceRoot);
            const items = sourceCommitments.map((c) => {
                const itemDate = new Date(c.date);
                const daysOpen = Number.isNaN(itemDate.getTime())
                    ? 0
                    : Math.floor((now.getTime() - itemDate.getTime()) / 86400000);
                // Compute priority
                const healthIndicator = healthMap.get(c.personSlug) ?? 'regular';
                const priorityResult = computeCommitmentPriority({
                    daysOpen,
                    healthIndicator,
                    direction: c.direction,
                    text: c.text,
                });
                return {
                    id: c.id,
                    text: c.text,
                    personSlug: c.personSlug,
                    direction: c.direction,
                    date: c.date,
                    daysOpen,
                    status: c.status,
                    priority: priorityResult.score,
                    priorityLevel: priorityResult.level,
                };
            });
            let filtered = items;
            if (filterParam === 'overdue') {
                filtered = items.filter((i) => i.daysOpen > 14);
            }
            else if (filterParam === 'thisweek') {
                filtered = items.filter((i) => i.daysOpen <= 7);
            }
            else if (filterParam === 'open') {
                filtered = items.filter((i) => i.status === 'open');
            }
            // Apply priority filter
            if (priorityParam === 'high') {
                filtered = filtered.filter((i) => i.priorityLevel === 'high');
            }
            else if (priorityParam === 'medium') {
                filtered = filtered.filter((i) => i.priorityLevel === 'medium');
            }
            else if (priorityParam === 'low') {
                filtered = filtered.filter((i) => i.priorityLevel === 'low');
            }
            // Sort by priority descending (highest priority first)
            filtered.sort((a, b) => b.priority - a.priority);
            // Parse pagination params (default limit 25, max 100)
            const limit = Math.min(parseInt(c.req.query('limit') ?? '25', 10), 100);
            const offset = parseInt(c.req.query('offset') ?? '0', 10);
            const total = filtered.length;
            const page = filtered.slice(offset, offset + limit);
            return c.json({ commitments: page, total, offset, limit });
        }
        catch (err) {
            console.error('[commitments] error:', err);
            return c.json({ error: 'Failed to load commitments' }, 500);
        }
    });
    // POST /api/commitments/reconcile — scan meetings for completion signals
    app.post('/reconcile', async (c) => {
        try {
            const storage = new FileStorageAdapter();
            const commitmentsService = new CommitmentsService(storage, workspaceRoot);
            // 1. Get recent meetings (last 14 days)
            const meetingsDir = join(workspaceRoot, 'resources', 'meetings');
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 14);
            let meetingFiles = [];
            try {
                meetingFiles = await storage.list(meetingsDir, { extensions: ['.md'] });
            }
            catch {
                // No meetings directory — no candidates
                return c.json({ candidates: [], count: 0 });
            }
            // 2. Extract text from Summary and Key Points sections
            const completedItems = [];
            for (const filePath of meetingFiles) {
                const content = await storage.read(filePath);
                if (!content)
                    continue;
                // Parse frontmatter to get date
                const { data: fm, body } = parseFrontmatter(content);
                const meetingDate = parseDate(fm['date']);
                if (!meetingDate || meetingDate < cutoffDate)
                    continue;
                const slug = basename(filePath, '.md');
                const extracted = extractCompletionText(body);
                for (const text of extracted) {
                    completedItems.push({ text, source: slug });
                }
            }
            if (completedItems.length === 0) {
                return c.json({ candidates: [], count: 0 });
            }
            // 3. Call CommitmentsService.reconcile()
            const matches = await commitmentsService.reconcile(completedItems);
            // 4. Return top 10 candidates
            const candidates = matches.slice(0, 10).map((m) => ({
                commitmentId: m.commitment.id,
                commitmentText: m.commitment.text,
                personSlug: m.commitment.personSlug,
                personName: m.commitment.personName ?? m.commitment.personSlug,
                sourceMeeting: m.completedItem.source,
                matchedText: m.completedItem.text,
                confidence: Math.round(m.confidence * 100) / 100, // Round to 2 decimals
            }));
            return c.json({ candidates, count: candidates.length });
        }
        catch (err) {
            console.error('[commitments] reconcile error:', err);
            return c.json({ error: 'Failed to reconcile commitments' }, 500);
        }
    });
    // PATCH /api/commitments/:id — mark done or drop
    app.patch('/:id', async (c) => {
        try {
            const id = c.req.param('id');
            const filePath = join(workspaceRoot, '.arete', 'commitments.json');
            let fileData = { commitments: [] };
            try {
                const raw = await fs.readFile(filePath, 'utf8');
                fileData = JSON.parse(raw);
                if (!Array.isArray(fileData.commitments))
                    fileData.commitments = [];
            }
            catch {
                // File doesn't exist — nothing to update
                return c.json({ error: 'Commitment not found' }, 404);
            }
            const idx = fileData.commitments.findIndex((c) => c.id === id);
            if (idx === -1) {
                return c.json({ error: 'Commitment not found' }, 404);
            }
            const body = (await c.req.json());
            const newStatus = body.status;
            if (newStatus !== 'resolved' && newStatus !== 'dropped') {
                return c.json({ error: 'status must be "resolved" or "dropped"' }, 400);
            }
            const updated = {
                ...fileData.commitments[idx],
                status: newStatus,
                resolvedAt: new Date().toISOString(),
            };
            fileData.commitments[idx] = updated;
            await fs.writeFile(filePath, JSON.stringify(fileData, null, 2), 'utf8');
            return c.json({ commitment: updated });
        }
        catch (err) {
            console.error('[commitments] PATCH error:', err);
            return c.json({ error: 'Failed to update commitment' }, 500);
        }
    });
    return app;
}
