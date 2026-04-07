/**
 * Cursor IDE Adapter
 *
 * Adapters may use fs directly (infrastructure).
 */
import type { IDEAdapter, CanonicalRule, IDETarget } from './ide-adapter.js';
import type { AreteConfig } from '../models/workspace.js';
import type { SkillDefinition } from '../models/skills.js';
export declare class CursorAdapter implements IDEAdapter {
    readonly target: IDETarget;
    readonly configDirName = ".cursor";
    readonly ruleExtension = ".mdc";
    getIDEDirs(): string[];
    rulesDir(): string;
    toolsDir(): string;
    integrationsDir(): string;
    commandsDir(): string;
    generateCommands(_skills: SkillDefinition[]): Record<string, string>;
    formatRule(rule: CanonicalRule, _config: AreteConfig): string;
    transformRuleContent(content: string): string;
    generateRootFiles(config: AreteConfig, _workspaceRoot: string, _sourceRulesDir?: string, _skills?: SkillDefinition[]): Record<string, string>;
    detectInWorkspace(workspaceRoot: string): boolean;
}
//# sourceMappingURL=cursor-adapter.d.ts.map