/**
 * WorkspaceService — manages workspace detection and lifecycle.
 */

import type { StorageAdapter } from '../storage/adapter.js';
import type {
  WorkspacePaths,
  WorkspaceStatus,
  CreateWorkspaceOptions,
  InstallResult,
  UpdateResult,
} from '../models/index.js';

export class WorkspaceService {
  constructor(private storage: StorageAdapter) {}

  isWorkspace(dir: string): boolean {
    throw new Error('Not implemented');
  }

  findRoot(startDir?: string): string | null {
    throw new Error('Not implemented');
  }

  getPaths(workspaceRoot: string): WorkspacePaths {
    throw new Error('Not implemented');
  }

  async create(
    targetDir: string,
    options: CreateWorkspaceOptions
  ): Promise<InstallResult> {
    throw new Error('Not implemented');
  }

  async update(workspaceRoot: string): Promise<UpdateResult> {
    throw new Error('Not implemented');
  }

  async getStatus(workspaceRoot: string): Promise<WorkspaceStatus> {
    throw new Error('Not implemented');
  }
}
