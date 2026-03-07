/**
 * Projects routes — /api/projects endpoints.
 */
import { Hono } from 'hono';
import { join } from 'node:path';
import fs from 'node:fs/promises';
async function readFirstHeading(content) {
    const match = /^#\s+(.+)$/m.exec(content);
    return match ? match[1].trim() : '';
}
async function readStatusSection(content) {
    const match = /^##\s+Status\s*\n([^\n#]+)/im.exec(content);
    return match ? match[1].trim() : 'Active';
}
async function readDescriptionSection(content) {
    // Try ## Problem or first paragraph after title
    const problemMatch = /^##\s+Problem\s*\n([^\n#]+)/im.exec(content);
    if (problemMatch)
        return problemMatch[1].trim();
    const goalMatch = /^##\s+Goal\s*\n([^\n#]+)/im.exec(content);
    if (goalMatch)
        return goalMatch[1].trim();
    return '';
}
export function createProjectsRouter(workspaceRoot) {
    const app = new Hono();
    // GET /api/projects — scan projects/active/*/, return summaries
    app.get('/', async (c) => {
        const activeDir = join(workspaceRoot, 'projects', 'active');
        let entries;
        try {
            entries = await fs.readdir(activeDir);
        }
        catch {
            return c.json({ projects: [] });
        }
        const projects = [];
        for (const entry of entries) {
            const projectDir = join(activeDir, entry);
            try {
                const stat = await fs.stat(projectDir);
                if (!stat.isDirectory())
                    continue;
                // Try README.md
                const readmePath = join(projectDir, 'README.md');
                let content = '';
                let mtime = stat.mtimeMs;
                try {
                    const readmeStat = await fs.stat(readmePath);
                    content = await fs.readFile(readmePath, 'utf8');
                    mtime = readmeStat.mtimeMs;
                }
                catch {
                    // No README — use directory name
                }
                const name = content ? await readFirstHeading(content) : entry;
                const status = content ? await readStatusSection(content) : 'Active';
                const description = content ? await readDescriptionSection(content) : '';
                projects.push({
                    slug: entry,
                    name: name || entry,
                    lastModified: new Date(mtime).toISOString(),
                    status,
                    description,
                });
            }
            catch {
                // skip unreadable entries
            }
        }
        // Sort by last modified, newest first
        projects.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
        return c.json({ projects });
    });
    return app;
}
