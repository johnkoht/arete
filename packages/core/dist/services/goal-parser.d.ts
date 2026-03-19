/**
 * GoalParserService — parses individual goal files or falls back to legacy format.
 *
 * Supports two formats:
 * 1. New format: Individual `.md` files in `goals/` with YAML frontmatter
 * 2. Legacy format: Single `quarter.md` file with Format A or Format B structure
 *
 * Fallback: If no individual goal files found, attempts legacy parsing.
 */
import type { StorageAdapter } from '../storage/adapter.js';
import type { Goal } from '../models/entities.js';
/**
 * Result of frontmatter parsing.
 */
interface ParsedFrontmatter {
    frontmatter: Record<string, unknown>;
    body: string;
}
/**
 * Parse frontmatter from a markdown file.
 * Returns null if no valid frontmatter found.
 */
declare function parseFrontmatter(content: string): ParsedFrontmatter | null;
/**
 * Parse a single goal file with frontmatter.
 * Returns null if the file is malformed or missing required fields.
 */
declare function parseGoalFile(content: string, filePath: string): Goal | null;
/**
 * Extract quarter from content.
 * Looks for `**Quarter**: YYYY-Qn` or `**Quarter**: Qn YYYY`
 * Fallback: current quarter.
 */
declare function extractQuarter(content: string): string;
/**
 * Parse goals from legacy quarter.md file.
 * Tries Format A first, then Format B.
 */
declare function parseLegacyQuarterFile(goalsDir: string, storage: StorageAdapter): Promise<Goal[]>;
/**
 * Parse individual goal files from the goals directory.
 * Excludes strategy.md and other non-goal files.
 */
declare function parseIndividualGoals(goalsDir: string, storage: StorageAdapter): Promise<Goal[]>;
/**
 * Parse all goals from the goals directory.
 *
 * Strategy:
 * 1. First, try to parse individual goal files with frontmatter
 * 2. If no individual files found, fall back to legacy quarter.md parsing
 *
 * @param goalsDir - Path to the goals directory
 * @param storage - Storage adapter for file operations
 * @returns Array of parsed goals
 */
export declare function parseGoals(goalsDir: string, storage: StorageAdapter): Promise<Goal[]>;
export { parseIndividualGoals, parseLegacyQuarterFile, parseGoalFile, parseFrontmatter, extractQuarter, };
//# sourceMappingURL=goal-parser.d.ts.map