/**
 * Claude Code IDE Adapter
 *
 * Adapters may use fs directly (infrastructure).
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { IDEAdapter, CanonicalRule, IDETarget } from './ide-adapter.js';
import type { AreteConfig } from '../models/workspace.js';
import { generateClaudeMd, generateAllSkillCommands } from '../generators/index.js';
import { generateMinimalAgentsMd } from './read-agents-md.js';
import type { SkillDefinition } from '../models/skills.js';

export class ClaudeAdapter implements IDEAdapter {
  readonly target: IDETarget = 'claude';
  readonly configDirName = '.claude';
  readonly ruleExtension = '.md';

  getIDEDirs(): string[] {
    return [
      '.claude',
      '.claude/rules',
      '.claude/tools',
      '.claude/commands',
      '.claude/integrations',
      '.claude/integrations/configs',
    ];
  }

  rulesDir(): string {
    return '.claude/rules';
  }

  toolsDir(): string {
    return '.claude/tools';
  }

  commandsDir(): string {
    return '.claude/commands';
  }

  integrationsDir(): string {
    return '.claude/integrations';
  }

  formatRule(rule: CanonicalRule, _config: AreteConfig): string {
    const frontmatter: Record<string, unknown> = {
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
      } else if (typeof value === 'boolean') {
        yamlLines.push(`${key}: ${value}`);
      } else {
        yamlLines.push(`${key}: ${value}`);
      }
    }
    yamlLines.push('---');
    return `${yamlLines.join('\n')}\n\n${rule.content}`;
  }

  transformRuleContent(content: string): string {
    return content
      .replace(/\.cursor\/skills\//g, '.agents/skills/')
      .replace(/\.cursor\//g, '.claude/')
      .replace(/\.mdc\b/g, '.md');
  }

  supportsMemoryInjection(): boolean {
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
  generateRootFiles(
    config: AreteConfig,
    _workspaceRoot: string,
    _sourceRulesDir?: string,
    skills?: SkillDefinition[],
    memorySummary?: import('../models/memory-summary.js').MemorySummary,
  ): Record<string, string> {
    const claudeMd = generateClaudeMd(config, skills ?? [], memorySummary);
    return { 'CLAUDE.md': claudeMd };
  }

  /**
   * Last-resort minimal content, used by `regenerateRootFiles` only when
   * the main generator throws AND no existing file is on disk. Ensures
   * fresh installs never end up without CLAUDE.md even under a
   * generator bug.
   */
  generateMinimalRootFiles(): Record<string, string> {
    return { 'CLAUDE.md': generateMinimalAgentsMd() };
  }

  generateCommands(skills: SkillDefinition[]): Record<string, string> {
    return generateAllSkillCommands(skills);
  }

  detectInWorkspace(workspaceRoot: string): boolean {
    return existsSync(join(workspaceRoot, '.claude'));
  }
}
