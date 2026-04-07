/**
 * Claude Code IDE Adapter
 *
 * Adapters may use fs directly (infrastructure).
 */
import type { IDEAdapter, CanonicalRule, IDETarget } from './ide-adapter.js';
import type { AreteConfig } from '../models/workspace.js';
import type { SkillDefinition } from '../models/skills.js';
export declare class ClaudeAdapter implements IDEAdapter {
    readonly target: IDETarget;
    readonly configDirName = ".claude";
    readonly ruleExtension = ".md";
    getIDEDirs(): string[];
    rulesDir(): string;
    toolsDir(): string;
    commandsDir(): string;
    integrationsDir(): string;
    formatRule(rule: CanonicalRule, _config: AreteConfig): string;
    transformRuleContent(content: string): string;
    generateRootFiles(config: AreteConfig, _workspaceRoot: string, _sourceRulesDir?: string, skills?: SkillDefinition[]): Record<string, string>;
    generateCommands(skills: SkillDefinition[]): Record<string, string>;
    detectInWorkspace(workspaceRoot: string): boolean;
}
//# sourceMappingURL=claude-adapter.d.ts.map