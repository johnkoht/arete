/**
 * GoalMigrationService — migrates legacy goals/quarter.md to individual goal files.
 *
 * Detects two legacy formats:
 * - Format A: `## Goal N: Title`
 * - Format B: `### Qn-N Title`
 *
 * Creates individual files: `goals/YYYY-Qn-N-title-slug.md` with frontmatter.
 */
import { join, basename } from 'path';
// Format A: `## Goal N: Title`
const FORMAT_A_REGEX = /^##\s+Goal\s+(\d+):\s*(.+)$/gm;
// Format B: `### Qn-N Title`
const FORMAT_B_REGEX = /^###\s+Q(\d+)-(\d+)\s+(.+)$/gm;
/**
 * Generate a slug from a title.
 * Lowercase, spaces→hyphens, remove special chars, truncate to 50 chars.
 */
export function slugifyTitle(title) {
    return title
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);
}
/**
 * Extract quarter from content.
 * Looks for `**Quarter**: YYYY-Qn` or `**Quarter**: Qn YYYY`
 * Fallback: current quarter.
 */
export function extractQuarter(content) {
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
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    return `${year}-Q${quarter}`;
}
/**
 * Parse goals from Format A: `## Goal N: Title`
 */
function parseFormatA(content, quarter) {
    const goals = [];
    const quarterNum = quarter.match(/Q(\d)/)?.[1] ?? '1';
    let match;
    const regex = new RegExp(FORMAT_A_REGEX.source, 'gm');
    while ((match = regex.exec(content)) !== null) {
        const goalNum = match[1] ?? '';
        const title = (match[2] ?? '').trim();
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
        goals.push({
            id: `Q${quarterNum}-${goalNum}`,
            title,
            body,
            successCriteria,
            orgAlignment,
        });
    }
    return goals;
}
/**
 * Parse goals from Format B: `### Qn-N Title`
 */
function parseFormatB(content) {
    const goals = [];
    let match;
    const regex = new RegExp(FORMAT_B_REGEX.source, 'gm');
    while ((match = regex.exec(content)) !== null) {
        const quarterNum = match[1] ?? '1';
        const goalNum = match[2] ?? '';
        const title = (match[3] ?? '').trim();
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
        goals.push({
            id: `Q${quarterNum}-${goalNum}`,
            title,
            body,
            successCriteria,
            orgAlignment,
        });
    }
    return goals;
}
/**
 * Generate frontmatter for a goal file.
 */
function generateFrontmatter(goal, quarter) {
    const lines = [
        '---',
        `id: "${goal.id}"`,
        `title: "${goal.title.replace(/"/g, '\\"')}"`,
        'status: active',
        `quarter: "${quarter}"`,
        'type: outcome',
    ];
    if (goal.orgAlignment) {
        lines.push(`orgAlignment: "${goal.orgAlignment.replace(/"/g, '\\"')}"`);
    }
    if (goal.successCriteria) {
        lines.push(`successCriteria: "${goal.successCriteria.replace(/"/g, '\\"')}"`);
    }
    lines.push('---');
    return lines.join('\n');
}
/**
 * Check if migration should be skipped (idempotency check).
 * Returns true if any .md file in goals/ (excluding strategy.md, quarter.md, .backup)
 * matches pattern *-Q*-*.md
 */
async function shouldSkipMigration(storage, goalsDir) {
    const exists = await storage.exists(goalsDir);
    if (!exists) {
        return { skip: false };
    }
    const files = await storage.list(goalsDir, { extensions: ['.md'] });
    const goalFilePattern = /-Q\d+-\d+-/;
    for (const file of files) {
        const filename = basename(file);
        // Skip known non-goal files
        if (filename === 'strategy.md' ||
            filename === 'quarter.md' ||
            filename.endsWith('.backup') ||
            filename.startsWith('.')) {
            continue;
        }
        if (goalFilePattern.test(filename)) {
            return {
                skip: true,
                reason: `Goal file already exists: ${filename}`,
            };
        }
    }
    return { skip: false };
}
export class GoalMigrationService {
    storage;
    constructor(storage) {
        this.storage = storage;
    }
    /**
     * Migrate goals/quarter.md to individual goal files.
     */
    async migrate(workspaceRoot) {
        const goalsDir = join(workspaceRoot, 'goals');
        const quarterPath = join(goalsDir, 'quarter.md');
        const backupPath = join(goalsDir, '.quarter.md.backup');
        // Check if quarter.md exists
        const quarterExists = await this.storage.exists(quarterPath);
        if (!quarterExists) {
            return {
                migrated: false,
                goalsCount: 0,
                backupPath: null,
                skipped: true,
                skipReason: 'No goals/quarter.md found',
            };
        }
        // Idempotency check
        const skipCheck = await shouldSkipMigration(this.storage, goalsDir);
        if (skipCheck.skip) {
            return {
                migrated: false,
                goalsCount: 0,
                backupPath: null,
                skipped: true,
                skipReason: skipCheck.reason,
            };
        }
        // Read quarter.md content
        const content = await this.storage.read(quarterPath);
        if (!content) {
            return {
                migrated: false,
                goalsCount: 0,
                backupPath: null,
                error: 'Could not read goals/quarter.md',
            };
        }
        // Extract quarter
        const quarter = extractQuarter(content);
        // Try Format A first, then Format B
        let goals = parseFormatA(content, quarter);
        if (goals.length === 0) {
            goals = parseFormatB(content);
        }
        if (goals.length === 0) {
            return {
                migrated: false,
                goalsCount: 0,
                backupPath: null,
                skipped: true,
                skipReason: 'No goals found in quarter.md (unrecognized format)',
            };
        }
        // Create individual goal files
        for (const goal of goals) {
            const slug = slugifyTitle(goal.title);
            const filename = `${quarter}-${goal.id.split('-')[1]}-${slug}.md`;
            const filepath = join(goalsDir, filename);
            const frontmatter = generateFrontmatter(goal, quarter);
            const fileContent = `${frontmatter}\n\n${goal.body}`;
            await this.storage.write(filepath, fileContent);
        }
        // Rename quarter.md to backup (write to backup, then delete original)
        await this.storage.write(backupPath, content);
        await this.storage.delete(quarterPath);
        return {
            migrated: true,
            goalsCount: goals.length,
            backupPath: '.quarter.md.backup',
        };
    }
}
//# sourceMappingURL=goal-migration.js.map