/**
 * WorkspaceService — manages workspace detection and lifecycle.
 *
 * Uses StorageAdapter for all file operations. No direct fs imports.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths, WorkspaceStatus, CreateWorkspaceOptions, InstallResult, UpdateResult, UpdateWorkspaceOptions, AreteConfig } from '../models/index.js';
export declare class WorkspaceService {
    private storage;
    constructor(storage: StorageAdapter);
    /**
     * Regenerate root-level agent files (CLAUDE.md for Claude Code,
     * AGENTS.md for Cursor) with an optional memory summary threaded into
     * adapters that support it. Uses `writeIfChanged` to skip git-diff
     * noise when content byte-equals the existing file.
     *
     * Returns per-file write result for observability. Never throws —
     * double-fallback leaves any pre-existing file untouched if both
     * memory-on and memory-off generators fail.
     *
     * Invariant: passing the same (config, skills, memory) produces
     * byte-equal output (generator guarantee — see claude-md.ts footer
     * + Active Topics section header data-derived date).
     */
    regenerateRootFiles(config: AreteConfig, workspacePaths: WorkspacePaths, options?: {
        skills?: import('../models/skills.js').SkillDefinition[];
        memorySummary?: import('../models/memory-summary.js').MemorySummary;
        adapter?: import('../adapters/ide-adapter.js').IDEAdapter;
    }): Promise<{
        [filename: string]: 'unchanged' | 'updated' | 'failed';
    }>;
    isWorkspace(dir: string): Promise<boolean>;
    findRoot(startDir?: string): Promise<string | null>;
    getPaths(workspaceRoot: string): WorkspacePaths;
    create(targetDir: string, options: CreateWorkspaceOptions): Promise<InstallResult>;
    update(workspaceRoot: string, options?: UpdateWorkspaceOptions): Promise<UpdateResult>;
    private copyDirectory;
    private isCommunitySkill;
    private syncCoreSkills;
    private ensureWorkspaceStructure;
    /**
     * Update a single field in arete.yaml without overwriting the entire file.
     * Reads, patches, and writes back. Non-fatal on error.
     */
    updateManifestField(workspaceRoot: string, field: string, value: unknown): Promise<void>;
    getStatus(workspaceRoot: string): Promise<WorkspaceStatus>;
}
//# sourceMappingURL=workspace.d.ts.map