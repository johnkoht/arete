/**
 * Search route — GET /api/search?q=<query>&type=meetings|people|memory|all
 *
 * Scans workspace files for query matches and returns ranked results.
 */
import { join, basename, extname } from 'node:path';
import fs from 'node:fs/promises';
import { Hono } from 'hono';
// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Extract a short excerpt from content centered around the first match
 * of any query token. Strips newlines, returns ≤150 chars.
 */
export function extractExcerpt(content, queryTokens) {
    const flat = content.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (!flat)
        return '';
    const lowerFlat = flat.toLowerCase();
    let matchIdx = -1;
    for (const token of queryTokens) {
        const idx = lowerFlat.indexOf(token.toLowerCase());
        if (idx !== -1 && (matchIdx === -1 || idx < matchIdx)) {
            matchIdx = idx;
        }
    }
    if (matchIdx === -1) {
        // No match found — return first 150 chars
        return flat.slice(0, 150);
    }
    const start = Math.max(0, matchIdx - 30);
    const end = Math.min(flat.length, start + 150);
    const excerpt = flat.slice(start, end);
    return (start > 0 ? '…' : '') + excerpt + (end < flat.length ? '…' : '');
}
/**
 * Count total occurrences of all query tokens in content (case-insensitive).
 * Used for relevance sorting.
 */
function countOccurrences(content, queryTokens) {
    const lower = content.toLowerCase();
    let count = 0;
    for (const token of queryTokens) {
        const t = token.toLowerCase();
        let pos = 0;
        while (true) {
            const idx = lower.indexOf(t, pos);
            if (idx === -1)
                break;
            count++;
            pos = idx + 1;
        }
    }
    return count;
}
/**
 * Check whether content matches any query token (case-insensitive).
 */
function matches(content, queryTokens) {
    const lower = content.toLowerCase();
    return queryTokens.some((t) => lower.includes(t.toLowerCase()));
}
/**
 * Read a file safely — returns empty string on any error.
 */
async function readSafe(filePath) {
    try {
        return await fs.readFile(filePath, 'utf8');
    }
    catch {
        return '';
    }
}
/**
 * Extract the title from a markdown file (first # heading or first line).
 */
function extractTitle(content, fallback) {
    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch)
        return headingMatch[1].trim();
    // Try frontmatter title
    const fmMatch = content.match(/^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m);
    if (fmMatch)
        return fmMatch[1].trim();
    const firstLine = content.split('\n').find((l) => l.trim().length > 0) ?? '';
    return firstLine.replace(/^#+\s*/, '').trim() || fallback;
}
/**
 * Extract date from frontmatter or filename (YYYY-MM-DD prefix).
 */
