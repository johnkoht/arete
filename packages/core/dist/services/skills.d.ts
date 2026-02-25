/**
 * SkillService — manages skill discovery and installation.
 *
 * Business logic only. No chalk, inquirer, or other CLI dependencies.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { SkillDefinition, InstallSkillOptions, InstallSkillResult } from '../models/index.js';
export declare class SkillService {
    private storage;
    constructor(storage: StorageAdapter);
    list(workspaceRoot: string): Promise<SkillDefinition[]>;
    get(name: string, workspaceRoot: string): Promise<SkillDefinition | null>;
    getInfo(skillPath: string): Promise<SkillDefinition>;
    install(source: string, options: InstallSkillOptions): Promise<InstallSkillResult>;
    private buildAreteMeta;
}
//# sourceMappingURL=skills.d.ts.map