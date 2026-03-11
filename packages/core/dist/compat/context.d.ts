/**
 * Compatibility shim for getRelevantContext.
 * Delegates to ContextService for backward compatibility with existing CLI.
 */
import type { WorkspacePaths, ContextBundle, ContextInjectionOptions } from '../models/index.js';
/**
 * Assemble relevant workspace context for a given task/query.
 * Delegates to ContextService.
 */
export declare function getRelevantContext(query: string, paths: WorkspacePaths, options?: ContextInjectionOptions): Promise<ContextBundle>;
//# sourceMappingURL=context.d.ts.map