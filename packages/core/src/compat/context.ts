/**
 * Compatibility shim for getRelevantContext.
 * Delegates to ContextService for backward compatibility with existing CLI.
 */

import { FileStorageAdapter } from '../storage/file.js';
import { getSearchProvider } from '../search/factory.js';
import { ContextService } from '../services/context.js';
import type {
  WorkspacePaths,
  ContextBundle,
  ContextInjectionOptions,
} from '../models/index.js';

/**
 * Assemble relevant workspace context for a given task/query.
 * Delegates to ContextService.
 */
export async function getRelevantContext(
  query: string,
  paths: WorkspacePaths,
  options: ContextInjectionOptions = {}
): Promise<ContextBundle> {
  const storage = new FileStorageAdapter();
  const searchProvider = getSearchProvider(paths.root);
  const service = new ContextService(storage, searchProvider);
  return service.getRelevantContext({
    query,
    paths,
    primitives: options.primitives,
    workType: options.workType,
    maxFiles: options.maxFiles,
    minScore: options.minScore,
  });
}
