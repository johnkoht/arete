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
    supportsMemoryInjection(): boolean;
    /**
     * Generate CLAUDE.md content. Propagates `generateClaudeMd`
     * exceptions — caller (`WorkspaceService.regenerateRootFiles`)
     * governs fallback: retry without memory, then leave existing file
     * untouched (never wipe a good user-visible file with a minimal stub).
     *
     * For fresh installs where no CLAUDE.md exists yet, `generateMinimalRootFiles`
     * provides a safe last-resort stub.
     */
    generateRootFiles(config: AreteConfig, _workspaceRoot: string, _sourceRulesDir?: string, skills?: SkillDefinition[], memorySummary?: import('../models/memory-summary.js').MemorySummary): Record<string, string>;
    /**
     * Last-resort minimal content, used by `regenerateRootFiles` only when
     * the main generator throws AND no existing file is on disk. Ensures
     * fresh installs never end up without CLAUDE.md even under a
     * generator bug.
     */
    generateMinimalRootFiles(): Record<string, string>;
    generateCommands(skills: SkillDefinition[]): Record<string, string>;
    detectInWorkspace(workspaceRoot: string): boolean;
}
//# sourceMappingURL=claude-adapter.d.ts.map