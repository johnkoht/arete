/**
 * Search provider factory — returns the best available search provider.
 */
import type { SearchProvider } from './types.js';
/**
 * Return the best available search provider.
 * Checks QMD first (when available), falls back to token-based provider.
 *
 * @param workspaceRoot - Workspace root path (used by providers that need it)
 */
export declare function getSearchProvider(workspaceRoot: string): SearchProvider;
//# sourceMappingURL=factory.d.ts.map