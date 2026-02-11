/**
 * IDE Adapter Interface
 * 
 * Provides abstraction for IDE-specific workspace structure and behavior.
 * Enables Areté to support multiple IDEs (Cursor, Claude) from a single
 * canonical workspace structure.
 */

import type { AreteConfig } from '../types.js';

/**
 * Supported IDE targets
 */
export type IDETarget = 'cursor' | 'claude';

/**
 * Canonical representation of a rule before IDE-specific formatting
 */
export interface CanonicalRule {
  /** Rule name (derived from filename or frontmatter) */
  name: string;
  
  /** Human-readable description of the rule's purpose */
  description: string;
  
  /** Rule content (markdown with agent instructions) */
  content: string;
  
  /** Optional glob patterns for file-specific rules */
  globs?: string[];
  
  /** Whether this rule should always be applied to all files */
  alwaysApply?: boolean;
}

/**
 * IDE-specific adapter interface
 * 
 * Implementations provide IDE-specific behavior for workspace structure,
 * rule formatting, and IDE detection.
 */
export interface IDEAdapter {
  /**
   * IDE target identifier (readonly)
   */
  readonly target: IDETarget;
  
  /**
   * Name of the IDE-specific configuration directory (e.g., '.cursor', '.claude')
   */
  readonly configDirName: string;
  
  /**
   * File extension for rules (e.g., '.mdc' for Cursor, '.md' for Claude)
   */
  readonly ruleExtension: string;
  
  /**
   * Get all IDE-specific directory names
   * @returns Array of directory paths relative to workspace root
   */
  getIDEDirs(): string[];
  
  /**
   * Get the rules directory path
   * @returns Relative path to rules directory
   */
  rulesDir(): string;
  
  /**
   * Get the tools directory path
   * @returns Relative path to tools directory
   */
  toolsDir(): string;
  
  /**
   * Get the integrations directory path
   * @returns Relative path to integrations directory
   */
  integrationsDir(): string;
  
  /**
   * Format a canonical rule for this IDE
   * @param rule - Canonical rule representation
   * @param config - Areté configuration
   * @returns IDE-specific formatted rule content
   */
  formatRule(rule: CanonicalRule, config: AreteConfig): string;
  
  /**
   * Transform rule content for IDE-specific path references
   * @param content - Original rule content
   * @returns Transformed content with IDE-specific paths
   */
  transformRuleContent(content: string): string;
  
  /**
   * Generate IDE-specific root files (e.g., AGENTS.md)
   * @param config - Areté configuration
   * @param workspaceRoot - Absolute path to workspace root
   * @param sourceRulesDir - Optional path to canonical rules directory (for reading routing-mandatory.mdc)
   * @returns Map of filename to file content
   */
  generateRootFiles(
    config: AreteConfig,
    workspaceRoot: string,
    sourceRulesDir?: string
  ): Record<string, string>;
  
  /**
   * Detect if this IDE's configuration exists in the workspace
   * @param workspaceRoot - Absolute path to workspace root
   * @returns True if this adapter's IDE directory exists
   */
  detectInWorkspace(workspaceRoot: string): boolean;
}
