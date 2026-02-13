/**
 * Rule Transpiler
 * 
 * Parses canonical .mdc rule files and transpiles them to IDE-specific formats
 * using IDE adapters. Supports YAML frontmatter parsing and batch processing.
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { basename, join } from 'path';
import yaml from 'yaml';
import type { IDEAdapter, CanonicalRule } from './ide-adapter.js';
import type { AreteConfig, SyncResults } from '../types.js';

/**
 * Parsed rule representation before transpilation
 */
export interface ParsedRule {
  /** Rule name (derived from filename without extension) */
  name: string;
  
  /** Parsed YAML frontmatter */
  frontmatter: {
    /** Human-readable description of the rule's purpose */
    description?: string;
    
    /** Optional glob patterns for file-specific rules */
    globs?: string[];
    
    /** Whether this rule should always be applied to all files */
    alwaysApply?: boolean;
  };
  
  /** Rule content (markdown with agent instructions, without frontmatter) */
  content: string;
}


/**
 * Parse a canonical .mdc rule file with YAML frontmatter
 * 
 * Reads the file, extracts and parses YAML frontmatter, and returns
 * a structured representation.
 * 
 * @param filePath - Absolute path to .mdc rule file
 * @returns Parsed rule with name, frontmatter, and content
 * @throws Error if file cannot be read or parsed
 * 
 * @example
 * ```typescript
 * const rule = parseRule('/path/to/routing-mandatory.mdc');
 * console.log(rule.name); // 'routing-mandatory'
 * console.log(rule.frontmatter.alwaysApply); // true
 * console.log(rule.content); // '# 🛑 STOP - READ THIS FIRST...'
 * ```
 */
export function parseRule(filePath: string): ParsedRule {
  const content = readFileSync(filePath, 'utf-8');
  const name = basename(filePath, '.mdc');
  
  // Extract frontmatter and content
  // Format: ---\nYAML\n---\n\nContent
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n\r?\n([\s\S]*)$/);
  
  if (!frontmatterMatch) {
    // No frontmatter - treat entire file as content
    return {
      name,
      frontmatter: {},
      content: content.trim(),
    };
  }
  
  const [, frontmatterText, bodyContent] = frontmatterMatch;
  
  // Parse YAML frontmatter
  let frontmatter: ParsedRule['frontmatter'] = {};
  try {
    const parsed = yaml.parse(frontmatterText);
    if (parsed && typeof parsed === 'object') {
      frontmatter = {
        description: parsed.description,
        globs: parsed.globs,
        alwaysApply: parsed.alwaysApply,
      };
    }
  } catch (error) {
    throw new Error(`Failed to parse YAML frontmatter in ${filePath}: ${error}`);
  }
  
  return {
    name,
    frontmatter,
    content: bodyContent.trim(),
  };
}

/**
 * Transpile a parsed rule to IDE-specific format
 * 
 * Converts a ParsedRule to CanonicalRule, applies IDE-specific formatting
 * via the adapter, and prepends an auto-generated header.
 * 
 * @param rule - Parsed rule representation
 * @param adapter - IDE adapter for target IDE
 * @param config - Areté configuration
 * @returns Object with filename and formatted content
 * 
 * @example
 * ```typescript
 * const parsed = parseRule('/path/to/routing-mandatory.mdc');
 * const adapter = new CursorAdapter();
 * const config = loadConfig();
 * const result = transpileRule(parsed, adapter, config);
 * console.log(result.filename); // 'routing-mandatory.mdc'
 * console.log(result.content); // '<!-- AUTO-GENERATED... -->\n---\n...'
 * ```
 */
export function transpileRule(
  rule: ParsedRule,
  adapter: IDEAdapter,
  config: AreteConfig
): { filename: string; content: string } {
  // Convert ParsedRule to CanonicalRule
  const canonicalRule: CanonicalRule = {
    name: rule.name,
    description: rule.frontmatter.description || '',
    content: rule.content,
    globs: rule.frontmatter.globs,
    alwaysApply: rule.frontmatter.alwaysApply,
  };
  
  // Format rule via adapter
  const formatted = adapter.formatRule(canonicalRule, config);
  
  // Transform content for IDE-specific paths
  const transformed = adapter.transformRuleContent(formatted);
  
  // Generate filename with IDE-specific extension
  const filename = `${rule.name}${adapter.ruleExtension}`;
  
  return {
    filename,
    content: transformed,
  };
}

/**
 * Transpile multiple rules from source directory to destination directory
 * 
 * Batch processes all rules in the allowList:
 * 1. Clears existing transpiled rules from destination
 * 2. Parses and transpiles each rule in allowList
 * 3. Writes transpiled rules to destination
 * 4. Returns sync results
 * 
 * @param srcDir - Absolute path to source directory (canonical rules)
 * @param destDir - Absolute path to destination directory (IDE-specific rules)
 * @param adapter - IDE adapter for target IDE
 * @param config - Areté configuration
 * @param allowList - Array of rule filenames to transpile (e.g., PRODUCT_RULES_ALLOW_LIST)
 * @returns Sync results with counts of added/removed files
 * 
 * @example
 * ```typescript
 * const results = transpileRules(
 *   '/path/to/runtime/rules',
 *   '/path/to/.cursor/rules',
 *   new CursorAdapter(),
 *   config,
 *   PRODUCT_RULES_ALLOW_LIST
 * );
 * console.log(results.added); // ['routing-mandatory.mdc', 'pm-workspace.mdc', ...]
 * console.log(results.removed); // ['old-rule.mdc']
 * ```
 */
export function transpileRules(
  srcDir: string,
  destDir: string,
  adapter: IDEAdapter,
  config: AreteConfig,
  allowList: string[]
): SyncResults {
  const results: SyncResults = {
    added: [],
    updated: [],
    preserved: [],
    removed: [],
  };

  // Verify source exists before touching destination (avoid wiping rules if source unavailable)
  if (!existsSync(srcDir)) {
    return results;
  }

  // Create allowList set for O(1) lookup
  const allowedSet = new Set(allowList);

  // Clear existing transpiled rules in destination
  // Remove all files matching the adapter's rule extension
  if (existsSync(destDir)) {
    const existingFiles = readdirSync(destDir);
    for (const file of existingFiles) {
      if (file.endsWith(adapter.ruleExtension)) {
        const destPath = join(destDir, file);
        unlinkSync(destPath);
        results.removed.push(destPath);
      }
    }
  }
  
  const sourceFiles = readdirSync(srcDir);
  
  for (const file of sourceFiles) {
    // Skip files not in allowList
    if (!allowedSet.has(file)) {
      continue;
    }
    
    // Skip non-.mdc files
    if (!file.endsWith('.mdc')) {
      continue;
    }
    
    const srcPath = join(srcDir, file);
    
    try {
      // Parse canonical rule
      const parsed = parseRule(srcPath);
      
      // Transpile to IDE-specific format
      const transpiled = transpileRule(parsed, adapter, config);
      
      // Write transpiled rule to destination
      const destPath = join(destDir, transpiled.filename);
      writeFileSync(destPath, transpiled.content, 'utf-8');
      
      results.added.push(destPath);
    } catch (error) {
      // Log error but continue processing other rules
      console.error(`Failed to transpile rule ${file}: ${error}`);
    }
  }
  
  return results;
}
