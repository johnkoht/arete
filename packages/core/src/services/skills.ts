/**
 * SkillService — manages skill discovery and installation.
 */

import type { StorageAdapter } from '../storage/adapter.js';
import type {
  SkillDefinition,
  InstallSkillOptions,
  InstallSkillResult,
} from '../models/index.js';

export class SkillService {
  constructor(private storage: StorageAdapter) {}

  async list(workspaceRoot: string): Promise<SkillDefinition[]> {
    throw new Error('Not implemented');
  }

  async get(
    name: string,
    workspaceRoot: string
  ): Promise<SkillDefinition | null> {
    throw new Error('Not implemented');
  }

  async install(
    source: string,
    options: InstallSkillOptions
  ): Promise<InstallSkillResult> {
    throw new Error('Not implemented');
  }

  async getInfo(skillPath: string): Promise<SkillDefinition> {
    throw new Error('Not implemented');
  }
}