function extractDate(content, filename) {
    const fmMatch = content.match(/^---\n[\s\S]*?^date:\s*["']?(\d{4}-\d{2}-\d{2})/m);
    if (fmMatch)
        return fmMatch[1];
    const fileDate = filename.match(/^(\d{4}-\d{2}-\d{2})/);
    if (fileDate)
        return fileDate[1];
    return undefined;
}
// ── Scanners ──────────────────────────────────────────────────────────────────
async function scanMeetings(workspaceRoot, queryTokens) {
    const meetingsDir = join(workspaceRoot, 'resources', 'meetings');
    let files = [];
    try {
        files = await fs.readdir(meetingsDir);
    }
    catch {
        return [];
    }
    const results = [];
    for (const file of files) {
        if (extname(file) !== '.md')
            continue;
        const content = await readSafe(join(meetingsDir, file));
        if (!content || !matches(content, queryTokens))
            continue;
        const slug = basename(file, '.md');
        const title = extractTitle(content, slug);
        const date = extractDate(content, file);
        const score = countOccurrences(content, queryTokens);
        results.push({
            type: 'meeting',
            title,
            slug,
            excerpt: extractExcerpt(content, queryTokens),
            date,
            url: `/meetings/${slug}`,
            score,
        });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 5).map(({ score: _score, ...r }) => r);
}
async function scanPeople(workspaceRoot, queryTokens) {
    const peopleDir = join(workspaceRoot, 'people');
    const results = [];
    async function scanDir(dir) {
        let entries = [];
        try {
            entries = await fs.readdir(dir);
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const full = join(dir, entry);
            let stat;
            try {
                stat = await fs.stat(full);
            }
            catch {
                continue;
            }
            if (stat.isDirectory()) {
                await scanDir(full);
            }
            else if (extname(entry) === '.md') {
                const content = await readSafe(full);
                if (!content || !matches(content, queryTokens))
                    continue;
                const slug = basename(entry, '.md');
                const title = extractTitle(content, slug);
                const date = extractDate(content, entry);
                const score = countOccurrences(content, queryTokens);
                results.push({
                    type: 'person',
                    title,
                    slug,
                    excerpt: extractExcerpt(content, queryTokens),
                    date,
                    url: `/people/${slug}`,
                    score,
                });
            }
        }
    }
    await scanDir(peopleDir);
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 3).map(({ score: _score, ...r }) => r);
}
async function scanMemory(workspaceRoot, queryTokens) {
    const memoryDir = join(workspaceRoot, '.arete', 'memory', 'items');
    const memoryFiles = ['decisions.md', 'learnings.md'];
    const results = [];
    for (const file of memoryFiles) {
        const content = await readSafe(join(memoryDir, file));
        if (!content)
            continue;
        const type = file === 'decisions.md' ? 'decision' : 'learning';
        // Split by H2/H3 sections and check each
        const sections = content.split(/^#{2,3}\s+/m).filter(Boolean);
        const firstSectionIdx = content.indexOf('## ');
        for (let i = 0; i < sections.length; i++) {
            const section = sections[i];
            if (!section.trim())
                continue;
            if (!matches(section, queryTokens))
                continue;
            const lines = section.split('\n');
            const titleLine = lines[0]?.trim() ?? '';
            const body = lines.slice(1).join('\n');
            const score = countOccurrences(section, queryTokens);
            // Find date in section
            const dateMatch = section.match(/(\d{4}-\d{2}-\d{2})/);
            const date = dateMatch ? dateMatch[1] : undefined;
            results.push({
                type,
                title: titleLine || type,
                slug: file,
                excerpt: extractExcerpt(body || section, queryTokens),
                date,
                url: '/memory',
                score,
            });
        }
        // Also try scanning the whole file if no sections matched
        if (firstSectionIdx === -1 && matches(content, queryTokens)) {
            const score = countOccurrences(content, queryTokens);
            results.push({
                type,
                title: file === 'decisions.md' ? 'Decisions' : 'Learnings',
                slug: file,
                excerpt: extractExcerpt(content, queryTokens),
                url: '/memory',
                score,
            });
        }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 5).map(({ score: _score, ...r }) => r);
}
async function scanProjects(workspaceRoot, queryTokens) {
    const activeDir = join(workspaceRoot, 'projects', 'active');
    let dirs = [];
    try {
        dirs = await fs.readdir(activeDir);
    }
    catch {
        return [];
    }
    const results = [];
    for (const dir of dirs) {
        const readmePath = join(activeDir, dir, 'README.md');
        const content = await readSafe(readmePath);
        if (!content || !matches(content, queryTokens))
            continue;
        const title = extractTitle(content, dir);
        const date = extractDate(content, dir);
        const score = countOccurrences(content, queryTokens);
        results.push({
            type: 'project',
            title,
            slug: dir,
            excerpt: extractExcerpt(content, queryTokens),
            date,
            url: '/goals',
            score,
        });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 3).map(({ score: _score, ...r }) => r);
}
// ── Router ────────────────────────────────────────────────────────────────────
export function createSearchRouter(workspaceRoot) {
    const app = new Hono();
    // GET /api/search?q=<query>&type=meetings|people|memory|all
    app.get('/', async (c) => {
        try {
            const q = c.req.query('q') ?? '';
            const type = c.req.query('type') ?? 'all';
            if (!q || q.trim().length < 2) {
                return c.json({ results: [] });
            }
            // Split query into tokens (words), filter empty
            const queryTokens = q
                .trim()
                .split(/\s+/)
                .filter((t) => t.length > 0);
            if (queryTokens.length === 0) {
                return c.json({ results: [] });
            }
            const allResults = [];
            if (type === 'all' || type === 'meetings') {
                const r = await scanMeetings(workspaceRoot, queryTokens);
                allResults.push(...r);
            }
            if (type === 'all' || type === 'people') {
                const r = await scanPeople(workspaceRoot, queryTokens);
                allResults.push(...r);
            }
            if (type === 'all' || type === 'memory') {
                const r = await scanMemory(workspaceRoot, queryTokens);
                allResults.push(...r);
            }
            if (type === 'all' || type === 'projects') {
                const r = await scanProjects(workspaceRoot, queryTokens);
                allResults.push(...r);
            }
            return c.json({ results: allResults });
        }
        catch (err) {
            console.error('[search] error:', err);
            return c.json({ error: 'Search failed' }, 500);
        }
    });
    return app;
}
