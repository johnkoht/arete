/**
 * Search provider factory — returns the best available search provider.
 */
import type { QmdCollections } from '../models/workspace.js';
import type { SearchProvider } from './types.js';
/**
 * Return the best available search provider.
 * Checks QMD first (when available), falls back to token-based provider.
 *
 * @param workspaceRoot - Workspace root path (used by providers that need it)
 * @param collections - Optional scope → collection-name map from arete.yaml,
 *   used by the QMD provider to rebase scoped-collection result paths to
 *   workspace-relative paths.
 */
export declare function getSearchProvider(workspaceRoot: string, collections?: QmdCollections): SearchProvider;
//# sourceMappingURL=factory.d.ts.map