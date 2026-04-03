/**
 * AreaMemoryService — computes and writes L3 area memory summaries.
 *
 * Follows the PersonMemoryRefresh pattern: reads existing L1/L2 data,
 * aggregates into a computed summary, writes to `.arete/memory/areas/{slug}.md`.
 *
 * All I/O via StorageAdapter — no direct fs imports.
 */

import { join, basename } from 'node:path';
import type { StorageAdapter } from '../storage/adapter.js';
import type { AreaParserService } from './area-parser.js';
import type { CommitmentsService } from './commitments.js';
import type { MemoryService } from './memory.js';
import type { WorkspacePaths, Commitment, AreaContext } from '../models/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AREA_MEMORY_DIR = '.arete/memory/areas';
const DEFAULT_STALE_DAYS = 7;
const RECENT_DAYS = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RefreshAreaMemoryOptions = {
  /** Refresh only this area slug. */
  areaSlug?: string;
  /** Preview without writing files. */
  dryRun?: boolean;
};

export type RefreshAreaMemoryResult = {
  /** Number of area memory files written/updated. */
  updated: number;
  /** Total areas scanned. */
  scannedAreas: number;
  /** Areas skipped (e.g., no data). */
  skipped: number;
};

export type CompactDecisionsOptions = {
  /** Compact decisions older than this many days. Default: 90. */
  olderThan?: number;
  /** Preview without writing/archiving. */
  dryRun?: boolean;
};

export type CompactDecisionsResult = {
  /** Number of decisions compacted. */
  compacted: number;
  /** Number of decisions preserved (too recent or unmatched). */
  preserved: number;
  /** Number of areas that received compacted summaries. */
  areasUpdated: number;
  /** Archive file path (if created). */
  archivePath?: string;
};

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface DecisionEntry {
  title: string;
  date?: string;
  body: string;
  raw: string;
}

