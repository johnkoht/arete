/**
 * Canonical workspace structure: directories and default files.
 * Used by install (new workspaces) and update (backfill missing structure).
 */
/**
 * Base directories that should exist in an Areté workspace (IDE-agnostic).
 */
export declare const BASE_WORKSPACE_DIRS: string[];
/**
 * Rule files to copy on install (product rules only).
 */
export declare const PRODUCT_RULES_ALLOW_LIST: string[];
/**
 * Default files created when missing. Key = path relative to workspace root.
 */
export declare const DEFAULT_FILES: Record<string, string>;
export interface EnsureWorkspaceStructureResult {
    directoriesAdded: string[];
    filesAdded: string[];
}
export interface EnsureWorkspaceStructureOptions {
    dryRun?: boolean;
    /** IDE adapter for IDE-specific dirs (getIDEDirs). When omitted, only base dirs are used. */
    getIDEDirs?: () => string[];
}
//# sourceMappingURL=workspace-structure.d.ts.map