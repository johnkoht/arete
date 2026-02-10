/**
 * Cursor IDE Adapter
 * 
 * Implements IDE adapter for Cursor IDE, preserving current workspace structure
 * and rule formatting behavior.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { IDEAdapter, CanonicalRule, IDETarget } from '../ide-adapter.js';
import type { AreteConfig } from '../../types.js';

/**
 * Cursor IDE Adapter
 * 
 * Preserves current Cursor workspace structure:
 * - .cursor/ configuration directory
 * - .mdc file extension for rules
 * - YAML frontmatter format for rule metadata
 * - No path transformations (baseline behavior)
 */
export class CursorAdapter implements IDEAdapter {
  readonly target: IDETarget = 'cursor';
  readonly configDirName = '.cursor';
  readonly ruleExtension = '.mdc';

  /**
   * Get all Cursor-specific directory paths
   */
  getIDEDirs(): string[] {
    return [
      '.cursor',
      '.cursor/rules',
      '.cursor/tools',
      '.cursor/integrations',
      '.cursor/integrations/configs',
    ];
  }

  /**
   * Get rules directory path
   */
  rulesDir(): string {
    return '.cursor/rules';
  }

  /**
   * Get tools directory path
   */
  toolsDir(): string {
    return '.cursor/tools';
  }

  /**
   * Get integrations directory path
   */
  integrationsDir(): string {
    return '.cursor/integrations';
  }

  /**
   * Format a canonical rule as Cursor .mdc with YAML frontmatter
   * 
   * @param rule - Canonical rule representation
   * @param config - Areté configuration (unused by Cursor adapter)
   * @returns Formatted .mdc content with YAML frontmatter
   */
  formatRule(rule: CanonicalRule, config: AreteConfig): string {
    const frontmatter: Record<string, any> = {
      description: rule.description,
    };

    if (rule.globs && rule.globs.length > 0) {
      frontmatter.globs = rule.globs;
    }

    if (rule.alwaysApply === true) {
      frontmatter.alwaysApply = true;
    }

    // Build YAML frontmatter
    const yamlLines = ['---'];
    for (const [key, value] of Object.entries(frontmatter)) {
      if (Array.isArray(value)) {
        yamlLines.push(`${key}: ${JSON.stringify(value)}`);
      } else if (typeof value === 'boolean') {
        yamlLines.push(`${key}: ${value}`);
      } else {
        yamlLines.push(`${key}: ${value}`);
      }
    }
    yamlLines.push('---');

    return `${yamlLines.join('\n')}\n\n${rule.content}`;
  }

  /**
   * Transform rule content for Cursor
   * 
   * No transformation needed - Cursor uses canonical paths.
   * 
   * @param content - Original rule content
   * @returns Unchanged content
   */
  transformRuleContent(content: string): string {
    return content;
  }

  /**
   * Generate Cursor-specific root files
   * 
   * Cursor uses the canonical AGENTS.md and doesn't require
   * IDE-specific root files.
   * 
   * @param config - Areté configuration (unused)
   * @param workspaceRoot - Workspace root path (unused)
   * @returns Empty object (no files to generate)
   */
  generateRootFiles(config: AreteConfig, workspaceRoot: string): Record<string, string> {
    return {};
  }

  /**
   * Detect if Cursor configuration exists in workspace
   * 
   * @param workspaceRoot - Absolute path to workspace root
   * @returns True if .cursor/ directory exists
   */
  detectInWorkspace(workspaceRoot: string): boolean {
    return existsSync(join(workspaceRoot, '.cursor'));
  }
}
