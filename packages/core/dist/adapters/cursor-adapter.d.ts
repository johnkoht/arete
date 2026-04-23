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
    /**
     * Cursor does NOT yet support memory injection into the generated
     * AGENTS.md. `dist/AGENTS.md` is a static distributed artifact;
     * per-workspace memory needs a post-process injection step (Phase B
     * of topic-wiki-memory). Until then we explicitly return false so
     * callers know to skip memory loading for Cursor workspaces.
     */
    supportsMemoryInjection(): boolean;
    generateRootFiles(config: AreteConfig, _workspaceRoot: string, _sourceRulesDir?: string, _skills?: SkillDefinition[], _memorySummary?: import('../models/memory-summary.js').MemorySummary): Record<string, string>;
    detectInWorkspace(workspaceRoot: string): boolean;
}
//# sourceMappingURL=cursor-adapter.d.ts.map