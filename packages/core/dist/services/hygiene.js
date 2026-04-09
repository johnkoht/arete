/**
 * HygieneService — scans for workspace entropy and applies approved cleanup actions.
 *
 * Pure-read scan phase detects stale meetings, resolved commitments, old memory
 * entries, bloated activity logs, and duplicate memory items. Apply phase
 * delegates to existing service methods (archive, purge, compact, trim).
 *
 * All I/O via StorageAdapter — no direct fs imports.
 */
import { join, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { jaccardSimilarity, normalizeForJaccard } from '../utils/similarity.js';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_MEETING_OLDER_THAN_DAYS = 90;
const DEFAULT_MEMORY_OLDER_THAN_DAYS = 90;
const DEFAULT_COMMITMENT_OLDER_THAN_DAYS = 30;
const ACTIVITY_LINE_THRESHOLD = 5000;
const ACTIVITY_TRIM_KEEP_LINES = 2500;
const DEDUP_SIMILARITY_THRESHOLD = 0.6;
const STALE_REPORT_MS = 60 * 60 * 1000; // 1 hour
// Processed meeting statuses that indicate the meeting has been processed
const ARCHIVABLE_STATUSES = new Set(['processed', 'approved', 'skipped']);
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Create deterministic 12-char hex ID from a key string. */
function makeId(key) {
    return createHash('sha256').update(key).digest('hex').slice(0, 12);
}
/** Parse YAML frontmatter from markdown content. Returns null if no frontmatter. */
function parseFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match)
        return null;
    const fm = {};
    for (const line of match[1].split('\n')) {
        const kv = line.match(/^(\w[\w_-]*):\s*"?([^"\n]*)"?\s*$/);
        if (kv) {
            fm[kv[1]] = kv[2].trim();
        }
    }
    return fm;
}
/** Parse decision entries from decisions.md (## Heading sections). */
function parseDecisionEntries(content) {
    const entries = [];
    const lines = content.split('\n');
    let current = null;
    for (const line of lines) {
        const headingMatch = line.match(/^###?\s+(?:(\d{4}-\d{2}-\d{2}):\s*)?(.+)/);
        if (headingMatch) {
            if (current) {
                entries.push({
                    title: current.title,
                    date: current.date,
                    body: current.bodyLines.join('\n').trim(),
                    raw: current.rawLines.join('\n').trim(),
                });
            }
            current = {
                title: headingMatch[2].trim(),
                date: headingMatch[1] || undefined,
                bodyLines: [],
                rawLines: [line],
            };
        }
        else if (current) {
            current.bodyLines.push(line);
            current.rawLines.push(line);
        }
    }
    if (current) {
        entries.push({
            title: current.title,
            date: current.date,
            body: current.bodyLines.join('\n').trim(),
            raw: current.rawLines.join('\n').trim(),
        });
    }
    return entries;
}
/** Parse learning entries from learnings.md (- YYYY-MM-DD: text bullets). */
function parseLearningEntries(content) {
    const entries = [];
    for (const line of content.split('\n')) {
        const match = line.match(/^-\s+(\d{4}-\d{2}-\d{2}):\s+(.+)/);
        if (match) {
            entries.push({ date: match[1], text: match[2], raw: line });
        }
    }
    return entries;
}
/** Compute age in days from a date string to now. */
function daysAgo(dateStr, now = new Date()) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime()))
        return -1;
    return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}
