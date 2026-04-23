/**
 * IDE Adapter Interface
 *
 * Provides abstraction for IDE-specific workspace structure and behavior.
 * Adapters may use fs directly (infrastructure, not services).
 */
import type { AreteConfig } from '../models/workspace.js';
import type { SkillDefinition } from '../models/skills.js';
import type { MemorySummary } from '../models/memory-summary.js';
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
    /** Returns the IDE-specific commands directory path, or empty string if not supported. */
    commandsDir?(): string;
    formatRule(rule: CanonicalRule, config: AreteConfig): string;
    transformRuleContent(content: string): string;
    /**
     * Whether this adapter threads `memorySummary` into generated root
     * files (e.g., CLAUDE.md's Active Topics section). Defaults to false
     * when omitted. ClaudeAdapter returns true; CursorAdapter returns
     * false until Phase B designs AGENTS.md memory injection.
     */
    supportsMemoryInjection?(): boolean;
    generateRootFiles(config: AreteConfig, workspaceRoot: string, sourceRulesDir?: string, skills?: SkillDefinition[], memorySummary?: MemorySummary): Record<string, string>;
    /**
     * Last-resort minimal-stub content for the adapter's root files. Called
     * by `WorkspaceService.regenerateRootFiles` only when `generateRootFiles`
     * throws AND no existing file is on disk. Optional — adapters that
     * don't implement it fall through to leaving files absent rather than
     * writing a corrupt or empty file.
     */
    generateMinimalRootFiles?(): Record<string, string>;
    /** Generates IDE-specific command files for skills, or empty object if not supported. */
    generateCommands?(skills: SkillDefinition[]): Record<string, string>;
    detectInWorkspace(workspaceRoot: string): boolean;
}
//# sourceMappingURL=ide-adapter.d.ts.map