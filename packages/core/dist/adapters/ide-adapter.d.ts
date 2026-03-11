/**
 * IDE Adapter Interface
 *
 * Provides abstraction for IDE-specific workspace structure and behavior.
 * Adapters may use fs directly (infrastructure, not services).
 */
import type { AreteConfig } from '../models/workspace.js';
/** Supported IDE targets */
export type IDETarget = 'cursor' | 'claude';
/** Canonical representation of a rule before IDE-specific formatting */
export interface CanonicalRule {
    name: string;
    description: string;
    content: string;
    globs?: string[];
    alwaysApply?: boolean;
}
/** IDE-specific adapter interface */
export interface IDEAdapter {
    readonly target: IDETarget;
    readonly configDirName: string;
    readonly ruleExtension: string;
    getIDEDirs(): string[];
    rulesDir(): string;
    toolsDir(): string;
    integrationsDir(): string;
    formatRule(rule: CanonicalRule, config: AreteConfig): string;
    transformRuleContent(content: string): string;
    generateRootFiles(config: AreteConfig, workspaceRoot: string, sourceRulesDir?: string): Record<string, string>;
    detectInWorkspace(workspaceRoot: string): boolean;
}
//# sourceMappingURL=ide-adapter.d.ts.map