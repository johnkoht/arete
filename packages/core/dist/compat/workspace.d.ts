/**
 * Compatibility shims for workspace functions.
 * Provides sync API that matches legacy src/core/workspace.ts.
 */
import type { WorkspacePaths } from '../models/index.js';
import type { SourceType, SourcePaths } from '../models/index.js';
/** Sync - uses fs for backward compatibility with sync callers. */
export declare function isAreteWorkspace(dir: string): boolean;
/** Sync - uses fs for backward compatibility. */
export declare function findWorkspaceRoot(startDir?: string): string | null;
/** Sync - uses adapters (which use fs for detection). */
export declare function getWorkspacePaths(workspaceRoot: string): WorkspacePaths;
/**
 * Parse source type. For 'symlink', packageRoot must be provided.
 */
export declare function parseSourceType(source: string, packageRoot?: string): SourceType;
/**
 * Get source paths for runtime assets (skills, tools, rules, templates).
 * Always uses packages/runtime/ as the canonical source.
 */
export declare function getSourcePaths(packageRoot: string): SourcePaths;
//# sourceMappingURL=workspace.d.ts.map