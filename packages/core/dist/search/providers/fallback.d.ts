/**
 * Fallback search provider — token-based keyword matching.
 * Used when QMD is not available. Scans .md files, scores by token overlap.
 * Uses StorageAdapter for all file operations (no direct fs calls).
 */
import type { StorageAdapter } from '../../storage/adapter.js';
import type { SearchProvider } from '../types.js';
export declare const FALLBACK_PROVIDER_NAME = "fallback";
/**
 * Token-based search provider. isAvailable() always true.
 * search() scans .md files and scores by token overlap; semanticSearch() delegates to search().
 */
export declare function getSearchProvider(workspaceRoot: string, storage: StorageAdapter): SearchProvider;
//# sourceMappingURL=fallback.d.ts.map