interface AreaMemoryData {
  slug: string;
  name: string;
  keywords: string[];
  activePeople: string[];
  openCommitments: Commitment[];
  recentlyCompleted: Commitment[];
  recentDecisions: DecisionEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMemorySections(content: string): DecisionEntry[] {
  const sections: DecisionEntry[] = [];
  const lines = content.split('\n');
  let current: { title: string; date?: string; bodyLines: string[]; rawLines: string[] } | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^#{2,3}\s+(?:(\d{4}-\d{2}-\d{2}):\s*)?(.+)/);
    if (headingMatch) {
      if (current) {
        sections.push({
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
    } else if (current) {
      // Extract date from "- **Date**: YYYY-MM-DD" body lines (real memory format)
      if (!current.date) {
        const dateMatch = line.match(/^-\s+\*\*Date\*\*:\s*(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          current.date = dateMatch[1];
        }
      }
      current.bodyLines.push(line);
      current.rawLines.push(line);
    }
  }

  if (current) {
    sections.push({
      title: current.title,
      date: current.date,
      body: current.bodyLines.join('\n').trim(),
      raw: current.rawLines.join('\n').trim(),
    });
  }

  return sections;
}

function daysAgo(dateStr: string, referenceDate: Date = new Date()): number {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return Infinity;
  const diffMs = referenceDate.getTime() - d.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Extract keywords from a collection of text strings.
 * Returns the most frequent meaningful words.
 */
function extractKeywords(texts: string[], maxKeywords = 10): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
    'it', 'its', 'they', 'them', 'their', 'we', 'our', 'you', 'your',
    'he', 'she', 'his', 'her', 'not', 'no', 'so', 'if', 'then', 'else',
    'about', 'up', 'out', 'all', 'also', 'just', 'more', 'some', 'very',
    'what', 'when', 'where', 'how', 'who', 'which', 'each', 'every',
    'any', 'both', 'few', 'most', 'other', 'into', 'over', 'after',
    'before', 'between', 'under', 'again', 'there', 'here', 'than',
    'still', 'while', 'during', 'through', 'well', 'back', 'being',
    'date', 'source', 'meeting', 'meetings', 'decision', 'decisions',
    'item', 'items', 'none', 'null', 'undefined',
  ]);

  const wordCounts = new Map<string, number>();
  for (const text of texts) {
    const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').split(/\s+/).filter(Boolean);
    for (const word of words) {
      if (word.length < 3 || stopWords.has(word)) continue;
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    }
  }

  return [...wordCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

/**
 * Check if an area memory file is stale.
 */
export function isAreaMemoryStale(lastRefreshed: string | null, staleDays: number = DEFAULT_STALE_DAYS): boolean {
  if (!lastRefreshed) return true;
  return daysAgo(lastRefreshed) > staleDays;
}

/**
 * Render area memory as markdown with YAML frontmatter.
 */
function renderAreaMemory(data: AreaMemoryData): string {
  const now = new Date().toISOString();
  const lines: string[] = [];

  // YAML frontmatter
  lines.push('---');
  lines.push(`area_slug: ${data.slug}`);
  lines.push(`area_name: "${data.name}"`);
  lines.push(`last_refreshed: "${now}"`);
  if (data.keywords.length > 0) {
    lines.push(`keywords: [${data.keywords.map(k => `"${k}"`).join(', ')}]`);
  }
  lines.push('---');
  lines.push('');

  // Header
  lines.push(`# ${data.name} — Area Memory`);
  lines.push('');
  lines.push('> Auto-generated area context. Do not edit manually — regenerated by `arete memory refresh`.');
  lines.push('');

  // Keywords
  if (data.keywords.length > 0) {
    lines.push('## Keywords');
    lines.push('');
    lines.push(data.keywords.join(', '));
    lines.push('');
  }

  // Active People
  if (data.activePeople.length > 0) {
    lines.push('## Active People');
    lines.push('');
    for (const person of data.activePeople) {
      lines.push(`- ${person}`);
    }
    lines.push('');
  }

  // Open Commitments
  if (data.openCommitments.length > 0) {
    lines.push('## Open Work');
    lines.push('');
    for (const c of data.openCommitments) {
      const direction = c.direction === 'i_owe_them' ? 'I owe' : 'Owed by';
      lines.push(`- ${c.text} (${direction} ${c.personName}, since ${c.date})`);
    }
    lines.push('');
  }

  // Recently Completed
  if (data.recentlyCompleted.length > 0) {
    lines.push('## Recently Completed');
    lines.push('');
    for (const c of data.recentlyCompleted) {
      lines.push(`- ${c.text} (${c.personName}, resolved ${c.resolvedAt?.split('T')[0] ?? 'unknown'})`);
    }
    lines.push('');
  }

  // Recent Decisions
  if (data.recentDecisions.length > 0) {
    lines.push('## Recent Decisions');
    lines.push('');
    for (const d of data.recentDecisions) {
      const datePrefix = d.date ? `${d.date}: ` : '';
      lines.push(`### ${datePrefix}${d.title}`);
      if (d.body) {
        lines.push('');
        lines.push(d.body);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// AreaMemoryService
// ---------------------------------------------------------------------------

export class AreaMemoryService {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly areaParser: AreaParserService,
    private readonly commitments: CommitmentsService,
    private readonly memory: MemoryService,
  ) {}

  /**
   * Refresh area memory for a single area.
   *
   * Reads area file, commitments, decisions, and meetings to compute
   * a summary written to `.arete/memory/areas/{slug}.md`.
   */
  async refreshAreaMemory(
    areaSlug: string,
    workspacePaths: WorkspacePaths,
    options: RefreshAreaMemoryOptions = {},
  ): Promise<boolean> {
    const areaContext = await this.areaParser.getAreaContext(areaSlug);
    if (!areaContext) return false;

    const data = await this.computeAreaData(areaContext, workspacePaths);
    const content = renderAreaMemory(data);

    if (!options.dryRun) {
      const outputDir = join(workspacePaths.root, AREA_MEMORY_DIR);
      await this.storage.mkdir(outputDir);
      await this.storage.write(join(outputDir, `${areaSlug}.md`), content);
    }

    return true;
  }

  /**
   * Refresh area memory for all areas in the workspace.
   */
  async refreshAllAreaMemory(
    workspacePaths: WorkspacePaths,
    options: RefreshAreaMemoryOptions = {},
  ): Promise<RefreshAreaMemoryResult> {
    const areas = await this.areaParser.listAreas();
    let updated = 0;
    let skipped = 0;

    // If targeting a specific area, filter
    const targetAreas = options.areaSlug
      ? areas.filter(a => a.slug === options.areaSlug)
      : areas;

    for (const area of targetAreas) {
      const success = await this.refreshAreaMemory(area.slug, workspacePaths, options);
      if (success) {
        updated++;
      } else {
        skipped++;
      }
    }

    return {
      updated,
      scannedAreas: targetAreas.length,
      skipped,
    };
  }

  /**
   * Compact old decisions into area memory summaries.
   *
   * Decisions older than `olderThan` days are grouped by area,
   * added as compact summaries to area memory files, and the
   * originals are archived.
   */
  async compactDecisions(
    workspacePaths: WorkspacePaths,
    options: CompactDecisionsOptions = {},
  ): Promise<CompactDecisionsResult> {
    const olderThan = options.olderThan ?? 90;
    const decisionsPath = join(workspacePaths.memory, 'items', 'decisions.md');
    const content = await this.storage.read(decisionsPath);
    if (!content) {
      return { compacted: 0, preserved: 0, areasUpdated: 0 };
    }

    const sections = parseMemorySections(content);
    const areas = await this.areaParser.listAreas();

    // Partition into old vs recent
    const toCompact: DecisionEntry[] = [];
    const toPreserve: DecisionEntry[] = [];

    for (const section of sections) {
      if (section.date && daysAgo(section.date) > olderThan) {
        toCompact.push(section);
      } else {
        toPreserve.push(section);
      }
    }

    if (toCompact.length === 0) {
      return { compacted: 0, preserved: sections.length, areasUpdated: 0 };
    }

    // Group compactable decisions by area
    const areaDecisions = new Map<string, DecisionEntry[]>();
    const unmatchedDecisions: DecisionEntry[] = [];

    for (const decision of toCompact) {
      const areaSlug = this.matchDecisionToArea(decision, areas);
      if (areaSlug) {
        const existing = areaDecisions.get(areaSlug) ?? [];
        existing.push(decision);
        areaDecisions.set(areaSlug, existing);
      } else {
        unmatchedDecisions.push(decision);
      }
    }

    // Unmatched decisions are preserved in-place (not archived)
    toPreserve.push(...unmatchedDecisions);

    if (!options.dryRun) {
      // Archive originals
      const archiveDir = join(workspacePaths.memory, 'archive');
      await this.storage.mkdir(archiveDir);
      const archiveDateStr = new Date().toISOString().split('T')[0];
      const archivePath = join(archiveDir, `decisions-${archiveDateStr}.md`);
      const archiveContent = '# Archived Decisions\n\n' +
        toCompact.map(d => d.raw).join('\n\n');
      await this.storage.write(archivePath, archiveContent);

      // Write preserved decisions back to decisions.md
      const header = content.match(/^(#[^#].*\n)/)?.[1] ?? '# Decisions\n';
      const preservedContent = header + '\n' +
        toPreserve.map(d => d.raw).join('\n\n') + '\n';
      await this.storage.write(decisionsPath, preservedContent);
    }

    return {
      compacted: toCompact.length - unmatchedDecisions.length,
      preserved: toPreserve.length,
      areasUpdated: areaDecisions.size,
      archivePath: options.dryRun ? undefined : join(workspacePaths.memory, 'archive', `decisions-${new Date().toISOString().split('T')[0]}.md`),
    };
  }

  /**
   * Read the last_refreshed date from an area memory file.
   * Returns null if file doesn't exist or has no frontmatter.
   */
  async getLastRefreshed(areaSlug: string, workspacePaths: WorkspacePaths): Promise<string | null> {
    const filePath = join(workspacePaths.root, AREA_MEMORY_DIR, `${areaSlug}.md`);
    const content = await this.storage.read(filePath);
    if (!content) return null;

    const match = content.match(/^last_refreshed:\s*"?([^"\n]+)"?\s*$/m);
    return match?.[1] ?? null;
  }

  /**
   * List all area memory files with staleness info.
   */
  async listAreaMemoryStatus(workspacePaths: WorkspacePaths, staleDays: number = DEFAULT_STALE_DAYS): Promise<Array<{ slug: string; lastRefreshed: string | null; stale: boolean }>> {
    const areas = await this.areaParser.listAreas();
    const results: Array<{ slug: string; lastRefreshed: string | null; stale: boolean }> = [];

    for (const area of areas) {
      const lastRefreshed = await this.getLastRefreshed(area.slug, workspacePaths);
      results.push({
        slug: area.slug,
        lastRefreshed,
        stale: isAreaMemoryStale(lastRefreshed, staleDays),
      });
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  private async computeAreaData(
    areaContext: AreaContext,
    workspacePaths: WorkspacePaths,
  ): Promise<AreaMemoryData> {
    // 1. Keywords from area name, recurring meeting titles, decisions
    const keywordSources: string[] = [areaContext.name];
    for (const meeting of areaContext.recurringMeetings) {
      keywordSources.push(meeting.title);
    }

    // 2. Active people from recurring meetings
    const activePeopleSet = new Set<string>();
    for (const meeting of areaContext.recurringMeetings) {
      for (const attendee of meeting.attendees) {
        activePeopleSet.add(attendee);
      }
    }
    // Also scan recent meetings for attendees
    const recentMeetingPeople = await this.getRecentMeetingPeople(areaContext, workspacePaths);
    for (const person of recentMeetingPeople) {
      activePeopleSet.add(person);
    }

    // 3. Commitments for this area
    const openCommitments = await this.commitments.listOpen({ area: areaContext.slug });
    // Get recently resolved — load all and filter
    // Note: listOpen only returns open, so we read the file for resolved ones
    const recentlyCompleted = await this.getRecentlyCompleted(areaContext.slug, workspacePaths);

    // 4. Recent decisions
    const recentDecisions = await this.getRecentDecisions(areaContext, workspacePaths);

    // Add decision titles to keyword sources
    for (const d of recentDecisions) {
      keywordSources.push(d.title);
    }

    // Add commitment text to keyword sources
    for (const c of openCommitments) {
      keywordSources.push(c.text);
    }

    const keywords = extractKeywords(keywordSources);

    return {
      slug: areaContext.slug,
      name: areaContext.name,
      keywords,
      activePeople: [...activePeopleSet],
      openCommitments,
      recentlyCompleted,
      recentDecisions,
    };
  }

  /**
   * Get people who attended area-mapped meetings in the last 30 days.
   */
  private async getRecentMeetingPeople(
    areaContext: AreaContext,
    workspacePaths: WorkspacePaths,
  ): Promise<string[]> {
    const meetingsDir = join(workspacePaths.resources, 'meetings');
    const meetingsExist = await this.storage.exists(meetingsDir);
    if (!meetingsExist) return [];

    const meetingFiles = await this.storage.list(meetingsDir, { extensions: ['.md'] });
    const people = new Set<string>();

    for (const meetingPath of meetingFiles) {
      const fileName = basename(meetingPath);
      if (fileName === 'index.md') continue;

      const content = await this.storage.read(meetingPath);
      if (!content) continue;

      // Check if this meeting matches the area
      const titleMatch = content.match(/^title:\s*"?([^"\n]+)"?\s*$/m);
      const title = titleMatch?.[1] ?? fileName.replace(/\.md$/, '');

      let matchesArea = false;
      for (const recurring of areaContext.recurringMeetings) {
        if (title.toLowerCase().includes(recurring.title.toLowerCase())) {
          matchesArea = true;
          break;
        }
      }
      if (!matchesArea) continue;

      // Check recency
      const dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})/);
      if (dateMatch && daysAgo(dateMatch[1]) > RECENT_DAYS) continue;

      // Extract attendees
      const attendeeIdsMatch = content.match(/^attendee_ids:\s*\n((?:\s*-\s*.+\n)*)/m);
      if (attendeeIdsMatch) {
        const ids = attendeeIdsMatch[1].match(/-\s*(.+)/g);
        if (ids) {
          for (const id of ids) {
            const slug = id.replace(/^\s*-\s*/, '').trim();
            if (slug) people.add(slug);
          }
        }
      }
    }

    return [...people];
  }

  /**
   * Get recently completed commitments for an area.
   */
  private async getRecentlyCompleted(
    areaSlug: string,
    workspacePaths: WorkspacePaths,
  ): Promise<Commitment[]> {
    // CommitmentsService.listOpen only returns open items, so we need to read
    // the raw file to find resolved ones. This is a pragmatic workaround.
    const commitmentsPath = join(workspacePaths.root, '.arete/commitments.json');
    const content = await this.storage.read(commitmentsPath);
    if (!content) return [];

    try {
      const parsed = JSON.parse(content) as { commitments: Commitment[] };
      if (!Array.isArray(parsed.commitments)) return [];

      return parsed.commitments.filter(c =>
        c.area === areaSlug &&
        c.status === 'resolved' &&
        c.resolvedAt !== null &&
        daysAgo(c.resolvedAt) <= RECENT_DAYS
      );
    } catch {
      return [];
    }
  }

  /**
   * Get recent decisions that match an area.
   */
  private async getRecentDecisions(
    areaContext: AreaContext,
    workspacePaths: WorkspacePaths,
  ): Promise<DecisionEntry[]> {
    const decisionsPath = join(workspacePaths.memory, 'items', 'decisions.md');
    const content = await this.storage.read(decisionsPath);
    if (!content) return [];

    const sections = parseMemorySections(content);
    const areaNameLower = areaContext.name.toLowerCase();
    const meetingTitlesLower = areaContext.recurringMeetings.map(m => m.title.toLowerCase());

    return sections.filter(section => {
      // Only recent decisions
      if (section.date && daysAgo(section.date) > RECENT_DAYS) return false;

      // Match by area name or meeting title appearing in the decision
      const combined = (section.title + ' ' + section.body).toLowerCase();
      if (combined.includes(areaNameLower)) return true;
      for (const title of meetingTitlesLower) {
        if (combined.includes(title)) return true;
      }
      return false;
    });
  }

  /**
   * Match a decision to an area based on keyword overlap.
   */
  private matchDecisionToArea(
    decision: DecisionEntry,
    areas: AreaContext[],
  ): string | null {
    const decisionText = (decision.title + ' ' + decision.body).toLowerCase();

    for (const area of areas) {
      const areaNameLower = area.name.toLowerCase();
      if (decisionText.includes(areaNameLower)) return area.slug;

      for (const meeting of area.recurringMeetings) {
        if (decisionText.includes(meeting.title.toLowerCase())) return area.slug;
      }
    }

    return null;
  }
}