// ---------------------------------------------------------------------------
// HygieneService
// ---------------------------------------------------------------------------
export class HygieneService {
    storage;
    workspaceRoot;
    commitments;
    areaMemory;
    areaParser;
    memory;
    constructor(storage, workspaceRoot, commitments, areaMemory, areaParser, memory) {
        this.storage = storage;
        this.workspaceRoot = workspaceRoot;
        this.commitments = commitments;
        this.areaMemory = areaMemory;
        this.areaParser = areaParser;
        this.memory = memory;
    }
    // -------------------------------------------------------------------------
    // scan() — pure read, no mutations
    // -------------------------------------------------------------------------
    async scan(options) {
        const tiers = options?.tiers;
        const categories = options?.categories;
        const meetingOlderThanDays = options?.meetingOlderThanDays ?? DEFAULT_MEETING_OLDER_THAN_DAYS;
        const memoryOlderThanDays = options?.memoryOlderThanDays ?? DEFAULT_MEMORY_OLDER_THAN_DAYS;
        const commitmentOlderThanDays = options?.commitmentOlderThanDays ?? DEFAULT_COMMITMENT_OLDER_THAN_DAYS;
        const items = [];
        const now = new Date();
        // Helper: check if a tier+category combo passes the filter
        const shouldScan = (tier, category) => {
            if (tiers && !tiers.includes(tier))
                return false;
            if (categories && !categories.includes(category))
                return false;
            return true;
        };
        // ----- Tier 1: Meetings -----
        if (shouldScan(1, 'meetings')) {
            const meetingsDir = join(this.workspaceRoot, 'resources', 'meetings');
            const meetingsDirExists = await this.storage.exists(meetingsDir);
            if (meetingsDirExists) {
                const files = await this.storage.list(meetingsDir, { extensions: ['.md'] });
                for (const filePath of files) {
                    const content = await this.storage.read(filePath);
                    if (!content)
                        continue;
                    const fm = parseFrontmatter(content);
                    if (!fm)
                        continue;
                    const status = fm.status;
                    if (!status || !ARCHIVABLE_STATUSES.has(status))
                        continue;
                    const dateStr = fm.date;
                    if (!dateStr)
                        continue;
                    const age = daysAgo(dateStr, now);
                    if (age < meetingOlderThanDays)
                        continue;
                    // Build relative path from workspace root
                    const relativePath = filePath.startsWith(this.workspaceRoot)
                        ? filePath.slice(this.workspaceRoot.length + 1)
                        : filePath;
                    items.push({
                        id: makeId(`meetings:${relativePath}`),
                        tier: 1,
                        category: 'meetings',
                        actionType: 'archive',
                        description: `Meeting "${fm.title || basename(filePath)}" is ${age} days old with status "${status}"`,
                        affectedPath: relativePath,
                        suggestedAction: `Archive to resources/meetings/archive/`,
                        metadata: { ageDays: age, status, date: dateStr },
                    });
                }
            }
        }
        // ----- Tier 1: Commitments -----
        if (shouldScan(1, 'commitments')) {
            // Read commitments file directly to find resolved items older than threshold
            const commitmentsPath = join(this.workspaceRoot, '.arete', 'commitments.json');
            const commitmentsContent = await this.storage.read(commitmentsPath);
            if (commitmentsContent) {
                try {
                    const parsed = JSON.parse(commitmentsContent);
                    const commitmentsList = Array.isArray(parsed.commitments) ? parsed.commitments : [];
                    const resolved = commitmentsList.filter(c => (c.status === 'resolved' || c.status === 'dropped') && c.resolvedAt);
                    for (const c of resolved) {
                        const age = daysAgo(c.resolvedAt, now);
                        if (age < commitmentOlderThanDays)
                            continue;
                        items.push({
                            id: makeId(`commitments:${c.id}`),
                            tier: 1,
                            category: 'commitments',
                            actionType: 'purge',
                            description: `Resolved commitment "${c.text.slice(0, 60)}${c.text.length > 60 ? '...' : ''}" resolved ${age} days ago`,
                            affectedPath: '.arete/commitments.json',
                            suggestedAction: `Purge resolved commitments older than ${commitmentOlderThanDays} days`,
                            metadata: { ageDays: age, status: c.status, resolvedAt: c.resolvedAt },
                        });
                    }
                }
                catch {
                    // Malformed JSON — skip
                }
            }
        }
        // ----- Tier 2: Memory compaction -----
        if (shouldScan(2, 'memory')) {
            // Decisions
            const decisionsPath = join(this.workspaceRoot, '.arete', 'memory', 'items', 'decisions.md');
            const decisionsContent = await this.storage.read(decisionsPath);
            if (decisionsContent) {
                const entries = parseDecisionEntries(decisionsContent);
                for (const entry of entries) {
                    if (!entry.date)
                        continue;
                    const age = daysAgo(entry.date, now);
                    if (age < memoryOlderThanDays)
                        continue;
                    items.push({
                        id: makeId(`memory:decisions:${entry.title}`),
                        tier: 2,
                        category: 'memory',
                        actionType: 'compact',
                        description: `Decision "${entry.title}" is ${age} days old`,
                        affectedPath: '.arete/memory/items/decisions.md',
                        suggestedAction: 'Compact old decisions into area summaries',
                        metadata: { ageDays: age, date: entry.date, type: 'decision' },
                    });
                }
            }
            // Learnings
            const learningsPath = join(this.workspaceRoot, '.arete', 'memory', 'items', 'learnings.md');
            const learningsContent = await this.storage.read(learningsPath);
            if (learningsContent) {
                const entries = parseLearningEntries(learningsContent);
                for (const entry of entries) {
                    const age = daysAgo(entry.date, now);
                    if (age < memoryOlderThanDays)
                        continue;
                    items.push({
                        id: makeId(`memory:learnings:${entry.text}`),
                        tier: 2,
                        category: 'memory',
                        actionType: 'compact',
                        description: `Learning from ${entry.date} is ${age} days old`,
                        affectedPath: '.arete/memory/items/learnings.md',
                        suggestedAction: 'Compact old learnings into area summaries',
                        metadata: { ageDays: age, date: entry.date, type: 'learning' },
                    });
                }
            }
        }
        // ----- Tier 2: Activity log -----
        if (shouldScan(2, 'activity')) {
            const activityPath = join(this.workspaceRoot, '.arete', 'activity', 'activity-log.md');
            const activityContent = await this.storage.read(activityPath);
            if (activityContent) {
                const lineCount = activityContent.split('\n').length;
                if (lineCount > ACTIVITY_LINE_THRESHOLD) {
                    items.push({
                        id: makeId('activity:activity-log.md'),
                        tier: 2,
                        category: 'activity',
                        actionType: 'trim',
                        description: `Activity log has ${lineCount} lines (threshold: ${ACTIVITY_LINE_THRESHOLD})`,
                        affectedPath: '.arete/activity/activity-log.md',
                        suggestedAction: `Trim to ${ACTIVITY_TRIM_KEEP_LINES} lines, archive the rest`,
                        metadata: { lineCount, threshold: ACTIVITY_LINE_THRESHOLD },
                    });
                }
            }
        }
        // ----- Tier 3: Memory dedup -----
        if (shouldScan(3, 'memory')) {
            // Collect all memory entries for pairwise comparison
            const allEntries = [];
            // Decisions
            const dedupDecisionsPath = join(this.workspaceRoot, '.arete', 'memory', 'items', 'decisions.md');
            const dedupDecisionsContent = await this.storage.read(dedupDecisionsPath);
            if (dedupDecisionsContent) {
                const entries = parseDecisionEntries(dedupDecisionsContent);
                for (const entry of entries) {
                    allEntries.push({
                        id: entry.title,
                        text: `${entry.title} ${entry.body}`,
                        type: 'decision',
                        path: '.arete/memory/items/decisions.md',
                    });
                }
            }
            // Learnings
            const dedupLearningsPath = join(this.workspaceRoot, '.arete', 'memory', 'items', 'learnings.md');
            const dedupLearningsContent = await this.storage.read(dedupLearningsPath);
            if (dedupLearningsContent) {
                const entries = parseLearningEntries(dedupLearningsContent);
                for (const entry of entries) {
                    allEntries.push({
                        id: entry.text,
                        text: entry.text,
                        type: 'learning',
                        path: '.arete/memory/items/learnings.md',
                    });
                }
            }
            // Pairwise Jaccard comparison
            for (let i = 0; i < allEntries.length; i++) {
                for (let j = i + 1; j < allEntries.length; j++) {
                    const a = allEntries[i];
                    const b = allEntries[j];
                    const tokensA = normalizeForJaccard(a.text);
                    const tokensB = normalizeForJaccard(b.text);
                    const similarity = jaccardSimilarity(tokensA, tokensB);
                    if (similarity > DEDUP_SIMILARITY_THRESHOLD) {
                        items.push({
                            id: makeId(`dedup:${a.id}:${b.id}`),
                            tier: 3,
                            category: 'memory',
                            actionType: 'merge',
                            description: `Potential duplicate: "${a.id.slice(0, 40)}" and "${b.id.slice(0, 40)}" (similarity: ${(similarity * 100).toFixed(0)}%)`,
                            affectedPath: a.path,
                            suggestedAction: 'Review and merge duplicate memory entries',
                            metadata: {
                                similarity,
                                entryA: a.id,
                                entryB: b.id,
                                typeA: a.type,
                                typeB: b.type,
                            },
                        });
                    }
                }
            }
        }
        // Build summary
        const byTier = { 1: 0, 2: 0, 3: 0 };
        const byCategory = {
            meetings: 0,
            memory: 0,
            commitments: 0,
            activity: 0,
        };
        for (const item of items) {
            byTier[item.tier]++;
            byCategory[item.category]++;
        }
        return {
            scannedAt: now.toISOString(),
            items,
            summary: {
                total: items.length,
                byTier,
                byCategory,
            },
        };
    }
    // -------------------------------------------------------------------------
    // apply() — mutates workspace based on approved actions
    // -------------------------------------------------------------------------
    async apply(report, actions) {
        // Validate freshness
        const scannedAt = new Date(report.scannedAt);
        const now = new Date();
        if (now.getTime() - scannedAt.getTime() > STALE_REPORT_MS) {
            throw new Error(`Scan report is stale (scanned at ${report.scannedAt}). Please re-scan before applying.`);
        }
        // Build lookup of report items by ID
        const itemById = new Map(report.items.map(item => [item.id, item]));
        const applied = [];
        const failed = [];
        for (const action of actions) {
            const item = itemById.get(action.id);
            if (!item) {
                failed.push({ id: action.id, error: 'Item not found in scan report' });
                continue;
            }
            try {
                switch (item.actionType) {
                    case 'archive':
                        await this.archiveMeeting(item);
                        break;
                    case 'purge':
                        await this.purgeCommitments(item);
                        break;
                    case 'compact':
                        await this.compactMemory(item);
                        break;
                    case 'trim':
                        await this.trimActivity(item);
                        break;
                    case 'merge':
                        // Merge (dedup) requires human judgment — skip in automated apply
                        // but mark as applied so it doesn't re-appear
                        break;
                    default:
                        throw new Error(`Unknown action type: ${item.actionType}`);
                }
                applied.push(action.id);
            }
            catch (err) {
                failed.push({
                    id: action.id,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
        return { applied, failed };
    }
    // -------------------------------------------------------------------------
    // Private apply helpers
    // -------------------------------------------------------------------------
    async archiveMeeting(item) {
        const absPath = join(this.workspaceRoot, item.affectedPath);
        const content = await this.storage.read(absPath);
        if (!content)
            throw new Error(`File not found: ${item.affectedPath}`);
        // Determine archive directory: resources/meetings/archive/YYYY-MM/
        const dateStr = item.metadata.date || '';
        const dateMatch = dateStr.match(/^(\d{4})-(\d{2})/);
        const yearMonth = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}` : 'unknown';
        const archiveDir = join(this.workspaceRoot, 'resources', 'meetings', 'archive', yearMonth);
        await this.storage.mkdir(archiveDir);
        // Add archived_at to frontmatter
        const archivedAt = new Date().toISOString();
        let newContent;
        const fmMatch = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
        if (fmMatch) {
            newContent = `${fmMatch[1]}${fmMatch[2]}\narchived_at: "${archivedAt}"${fmMatch[3]}${content.slice(fmMatch[0].length)}`;
        }
        else {
            newContent = `---\narchived_at: "${archivedAt}"\n---\n${content}`;
        }
        // Write to archive location
        const fileName = basename(item.affectedPath);
        const archivePath = join(archiveDir, fileName);
        await this.storage.write(archivePath, newContent);
        // Remove original
        await this.storage.delete(absPath);
    }
    async purgeCommitments(item) {
        const olderThanDays = item.metadata.ageDays ?? DEFAULT_COMMITMENT_OLDER_THAN_DAYS;
        // Use the threshold that would catch this item. We pass the configured
        // threshold which is the minimum age that triggered the scan item.
        await this.commitments.purgeResolved(DEFAULT_COMMITMENT_OLDER_THAN_DAYS);
    }
    async compactMemory(item) {
        const memoryType = item.metadata.type;
        // Build workspace paths for the service call
        const workspacePaths = {
            root: this.workspaceRoot,
            manifest: join(this.workspaceRoot, 'arete.yaml'),
            ideConfig: join(this.workspaceRoot, '.cursor'),
            rules: join(this.workspaceRoot, '.cursor', 'rules'),
            agentSkills: join(this.workspaceRoot, '.agents', 'skills'),
            tools: join(this.workspaceRoot, '.cursor', 'tools'),
            integrations: join(this.workspaceRoot, '.cursor', 'integrations'),
            context: join(this.workspaceRoot, 'context'),
            memory: join(this.workspaceRoot, '.arete', 'memory'),
            now: join(this.workspaceRoot, 'now'),
            goals: join(this.workspaceRoot, 'goals'),
            projects: join(this.workspaceRoot, 'projects'),
            resources: join(this.workspaceRoot, 'resources'),
            people: join(this.workspaceRoot, 'people'),
            credentials: join(this.workspaceRoot, '.credentials'),
            templates: join(this.workspaceRoot, 'templates'),
        };
        if (memoryType === 'decision') {
            await this.areaMemory.compactDecisions(workspacePaths);
        }
        else if (memoryType === 'learning') {
            await this.areaMemory.compactLearnings(workspacePaths);
        }
    }
    async trimActivity(item) {
        const absPath = join(this.workspaceRoot, item.affectedPath);
        const content = await this.storage.read(absPath);
        if (!content)
            throw new Error(`File not found: ${item.affectedPath}`);
        const lines = content.split('\n');
        const keepLines = lines.slice(-ACTIVITY_TRIM_KEEP_LINES);
        const archiveLines = lines.slice(0, lines.length - ACTIVITY_TRIM_KEEP_LINES);
        // Archive old lines
        const today = new Date().toISOString().split('T')[0];
        const archivePath = join(this.workspaceRoot, '.arete', 'memory', 'archive', `activity-${today}.md`);
        const archiveDir = dirname(archivePath);
        await this.storage.mkdir(archiveDir);
        await this.storage.write(archivePath, archiveLines.join('\n'));
        // Overwrite original with trimmed content
        await this.storage.write(absPath, keepLines.join('\n'));
    }
}
//# sourceMappingURL=hygiene.js.map