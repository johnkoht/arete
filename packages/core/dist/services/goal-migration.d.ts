/**
 * GoalMigrationService — migrates legacy goals/quarter.md to individual goal files.
 *
 * Detects two legacy formats:
 * - Format A: `## Goal N: Title`
 * - Format B: `### Qn-N Title`
 *
 * Creates individual files: `goals/YYYY-Qn-N-title-slug.md` with frontmatter.
 */
import type { StorageAdapter } from '../storage/adapter.js';
/**
 * Parsed goal from legacy format.
 */
export interface ParsedGoal {
    id: string;
    title: string;
    body: string;
    successCriteria: string;
    orgAlignment: string;
}
/**
 * Result of the migration process.
 */
export interface GoalMigrationResult {
    migrated: boolean;
    goalsCount: number;
    backupPath: string | null;
    error?: string;
    skipped?: boolean;
    skipReason?: string;
}
/**
 * Generate a slug from a title.
 * Lowercase, spaces→hyphens, remove special chars, truncate to 50 chars.
 */
export declare function slugifyTitle(title: string): string;
/**
 * Extract quarter from content.
 * Looks for `**Quarter**: YYYY-Qn` or `**Quarter**: Qn YYYY`
 * Fallback: current quarter.
 */
export declare function extractQuarter(content: string): string;
export declare class GoalMigrationService {
    private storage;
    constructor(storage: StorageAdapter);
    /**
     * Migrate goals/quarter.md to individual goal files.
     */
    migrate(workspaceRoot: string): Promise<GoalMigrationResult>;
}
//# sourceMappingURL=goal-migration.d.ts.map