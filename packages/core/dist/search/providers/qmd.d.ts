/**
 * QMD search provider — semantic/hybrid search via QMD CLI.
 * Used when QMD is installed; falls back to token-based provider otherwise.
 */
import type { SearchProvider, SearchResult } from '../types.js';
export declare const QMD_PROVIDER_NAME = "qmd";
/** Parse QMD CLI JSON output into SearchResult[]. Exported for tests. */
export declare function parseQmdJson(stdout: string): SearchResult[];
/** Optional test doubles (used only in tests) */
export interface QmdTestDeps {
    whichSync: () => {
        status: number;
        stdout?: string;
    };
    execFileAsync: (file: string, args: string[], opts: {
        timeout: number;
        cwd: string;
        maxBuffer: number;
    }) => Promise<{
        stdout?: string;
        stderr?: string;
    }>;
}
/**
 * QMD-backed search provider. isAvailable() checks for qmd binary.
 * search() runs `qmd search`; semanticSearch() runs `qmd query`.
 * Optional testDeps for unit tests (inject mocks).
 */
export declare function getSearchProvider(workspaceRoot: string, testDeps?: QmdTestDeps): SearchProvider;
//# sourceMappingURL=qmd.d.ts.map