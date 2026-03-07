/**
 * Goals routes — /api/goals endpoints.
 * Reads goals/strategy.md, goals/quarter.md, now/week.md.
 */
import { Hono } from 'hono';
import { join } from 'node:path';
import fs from 'node:fs/promises';
/**
 * Parse quarter.md — extract `### Q1-N Title` outcome sections.
 */
function parseQuarterOutcomes(content) {
    const outcomes = [];
    // Match ### Q1-1 Title ... up to next ### or end
    const outcomePattern = /^###\s+([\w-]+)\s+(.+)$/gm;
    let match;
    while ((match = outcomePattern.exec(content)) !== null) {
        const id = match[1] ?? '';
        const title = (match[2] ?? '').trim();
        // Extract the content for this outcome (until next ### or ##)
        const startIdx = match.index + match[0].length;
        const nextHeader = /^##/m.exec(content.slice(startIdx));
        const endIdx = nextHeader ? startIdx + nextHeader.index : content.length;
        const body = content.slice(startIdx, endIdx);
        // Parse success criteria
        const scMatch = /\*\*Success criteria\*\*:\s*(.+)$/im.exec(body);
        const successCriteria = scMatch ? (scMatch[1] ?? '').trim() : '';
        // Parse org alignment
        const alignMatch = /\*\*Org alignment\*\*:\s*(.+)$/im.exec(body);
        const orgAlignment = alignMatch ? (alignMatch[1] ?? '').trim() : '';
        outcomes.push({ id, title, successCriteria, orgAlignment });
    }
    return outcomes;
}
/**
 * Parse week.md — extract priorities (checklist-style or numbered headings).
 */
function parseWeekPriorities(content) {
    const priorities = [];
    // Match ### N. Title or ### N Title sections
    const priorityPattern = /^###\s+(\d+)[.\s]+(.+)$/gm;
    let match;
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
function parseWeekCommitments(content) {
    // Use index-based parsing to avoid \z (PCRE-only, not valid in JS regex)
    const headerIdx = content.search(/^##\s+Commitments due this week/im);
    if (headerIdx === -1)
        return [];
    const afterHeader = content.slice(content.indexOf('\n', headerIdx) + 1);
    const nextHeader = afterHeader.search(/^##\s/m);
    const sectionBody = nextHeader === -1 ? afterHeader : afterHeader.slice(0, nextHeader);
    const sectionMatch = sectionBody ? [sectionBody, sectionBody] : null;
    if (!sectionMatch)
        return [];
    const commitments = [];
    const lines = (sectionMatch[1] ?? '').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === '-')
            continue;
        // Match - [x] text or - [ ] text or - text
        const doneMatch = /^[-*]\s+\[x\]\s+(.+)$/i.exec(trimmed);
        const pendingMatch = /^[-*]\s+\[\s*\]\s+(.+)$/.exec(trimmed);
        const plainMatch = /^[-*]\s+(.+)$/.exec(trimmed);
        if (doneMatch) {
            commitments.push({ text: (doneMatch[1] ?? '').trim(), done: true });
        }
        else if (pendingMatch) {
            commitments.push({ text: (pendingMatch[1] ?? '').trim(), done: false });
        }
        else if (plainMatch) {
            commitments.push({ text: (plainMatch[1] ?? '').trim(), done: false });
        }
    }
    return commitments;
}
export function createGoalsRouter(workspaceRoot) {
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
        }
        catch {
            return c.json({ title: 'Strategy', content: '', preview: '', found: false });
        }
    });
    // GET /api/goals/quarter — read goals/quarter.md, parse outcomes
    app.get('/quarter', async (c) => {
        const filePath = join(workspaceRoot, 'goals', 'quarter.md');
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const outcomes = parseQuarterOutcomes(content);
            // Extract quarter label
            const quarterMatch = /\*\*Quarter\*\*:\s*(.+)$/im.exec(content);
            const quarter = quarterMatch ? (quarterMatch[1] ?? '').trim() : '';
            return c.json({ outcomes, quarter, found: true });
        }
        catch {
            return c.json({ outcomes: [], quarter: '', found: false });
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
        }
        catch {
            return c.json({ priorities: [], commitments: [], weekOf: '', found: false });
        }
    });
    // PATCH /api/goals/week/priority — toggle a priority's done state
    app.patch('/week/priority', async (c) => {
        try {
            const body = await c.req.json();
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
                // Add [x] if not already present
                if (!/\[x\]/i.test(sectionBody)) {
                    sectionBody = sectionBody.trimEnd() + '\n[x]\n';
                }
            }
            else {
                // Remove [x] lines
                sectionBody = sectionBody
                    .split('\n')
                    .filter(line => !/^\[x\]$/i.test(line.trim()))
                    .join('\n');
                // Ensure section ends with newline
                if (!sectionBody.endsWith('\n'))
                    sectionBody += '\n';
            }
            const updated = before + sectionBody + after;
            await fs.writeFile(filePath, updated, 'utf8');
            return c.json({ success: true, updatedContent: updated });
        }
        catch (err) {
            console.error('[goals] priority patch error:', err);
            return c.json({ error: 'Failed to update priority' }, 500);
        }
    });
    return app;
}
