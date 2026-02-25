/**
 * Fallback search provider — token-based keyword matching.
 * Used when QMD is not available. Scans .md files, scores by token overlap.
 * Uses StorageAdapter for all file operations (no direct fs calls).
 */
import { join } from 'node:path';
import { tokenize } from '../tokenize.js';
export const FALLBACK_PROVIDER_NAME = 'fallback';
const DEFAULT_LIMIT = 10;
const DEFAULT_MIN_SCORE = 0;
/** Resolve .md file paths from scope paths (files or directories) */
async function resolveMdPaths(storage, workspaceRoot, scopePaths) {
    const allPaths = new Set();
    for (const scope of scopePaths) {
        const fullPath = join(workspaceRoot, scope);
        const exists = await storage.exists(fullPath);
        if (!exists)
            continue;
        const listed = await storage.list(fullPath, { recursive: true, extensions: ['.md'] });
        if (listed.length > 0) {
            listed.forEach(p => allPaths.add(p));
        }
        else {
            const content = await storage.read(fullPath);
            if (content !== null && fullPath.toLowerCase().endsWith('.md')) {
                allPaths.add(fullPath);
            }
        }
    }
    return Array.from(allPaths);
}
/** Extract title (first # line or filename) and body from file content */
function splitTitleAndBody(content, filePath) {
    const lines = content.split('\n');
    let title = '';
    const bodyLines = [];
    for (const line of lines) {
        const m = line.match(/^#+\s*(.+)/);
        if (m && !title) {
            title = m[1].trim();
        }
        else {
            bodyLines.push(line);
        }
    }
    if (!title) {
        const base = filePath.split(/[/\\]/).pop() ?? '';
        title = base.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
    }
    return { title, body: bodyLines.join('\n') };
}
/** Raw score: title 3 per token, body 1 per token, bonus for multiple token overlap */
function scoreFile(title, body, queryTokens) {
    if (queryTokens.length === 0)
        return 0;
    const titleLower = title.toLowerCase();
    const bodyLower = body.toLowerCase();
    let score = 0;
    for (const token of queryTokens) {
        if (titleLower.includes(token)) {
            score += 3;
        }
        else if (bodyLower.includes(token)) {
            score += 1;
        }
    }
    const combined = titleLower + ' ' + bodyLower;
    const matchCount = queryTokens.filter(t => combined.includes(t)).length;
    if (matchCount > 1) {
        score += matchCount;
    }
    return score;
}
/**
 * Token-based search provider. isAvailable() always true.
 * search() scans .md files and scores by token overlap; semanticSearch() delegates to search().
 */
export function getSearchProvider(workspaceRoot, storage) {
    return {
        name: FALLBACK_PROVIDER_NAME,
        async isAvailable() {
            return true;
        },
        async search(query, options) {
            const limit = options?.limit ?? DEFAULT_LIMIT;
            const minScore = options?.minScore ?? DEFAULT_MIN_SCORE;
            const scopePaths = options?.paths?.length
                ? options.paths
                : ['.'];
            const queryTokens = tokenize(query);
            if (queryTokens.length === 0) {
                return [];
            }
            const allPaths = await resolveMdPaths(storage, workspaceRoot, scopePaths);
            const scored = [];
            for (const filePath of allPaths) {
                const content = await storage.read(filePath);
                if (content === null)
                    continue;
                const { title, body } = splitTitleAndBody(content, filePath);
                const rawScore = scoreFile(title, body, queryTokens);
                if (rawScore > 0) {
                    scored.push({ path: filePath, content, rawScore });
                }
            }
            scored.sort((a, b) => b.rawScore - a.rawScore);
            const maxRaw = scored.length > 0 ? Math.max(...scored.map(s => s.rawScore)) : 1;
            const results = [];
            for (let i = 0; i < scored.length && results.length < limit; i++) {
                const s = scored[i];
                const score = maxRaw > 0 ? s.rawScore / maxRaw : 0;
                if (score < minScore)
                    continue;
                results.push({
                    path: s.path,
                    content: s.content,
                    score,
                    matchType: 'keyword',
                });
            }
            return results;
        },
        async semanticSearch(query, options) {
            return this.search(query, options);
        },
    };
}
//# sourceMappingURL=fallback.js.map