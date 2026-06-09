/**
 * Search provider factory — returns the best available search provider.
 */

import { spawnSync } from 'node:child_process';
import { FileStorageAdapter } from '../storage/file.js';
import { getSearchProvider as getFallbackProvider } from './providers/fallback.js';
import { getSearchProvider as getQmdProvider } from './providers/qmd.js';
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
export function getSearchProvider(
  workspaceRoot: string,
  collections?: QmdCollections,
): SearchProvider {
  // Allow forcing fallback provider (e.g. in tests to avoid spawning heavy qmd processes)
  if (process.env.ARETE_SEARCH_FALLBACK === '1') {
    const storage = new FileStorageAdapter();
    return getFallbackProvider(workspaceRoot, storage);
  }

  try {
    const r = spawnSync('which', ['qmd'], { encoding: 'utf8' });
    if (r.status === 0 && (r.stdout?.trim()?.length ?? 0) > 0) {
      return getQmdProvider(workspaceRoot, undefined, collections);
    }
  } catch {
    // ignore
  }
  const storage = new FileStorageAdapter();
  return getFallbackProvider(workspaceRoot, storage);
}
