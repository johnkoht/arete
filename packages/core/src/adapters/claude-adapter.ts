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

  generateRootFiles(
    config: AreteConfig,
    _workspaceRoot: string,
    _sourceRulesDir?: string,
    skills?: SkillDefinition[],
    memorySummary?: import('../models/memory-summary.js').MemorySummary,
  ): Record<string, string> {
    let claudeMd: string;
    try {
      claudeMd = generateClaudeMd(config, skills ?? [], memorySummary);
    } catch {
      // First-fallback: retry without memory. A memory-related generator
      // bug must never wedge workspace init/update.
      try {
        claudeMd = generateClaudeMd(config, skills ?? []);
      } catch {
        // Double-fallback: minimal stub so CLAUDE.md is never missing.
        claudeMd = generateMinimalAgentsMd();
      }
    }
    return { 'CLAUDE.md': claudeMd };
  }

  generateCommands(skills: SkillDefinition[]): Record<string, string> {
    return generateAllSkillCommands(skills);
  }

  detectInWorkspace(workspaceRoot: string): boolean {
    return existsSync(join(workspaceRoot, '.claude'));
  }
}
