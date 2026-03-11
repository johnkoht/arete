/**
 * WorkspaceService — manages workspace detection and lifecycle.
 *
 * Uses StorageAdapter for all file operations. No direct fs imports.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths, WorkspaceStatus, CreateWorkspaceOptions, InstallResult, UpdateResult, UpdateWorkspaceOptions } from '../models/index.js';
export declare class WorkspaceService {
    private storage;
    constructor(storage: StorageAdapter);
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