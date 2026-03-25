/**
 * GoalParserService — parses individual goal files or falls back to legacy format.
 *
 * Supports two formats:
 * 1. New format: Individual `.md` files in `goals/` with YAML frontmatter
 * 2. Legacy format: Single `quarter.md` file with Format A or Format B structure
 *
 * Fallback: If no individual goal files found, attempts legacy parsing.
 */

import { join, basename } from 'path';
import { parse as parseYaml } from 'yaml';
import type { StorageAdapter } from '../storage/adapter.js';
import type { Goal, GoalStatus, GoalType } from '../models/entities.js';

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
function parseFrontmatter(content: string): ParsedFrontmatter | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  try {
    const frontmatter = parseYaml(match[1] ?? '') as Record<string, unknown>;
    return { frontmatter, body: match[2] ?? '' };
  } catch {
    return null;
  }
}

/**
 * Generate a slug from a filename.
 * Removes file extension and sanitizes.
 */
function slugFromFilename(filename: string): string {
  return filename
    .replace(/\.md$/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Validate and coerce status to GoalStatus.
 */
function parseStatus(value: unknown): GoalStatus {
  if (value === 'active' || value === 'complete' || value === 'deferred') {
    return value;
  }
  return 'active';
}

/**
 * Validate and coerce type to GoalType.
 */
function parseType(value: unknown): GoalType {
  if (value === 'outcome' || value === 'milestone') {
    return value;
  }
  return 'outcome';
}

/**
 * Parse a single goal file with frontmatter.
 * Returns null if the file is malformed or missing required fields.
 */
function parseGoalFile(
  content: string,
  filePath: string
): Goal | null {
  const parsed = parseFrontmatter(content);
  if (!parsed) return null;

  const { frontmatter, body } = parsed;

  // Required fields: id, title, quarter
  const id = frontmatter.id;
  const title = frontmatter.title;
  const quarter = frontmatter.quarter;

  if (typeof id !== 'string' || !id.trim()) return null;
  if (typeof title !== 'string' || !title.trim()) return null;
  if (typeof quarter !== 'string' || !quarter.trim()) return null;

  const filename = basename(filePath);
  const slug = slugFromFilename(filename);

  // Optional area association
  const area = typeof frontmatter.area === 'string' && frontmatter.area.trim()
    ? frontmatter.area.trim()
    : undefined;

  return {
    id: id.trim(),
    slug,
    title: title.trim(),
    status: parseStatus(frontmatter.status),
    quarter: quarter.trim(),
    type: parseType(frontmatter.type),
    orgAlignment: typeof frontmatter.orgAlignment === 'string' ? frontmatter.orgAlignment.trim() : '',
    successCriteria: typeof frontmatter.successCriteria === 'string' ? frontmatter.successCriteria.trim() : '',
    filePath,
    body: body.trim() || undefined,
    area,
  };
}

// ---------------------------------------------------------------------------
// Legacy format parsing (reused from goal-migration.ts)
// ---------------------------------------------------------------------------

// Format A: `## Goal N: Title`
const FORMAT_A_REGEX = /^##\s+Goal\s+(\d+):\s*(.+)$/gm;

// Format B: `### Qn-N Title`
const FORMAT_B_REGEX = /^###\s+Q(\d+)-(\d+)\s+(.+)$/gm;

/**
 * Extract quarter from content.
 * Looks for `**Quarter**: YYYY-Qn` or `**Quarter**: Qn YYYY`
 * Fallback: current quarter.
 */
function extractQuarter(content: string): string {
  // Try `**Quarter**: 2026-Q1` format
  const match1 = /\*\*Quarter\*\*:\s*(\d{4})-Q(\d)/i.exec(content);
  if (match1) {
    return `${match1[1]}-Q${match1[2]}`;
  }

  // Try `**Quarter**: Q1 2026` format
  const match2 = /\*\*Quarter\*\*:\s*Q(\d)\s+(\d{4})/i.exec(content);
  if (match2) {
    return `${match2[2]}-Q${match2[1]}`;
  }

  // Fallback: current quarter
  const now = new Date();
  const year = now.getFullYear();
  const quarterNum = Math.ceil((now.getMonth() + 1) / 3);
  return `${year}-Q${quarterNum}`;
}

/**
 * Generate a slug from a title.
 * Lowercase, spaces→hyphens, remove special chars, truncate to 50 chars.
 */
function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

/**
 * Parse goals from legacy Format A: `## Goal N: Title`
 */
function parseFormatA(content: string, quarter: string, goalsDir: string): Goal[] {
  const goals: Goal[] = [];
  const quarterNum = quarter.match(/Q(\d)/)?.[1] ?? '1';

  let match: RegExpExecArray | null;
  const regex = new RegExp(FORMAT_A_REGEX.source, 'gm');

  while ((match = regex.exec(content)) !== null) {
    const goalNum = match[1] ?? '';
    const title = (match[2] ?? '').trim();
    const id = `Q${quarterNum}-${goalNum}`;

    // Extract body until next goal or end
    const startIdx = match.index + match[0].length;
    const restContent = content.slice(startIdx);
    const nextGoal = /^##\s+Goal\s+\d+:/m.exec(restContent);
    const endIdx = nextGoal ? startIdx + nextGoal.index : content.length;
    const body = content.slice(startIdx, endIdx).trim();

    // Parse Strategic Pillar
    const pillarMatch = /\*\*Strategic Pillar\*\*:\s*(.+)$/im.exec(body);
    const orgAlignment = pillarMatch ? (pillarMatch[1] ?? '').trim() : '';

    // Extract key outcomes
    const keyOutcomesMatch = /###\s+Key Outcomes\s*\n([\s\S]*?)(?=\n###|\n##|$)/i.exec(body);
    let successCriteria = '';
    if (keyOutcomesMatch) {
      const outcomeLines = (keyOutcomesMatch[1] ?? '')
        .split('\n')
        .filter(line => /^[-*]\s+\[.\]/.test(line.trim()))
        .map(line => line.replace(/^[-*]\s+\[.\]\s*/, '').trim())
        .filter(Boolean);
      successCriteria = outcomeLines.join('; ');
    }

    const slug = slugifyTitle(title);
    const filePath = join(goalsDir, 'quarter.md');

    goals.push({
      id,
      slug,
      title,
      status: 'active',
      quarter,
      type: 'outcome',
      orgAlignment,
      successCriteria,
      filePath,
      body: body || undefined,
    });
  }

  return goals;
}

/**
 * Parse goals from legacy Format B: `### Qn-N Title`
 */
function parseFormatB(content: string, goalsDir: string): Goal[] {
  const goals: Goal[] = [];

  let match: RegExpExecArray | null;
  const regex = new RegExp(FORMAT_B_REGEX.source, 'gm');

  while ((match = regex.exec(content)) !== null) {
    const quarterNum = match[1] ?? '1';
    const goalNum = match[2] ?? '';
    const title = (match[3] ?? '').trim();
    const id = `Q${quarterNum}-${goalNum}`;
    const quarter = extractQuarter(content);

    // Extract body until next ### or ## or end
    const startIdx = match.index + match[0].length;
    const restContent = content.slice(startIdx);
    const nextSection = /^##/m.exec(restContent);
    const endIdx = nextSection ? startIdx + nextSection.index : content.length;
    const body = content.slice(startIdx, endIdx).trim();

    // Parse Success criteria
    const scMatch = /\*\*Success criteria\*\*:\s*(.+)$/im.exec(body);
    const successCriteria = scMatch ? (scMatch[1] ?? '').trim() : '';

    // Parse Org alignment
    const orgMatch = /\*\*Org alignment\*\*:\s*(.+)$/im.exec(body);
    const orgAlignment = orgMatch ? (orgMatch[1] ?? '').trim() : '';

    const slug = slugifyTitle(title);
    const filePath = join(goalsDir, 'quarter.md');

    goals.push({
      id,
      slug,
      title,
      status: 'active',
      quarter,
      type: 'outcome',
      orgAlignment,
      successCriteria,
      filePath,
      body: body || undefined,
    });
  }

  return goals;
}

/**
 * Parse goals from legacy quarter.md file.
 * Tries Format A first, then Format B.
 */
async function parseLegacyQuarterFile(
  goalsDir: string,
  storage: StorageAdapter
): Promise<Goal[]> {
  const quarterPath = join(goalsDir, 'quarter.md');
  const exists = await storage.exists(quarterPath);
  if (!exists) return [];

  const content = await storage.read(quarterPath);
  if (!content) return [];

  const quarter = extractQuarter(content);

  // Try Format A first
  let goals = parseFormatA(content, quarter, goalsDir);
  if (goals.length > 0) return goals;

  // Try Format B
  goals = parseFormatB(content, goalsDir);
  return goals;
}

/**
 * Parse individual goal files from the goals directory.
 * Excludes strategy.md and other non-goal files.
 */
async function parseIndividualGoals(
  goalsDir: string,
  storage: StorageAdapter
): Promise<Goal[]> {
  const exists = await storage.exists(goalsDir);
  if (!exists) return [];

  const files = await storage.list(goalsDir, { extensions: ['.md'] });
  const goals: Goal[] = [];

  for (const filePath of files) {
    const filename = basename(filePath);

    // Skip non-goal files
    if (
      filename === 'strategy.md' ||
      filename === 'quarter.md' ||
      filename === 'index.md' ||
      filename.startsWith('.') ||
      filename.endsWith('.backup')
    ) {
      continue;
    }

    const content = await storage.read(filePath);
    if (!content) continue;

    const goal = parseGoalFile(content, filePath);
    if (goal) {
      goals.push(goal);
    }
  }

  return goals;
}

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
export async function parseGoals(
  goalsDir: string,
  storage: StorageAdapter
): Promise<Goal[]> {
  // Try individual files first
  const individualGoals = await parseIndividualGoals(goalsDir, storage);
  if (individualGoals.length > 0) {
    return individualGoals;
  }

  // Fall back to legacy format
  return parseLegacyQuarterFile(goalsDir, storage);
}

// Export for testing
export {
  parseIndividualGoals,
  parseLegacyQuarterFile,
  parseGoalFile,
  parseFrontmatter,
  extractQuarter,
};
