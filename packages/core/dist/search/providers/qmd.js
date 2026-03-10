/**
 * QMD search provider — semantic/hybrid search via QMD CLI.
 * Used when QMD is installed; falls back to token-based provider otherwise.
 */
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
export const QMD_PROVIDER_NAME = 'qmd';
const DEFAULT_TIMEOUT_MS = 5000;
/**
 * Strip `qmd://collection-name/` prefix from QMD file paths.
 * Returns the relative path portion (e.g., "resources/meetings/foo.md").
 */
function stripQmdPrefix(qmdPath) {
    // Format: qmd://collection-name/relative/path.md
    const match = qmdPath.match(/^qmd:\/\/[^/]+\/(.+)$/);
    return match ? match[1] : qmdPath;
}
/** Parse QMD CLI JSON output into SearchResult[]. Exported for tests. */
export function parseQmdJson(stdout) {
    const trimmed = stdout.trim();
    if (!trimmed)
        return [];
    try {
        const data = JSON.parse(trimmed);
        const rows = Array.isArray(data) ? data : (data.results != null ? data.results : []);
        return rows
            .filter((r) => r && (r.file != null || r.path != null || r.snippet != null || r.content != null))
            .map((r) => {
            let score = typeof r.score === 'number' ? r.score : 1;
            if (score > 1 || score < 0) {
                score = Math.max(0, Math.min(1, score));
            }
            // Prefer new field names, fall back to legacy
            const rawPath = typeof r.file === 'string' ? r.file : (typeof r.path === 'string' ? r.path : '');
            const path = stripQmdPrefix(rawPath);
            const content = typeof r.snippet === 'string' ? r.snippet : (typeof r.content === 'string' ? r.content : '');
            return {
                path,
                content,
                score,
                matchType: 'semantic',
            };
        })
            .filter((s) => s.path !== '' || s.content !== '');
    }
    catch {
        return [];
    }
}
/**
 * QMD-backed search provider. isAvailable() checks for qmd binary.
 * search() runs `qmd search`; semanticSearch() runs `qmd query`.
 * Optional testDeps for unit tests (inject mocks).
 */
export function getSearchProvider(workspaceRoot, testDeps) {
    const whichSyncImpl = testDeps?.whichSync ?? (() => spawnSync('which', ['qmd'], { encoding: 'utf8' }));
    const execFileAsyncImpl = testDeps?.execFileAsync ??
        (async (file, args, opts) => execFileAsync(file, args, opts));
    return {
        name: QMD_PROVIDER_NAME,
        async isAvailable() {
            try {
                const r = whichSyncImpl();
                return r.status === 0 && (r.stdout?.trim()?.length ?? 0) > 0;
            }
            catch {
                return false;
            }
        },
        async search(query, options) {
            const limit = options?.limit ?? 10;
            try {
                const { stdout } = await execFileAsyncImpl('qmd', ['search', query, '--json', '-n', String(limit)], { timeout: DEFAULT_TIMEOUT_MS, cwd: workspaceRoot, maxBuffer: 10 * 1024 * 1024 });
                const results = parseQmdJson(stdout ?? '');
                const minScore = options?.minScore ?? 0;
                return results.filter(r => r.score >= minScore).slice(0, limit);
            }
            catch {
                return [];
            }
        },
        async semanticSearch(query, options) {
            const limit = options?.limit ?? 10;
            try {
                const { stdout } = await execFileAsyncImpl('qmd', ['query', query, '--json', '-n', String(limit)], { timeout: DEFAULT_TIMEOUT_MS, cwd: workspaceRoot, maxBuffer: 10 * 1024 * 1024 });
                const results = parseQmdJson(stdout ?? '');
                const minScore = options?.minScore ?? 0;
                return results.filter(r => r.score >= minScore).slice(0, limit);
            }
            catch {
                return [];
            }
        },
    };
}
//# sourceMappingURL=qmd.js.map