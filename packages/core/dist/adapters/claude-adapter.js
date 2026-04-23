/**
 * Claude Code IDE Adapter
 *
 * Adapters may use fs directly (infrastructure).
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { generateClaudeMd, generateAllSkillCommands } from '../generators/index.js';
import { generateMinimalAgentsMd } from './read-agents-md.js';
export class ClaudeAdapter {
    target = 'claude';
    configDirName = '.claude';
    ruleExtension = '.md';
    getIDEDirs() {
        return [
            '.claude',
            '.claude/rules',
            '.claude/tools',
            '.claude/commands',
            '.claude/integrations',
            '.claude/integrations/configs',
        ];
    }
    rulesDir() {
        return '.claude/rules';
    }
    toolsDir() {
        return '.claude/tools';
    }
    commandsDir() {
        return '.claude/commands';
    }
    integrationsDir() {
        return '.claude/integrations';
    }
    formatRule(rule, _config) {
        const frontmatter = {
            description: rule.description,
        };
        if (rule.alwaysApply !== true && rule.globs && rule.globs.length > 0) {
            frontmatter.globs = rule.globs;
        }
        const yamlLines = ['---'];
        for (const [key, value] of Object.entries(frontmatter)) {
            if (Array.isArray(value)) {
                yamlLines.push(`${key}:`);
                for (const item of value) {
                    yamlLines.push(`  - "${item}"`);
                }
            }
            else if (typeof value === 'boolean') {
                yamlLines.push(`${key}: ${value}`);
            }
            else {
                yamlLines.push(`${key}: ${value}`);
            }
        }
        yamlLines.push('---');
        return `${yamlLines.join('\n')}\n\n${rule.content}`;
    }
    transformRuleContent(content) {
        return content
            .replace(/\.cursor\/skills\//g, '.agents/skills/')
            .replace(/\.cursor\//g, '.claude/')
            .replace(/\.mdc\b/g, '.md');
    }
    supportsMemoryInjection() {
        return true;
    }
    /**
     * Generate CLAUDE.md content. Propagates `generateClaudeMd`
     * exceptions — caller (`WorkspaceService.regenerateRootFiles`)
     * governs fallback: retry without memory, then leave existing file
     * untouched (never wipe a good user-visible file with a minimal stub).
     *
     * For fresh installs where no CLAUDE.md exists yet, `generateMinimalRootFiles`
     * provides a safe last-resort stub.
     */
    generateRootFiles(config, _workspaceRoot, _sourceRulesDir, skills, memorySummary) {
        const claudeMd = generateClaudeMd(config, skills ?? [], memorySummary);
        return { 'CLAUDE.md': claudeMd };
    }
    /**
     * Last-resort minimal content, used by `regenerateRootFiles` only when
     * the main generator throws AND no existing file is on disk. Ensures
     * fresh installs never end up without CLAUDE.md even under a
     * generator bug.
     */
    generateMinimalRootFiles() {
        return { 'CLAUDE.md': generateMinimalAgentsMd() };
    }
    generateCommands(skills) {
        return generateAllSkillCommands(skills);
    }
    detectInWorkspace(workspaceRoot) {
        return existsSync(join(workspaceRoot, '.claude'));
    }
}
//# sourceMappingURL=claude-adapter.js.map