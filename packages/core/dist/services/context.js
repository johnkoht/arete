/**
 * ContextService — assembles relevant context for queries and skills.
 */
import { join, relative } from 'node:path';
import { tokenize } from '../search/tokenize.js';
import { PRODUCT_PRIMITIVES } from '../models/index.js';
// ---------------------------------------------------------------------------
// Primitive → workspace file mapping
// ---------------------------------------------------------------------------
const PRIMITIVE_FILE_MAP = {
    Problem: [
        { files: ['context/business-overview.md'], category: 'context' },
    ],
    User: [
        { files: ['context/users-personas.md'], category: 'context' },
    ],
    Solution: [
        { files: ['context/products-services.md', 'context/technology-overview.md'], category: 'context' },
    ],
    Market: [
        { files: ['context/competitive-landscape.md'], category: 'context' },
    ],
    Risk: [],
};
const ALWAYS_INCLUDE = [
    { file: 'goals/strategy.md', category: 'goals' },
    { file: 'goals/quarter.md', category: 'goals' },
];
const GAP_SUGGESTIONS = {
    Problem: 'Add problem context to context/business-overview.md or start a discovery project',
    User: 'Add user/persona details to context/users-personas.md or create people files in people/',
    Solution: 'Add product details to context/products-services.md',
    Market: 'Add competitive landscape to context/competitive-landscape.md',
    Risk: 'Risks are often scattered across memory and projects — use arete memory search to find past decisions and learnings',
};
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function extractSummary(content) {
    const lines = content.split('\n');
    const paras = [];
    let buf = '';
    for (const line of lines) {
        if (line.startsWith('---') && paras.length === 0 && buf === '') {
            const fmEnd = content.indexOf('\n---', content.indexOf('---') + 3);
            if (fmEnd >= 0) {
                const afterFm = content.slice(fmEnd + 4).trim();
                return extractSummary(afterFm);
            }
        }
        const trimmed = line.trim();
        if (trimmed === '' && buf.length > 0) {
            paras.push(buf.trim());
            buf = '';
        }
        else if (!trimmed.startsWith('#') && trimmed !== '') {
            buf += (buf.length > 0 ? ' ' : '') + trimmed;
        }
    }
    if (buf.length > 0)
        paras.push(buf.trim());
    const summary = paras[0] || '';
    return summary.length > 300 ? summary.slice(0, 297) + '...' : summary;
}
function isPlaceholder(content) {
    const body = content.replace(/^---[\s\S]*?---\n?/, '').trim();
    const textOnly = body.replace(/^#+\s+.*/gm, '').trim();
    if (textOnly.length < 20)
        return true;
    if (textOnly.includes('TODO') || textOnly.includes('[Add ') || textOnly.includes('Add your '))
        return true;
    return false;
}
function hasTokenOverlap(text, tokens) {
    const lower = text.toLowerCase();
    return tokens.some(t => lower.includes(t));
}
function daysAgo(dateStr) {
    const itemDate = new Date(dateStr);
    const today = new Date();
    const diffMs = today.getTime() - itemDate.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
function formatDaysAgo(days) {
    if (days === 0)
        return 'today';
    if (days === 1)
        return '1 day ago';
    return `${days} days ago`;
}
/** Map a relative file path to the ProductPrimitive it serves (if any) */
function determinePrimitive(relPath) {
    if (relPath === 'context/business-overview.md')
        return 'Problem';
    if (relPath === 'context/users-personas.md')
        return 'User';
    if (relPath === 'context/products-services.md' || relPath === 'context/technology-overview.md')
        return 'Solution';
    if (relPath === 'context/competitive-landscape.md')
        return 'Market';
    if (relPath.startsWith('people/'))
        return 'User';
    return undefined;
}
// ---------------------------------------------------------------------------
// ContextService
// ---------------------------------------------------------------------------
export class ContextService {
    storage;
    searchProvider;
    constructor(storage, searchProvider) {
        this.storage = storage;
        this.searchProvider = searchProvider;
    }
    async getRelevantContext(request) {
        const now = new Date().toISOString();
        const { query, paths } = request;
        const queryTokens = tokenize(query);
        const primitives = request.primitives && request.primitives.length > 0
            ? request.primitives
            : [...PRODUCT_PRIMITIVES];
        const maxFiles = request.maxFiles ?? 15;
        const minScore = request.minScore ?? 0.3;
        const staticScore = 0.5;
        const files = [];
        const gaps = [];
        const seenPaths = new Set();
        const safeRead = async (filePath) => {
            try {
                const exists = await this.storage.exists(filePath);
                if (!exists)
                    return null;
                return await this.storage.read(filePath);
            }
            catch {
                return null;
            }
        };
        const addFile = async (filePath, category, primitive, relevanceScore) => {
            if (seenPaths.has(filePath))
                return;
            const content = await safeRead(filePath);
            if (content === null)
                return;
            seenPaths.add(filePath);
            files.push({
                path: filePath,
                relativePath: relative(paths.root, filePath),
                primitive,
                category,
                summary: extractSummary(content),
                content,
                relevanceScore,
            });
        };
        // 1. Always-include files
        for (const entry of ALWAYS_INCLUDE) {
            const fullPath = join(paths.root, entry.file);
            await addFile(fullPath, entry.category, undefined, staticScore);
        }
        // 2. Primitive-mapped files
        for (const prim of primitives) {
            const mappings = PRIMITIVE_FILE_MAP[prim];
            let foundForPrimitive = false;
            for (const mapping of mappings) {
                for (const file of mapping.files) {
                    const fullPath = join(paths.root, file);
                    const content = await safeRead(fullPath);
                    if (content !== null && !isPlaceholder(content)) {
                        await addFile(fullPath, mapping.category, prim, staticScore);
                        foundForPrimitive = true;
                    }
                }
            }
            if (!foundForPrimitive) {
                gaps.push({
                    primitive: prim,
                    description: `No substantive context found for ${prim} primitive`,
                    suggestion: GAP_SUGGESTIONS[prim],
                });
            }
        }
        // 3. People files (User primitive)
        if (primitives.includes('User')) {
            const peopleCategories = ['internal', 'customers', 'users'];
            for (const cat of peopleCategories) {
                const catDir = join(paths.people, cat);
                const exists = await this.storage.exists(catDir);
                if (!exists)
                    continue;
                const filePaths = await this.storage.list(catDir, { extensions: ['.md'] });
                for (const filePath of filePaths) {
                    const baseName = filePath.split(/[/\\]/).pop() || '';
                    if (baseName === 'index.md')
                        continue;
                    const content = await safeRead(filePath);
                    if (content && hasTokenOverlap(content, queryTokens)) {
                        await addFile(filePath, 'people', 'User', staticScore);
                    }
                }
            }
        }
        // 4. Active projects
        const activeDir = join(paths.projects, 'active');
        const activeSubdirs = await this.storage.listSubdirectories(activeDir);
        for (const projPath of activeSubdirs) {
            const readmePath = join(projPath, 'README.md');
            const readmeExists = await this.storage.exists(readmePath);
            if (!readmeExists)
                continue;
            const content = await safeRead(readmePath);
            if (content && hasTokenOverlap(content, queryTokens)) {
                const prim = primitives.includes('Solution') ? 'Solution' : undefined;
                await addFile(readmePath, 'projects', prim, staticScore);
            }
        }
        // 5. Memory items
        const memoryItemsDir = join(paths.memory, 'items');
        const memoryExists = await this.storage.exists(memoryItemsDir);
        if (memoryExists) {
            const memoryFiles = ['decisions.md', 'learnings.md'];
            for (const mf of memoryFiles) {
                const filePath = join(memoryItemsDir, mf);
                const content = await safeRead(filePath);
                if (content && hasTokenOverlap(content, queryTokens)) {
                    await addFile(filePath, 'memory', 'Risk', staticScore);
                }
            }
        }
        // 6. SearchProvider discovery
        try {
            const searchResults = await this.searchProvider.semanticSearch(query, {
                limit: maxFiles * 2,
                minScore,
            });
            for (const result of searchResults) {
                if (seenPaths.has(result.path))
                    continue;
                if (result.score < minScore)
                    continue;
                const relPath = relative(paths.root, result.path);
                let category = 'resources';
                if (relPath.startsWith('context/'))
                    category = 'context';
                else if (relPath.startsWith('goals/'))
                    category = 'goals';
                else if (relPath.startsWith('projects/'))
                    category = 'projects';
                else if (relPath.startsWith('people/'))
                    category = 'people';
                else if (relPath.startsWith('.arete/memory/') || relPath.startsWith('resources/meetings') || relPath.startsWith('resources/conversations'))
                    category = 'memory';
                await addFile(result.path, category, undefined, result.score);
            }
        }
        catch {
            // SearchProvider failure: continue with static files only
        }
        // 7. Sort and cap
        files.sort((a, b) => {
            const scoreA = a.relevanceScore ?? 0;
            const scoreB = b.relevanceScore ?? 0;
            return scoreB - scoreA;
        });
        const cappedFiles = files.slice(0, maxFiles);
        // 8. Confidence
        const totalPrimitives = primitives.length;
        const coveredPrimitives = totalPrimitives - gaps.length;
        const contextFileCount = cappedFiles.filter(f => f.category === 'context').length;
        let confidence;
        if (coveredPrimitives >= totalPrimitives && contextFileCount >= 2) {
            confidence = 'High';
        }
        else if (coveredPrimitives >= totalPrimitives * 0.5 || contextFileCount >= 1) {
            confidence = 'Medium';
        }
        else {
            confidence = 'Low';
        }
        // 9. Temporal signals — search memory for recent mentions of the topic
        const temporalSignals = [];
        try {
            const temporalMatches = [];
            const memItemsDir = join(paths.memory, 'items');
            const memExists = await this.storage.exists(memItemsDir);
            if (memExists) {
                const memFiles = ['decisions.md', 'learnings.md', 'agent-observations.md'];
                for (const mf of memFiles) {
                    const filePath = join(memItemsDir, mf);
                    const content = await safeRead(filePath);
                    if (!content)
                        continue;
                    const sections = content.split(/^###\s+/m).slice(1);
                    for (const section of sections) {
                        const headingMatch = section.match(/^(?:(\d{4}-\d{2}-\d{2}):\s*)?(.+)/);
                        if (!headingMatch)
                            continue;
                        const date = headingMatch[1];
                        const title = headingMatch[2].trim();
                        if (!date)
                            continue;
                        const sectionLower = section.toLowerCase();
                        if (queryTokens.some(t => sectionLower.includes(t))) {
                            temporalMatches.push({ date, title, source: mf.replace('.md', '') });
                        }
                    }
                }
            }
            // Check meetings
            const meetingsDir = join(paths.resources, 'meetings');
            const meetingsExist = await this.storage.exists(meetingsDir);
            if (meetingsExist) {
                const meetingFiles = await this.storage.list(meetingsDir, { extensions: ['.md'] });
                for (const mp of meetingFiles) {
                    const baseName = mp.split(/[/\\]/).pop() ?? '';
                    if (baseName === 'index.md')
                        continue;
                    const dateMatch = baseName.match(/^(\d{4}-\d{2}-\d{2})/);
                    if (!dateMatch)
                        continue;
                    const content = await safeRead(mp);
                    if (!content)
                        continue;
                    if (!hasTokenOverlap(content, queryTokens))
                        continue;
                    let title = baseName.replace(/\.md$/, '');
                    const titleMatch = content.match(/^title:\s*"?([^"\n]+)"?\s*$/m);
                    if (titleMatch)
                        title = titleMatch[1].trim();
                    temporalMatches.push({ date: dateMatch[1], title, source: 'meeting' });
                }
            }
            // Sort by date descending and generate signals for the most recent matches
            temporalMatches.sort((a, b) => b.date.localeCompare(a.date));
            const MAX_SIGNALS = 5;
            for (const match of temporalMatches.slice(0, MAX_SIGNALS)) {
                const days = daysAgo(match.date);
                temporalSignals.push(`last discussed ${formatDaysAgo(days)} in ${match.source}: "${match.title}"`);
            }
        }
        catch {
            // Temporal signal generation is best-effort — don't fail context assembly
        }
        return {
            query,
            primitives,
            files: cappedFiles,
            gaps,
            confidence,
            assembledAt: now,
            temporalSignals: temporalSignals.length > 0 ? temporalSignals : undefined,
        };
    }
    /**
     * Delegate to storage.listSubdirectories for use by IntelligenceService.
     */
    async listProjectSubdirs(dir) {
        const exists = await this.storage.exists(dir);
        if (!exists)
            return [];
        return this.storage.listSubdirectories(dir);
    }
    /**
     * List all .md files in a directory for proactive search.
     */
    async listProjectFiles(dir) {
        const exists = await this.storage.exists(dir);
        if (!exists)
            return [];
        return this.storage.list(dir, { recursive: true, extensions: ['.md'] });
    }
    /**
     * Read a single file — delegate to storage for IntelligenceService proactive search.
     */
    async readFile(filePath) {
        try {
            const exists = await this.storage.exists(filePath);
            if (!exists)
                return null;
            return await this.storage.read(filePath);
        }
        catch {
            return null;
        }
    }
    async getContextForSkill(skill, task, paths) {
        const primitives = skill.primitives && skill.primitives.length > 0
            ? skill.primitives
            : undefined;
        return this.getRelevantContext({
            query: task,
            paths,
            primitives,
        });
    }
    async getContextInventory(paths, options) {
        const now = new Date();
        const scannedAt = now.toISOString();
        const staleThresholdDays = options?.staleThresholdDays ?? 30;
        const contextDirs = [
            join(paths.root, 'context'),
            join(paths.root, 'goals'),
            join(paths.root, 'projects', 'active'),
            paths.people,
        ];
        // Also scan meetings, conversations, and memory
        const extraDirs = [
            join(paths.resources, 'meetings'),
            join(paths.resources, 'conversations'),
            join(paths.memory, 'items'),
        ];
        const allFiles = [];
        const byCategory = {};
        const freshness = [];
        const scanDir = async (dir) => {
            const exists = await this.storage.exists(dir);
            if (!exists)
                return;
            const filePaths = await this.storage.list(dir, { recursive: true, extensions: ['.md'] });
            for (const filePath of filePaths) {
                const content = await this.storage.read(filePath);
                const relPath = relative(paths.root, filePath);
                let category = 'resources';
                if (relPath.startsWith('context/'))
                    category = 'context';
                else if (relPath.startsWith('goals/'))
                    category = 'goals';
                else if (relPath.startsWith('projects/'))
                    category = 'projects';
                else if (relPath.startsWith('people/'))
                    category = 'people';
                else if (relPath.startsWith('.arete/memory/') || relPath.startsWith('resources/meetings') || relPath.startsWith('resources/conversations'))
                    category = 'memory';
                const summary = content ? extractSummary(content) : undefined;
                allFiles.push({
                    path: filePath,
                    relativePath: relPath,
                    category,
                    summary,
                });
                byCategory[category] = (byCategory[category] ?? 0) + 1;
                // Freshness metadata
                const modified = await this.storage.getModified(filePath);
                const lastModified = modified ? modified.toISOString() : null;
                const daysOldVal = modified
                    ? Math.floor((now.getTime() - modified.getTime()) / (1000 * 60 * 60 * 24))
                    : null;
                // Determine which primitive this file maps to
                const primitive = determinePrimitive(relPath);
                freshness.push({
                    relativePath: relPath,
                    category,
                    primitive,
                    lastModified,
                    daysOld: daysOldVal,
                    isStale: daysOldVal !== null && daysOldVal > staleThresholdDays,
                    summary,
                });
            }
        };
        for (const dir of [...contextDirs, ...extraDirs]) {
            await scanDir(dir);
        }
        const staleFiles = freshness.filter(f => f.isStale);
        // Coverage gap detection: check which primitives have no corresponding files
        const coveredPrimitives = new Set();
        for (const entry of freshness) {
            if (entry.primitive) {
                // Only count non-placeholder context files as coverage
                const file = allFiles.find(f => f.relativePath === entry.relativePath);
                if (file?.category === 'context') {
                    const content = await this.storage.read(file.path);
                    if (content && !isPlaceholder(content)) {
                        coveredPrimitives.add(entry.primitive);
                    }
                }
            }
        }
        const missingPrimitives = PRODUCT_PRIMITIVES.filter(p => !coveredPrimitives.has(p));
        return {
            files: allFiles,
            totalFiles: allFiles.length,
            byCategory,
            scannedAt,
            freshness,
            staleFiles,
            missingPrimitives,
            staleThresholdDays,
        };
    }
}
//# sourceMappingURL=context.js.map