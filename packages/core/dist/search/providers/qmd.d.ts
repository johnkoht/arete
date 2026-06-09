/**
 * QMD search provider — semantic/hybrid search via QMD CLI.
 * Used when QMD is installed; falls back to token-based provider otherwise.
 */
import type { QmdCollectionRoots } from '../qmd-setup.js';
import type { QmdCollections } from '../../models/workspace.js';
import type { SearchProvider, SearchResult } from '../types.js';
export declare const QMD_PROVIDER_NAME = "qmd";
/**
 * Parse QMD CLI JSON output into SearchResult[]. Exported for tests.
 *
 * When `collectionRoots` is provided, result paths from known scoped
 * collections are rebased to workspace-relative paths (qmd returns paths
 * relative to the COLLECTION root, e.g. `qmd://arete-xxxx-memory/topics/foo.md`
 * for a file that lives at `.arete/memory/topics/foo.md`). Without it,
 * paths just have the `qmd://collection/` prefix stripped (legacy behavior).
 */
export declare function parseQmdJson(stdout: string, collectionRoots?: QmdCollectionRoots): SearchResult[];
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
 *
 * @param collections - Scope → collection-name map from arete.yaml
 *   (`qmd_collections`). Used together with the deterministic generated
 *   names to rebase scoped-collection result paths to workspace-relative.
 */
export declare function getSearchProvider(workspaceRoot: string, testDeps?: QmdTestDeps, collections?: QmdCollections): SearchProvider;
//# sourceMappingURL=qmd.d.ts.map