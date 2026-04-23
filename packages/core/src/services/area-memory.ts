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
import type { TopicMemoryService } from './topic-memory.js';
import type { WorkspacePaths, Commitment, AreaContext } from '../models/index.js';
import { parseMeetingFile } from './meeting-context.js';
import { getTopicHeadline, type TopicPage, type TopicStatus } from '../models/topic-page.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AREA_MEMORY_DIR = '.arete/memory/areas';
const DEFAULT_STALE_DAYS = 7;
const RECENT_DAYS = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Function that calls the LLM with a prompt and returns the response text. */
export type LLMCallFn = (prompt: string) => Promise<string>;

export type RefreshAreaMemoryOptions = {
  /** Refresh only this area slug. */
  areaSlug?: string;
  /** Preview without writing files. */
  dryRun?: boolean;
  /** Optional LLM function for cross-area synthesis. */
  callLLM?: LLMCallFn;
};

export type SynthesisResult = {
  updated: boolean;
  areasAnalyzed?: string[];
  skipped?: boolean;
  reason?: string;
};

export type RefreshAreaMemoryResult = {
  /** Number of area memory files written/updated. */
  updated: number;
  /** Total areas scanned. */
  scannedAreas: number;
  /** Areas skipped (e.g., no data). */
  skipped: number;
  /** Cross-area synthesis result. */
  synthesis?: SynthesisResult;
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

export type CompactLearningsOptions = {
  /** Compact learnings older than this many days. Default: 90. */
  olderThanDays?: number;
};

export type CompactResult = {
  /** Number of entries archived. */
  archived: number;
  /** Number of entries kept in the active file. */
  kept: number;
  /** Path to the archive file, or null if nothing was archived. */
  archivePath: string | null;
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

interface LearningEntry {
  date?: string;
  raw: string;
}

interface TopicEntry {
  slug: string;
  name: string;
  meetingCount: number;
  openItems: number;
  lastReferenced: string;
  /** Status from the topic page (if one exists). Undefined = no page yet. */
  pageStatus?: TopicStatus;
  /** Headline from the topic page's Current state section. Undefined when no page. */
  pageHeadline?: string;
  /** Last refresh date from the topic page frontmatter. */
  pageLastRefreshed?: string;
}

interface AreaMemoryData {
  slug: string;
  name: string;
  activePeople: string[];
  openCommitments: Commitment[];
  recentDecisions: DecisionEntry[];
  topics: TopicEntry[];
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

/**
 * Parse learnings from a bullet-list formatted file.
 *
 * Handles the bullet format: `- YYYY-MM-DD: Some learning text (from: source)`
 * Also handles the heading-based format (## Title / - **Date**: YYYY-MM-DD) that
 * `appendToMemoryFile()` writes, since both formats exist in real workspaces.
 *
 * Lines/blocks without a parseable date are preserved (conservative — never drop data).
 */
function parseLearningsBullets(content: string): LearningEntry[] {
  const entries: LearningEntry[] = [];
  const lines = content.split('\n');

  // --- Pass 1: Detect heading-based entries (### YYYY-MM-DD: ... or ## Title + **Date** line) ---
  // These are multi-line blocks; we parse them first, then handle remaining bullet lines.
  const headingEntries = parseMemorySections(content);
  if (headingEntries.length > 0) {
    for (const entry of headingEntries) {
      entries.push({ date: entry.date, raw: entry.raw });
    }
    return entries;
  }

  // --- Pass 2: Pure bullet-list format ---
  // Skip header lines (# title, description text, ---)
  for (const line of lines) {
    const trimmed = line.trim();

    // Skip blank, horizontal rules, and top-level headings
    if (trimmed === '' || trimmed === '---' || /^#\s/.test(trimmed)) continue;
    // Skip non-bullet description lines (e.g., "Insights and learnings from work.")
    if (!trimmed.startsWith('- ')) continue;

    const bulletMatch = trimmed.match(/^- (\d{4}-\d{2}-\d{2}): (.+)$/);
    if (bulletMatch) {
      entries.push({ date: bulletMatch[1], raw: trimmed });
    } else {
      // Bullet line without a parseable date — preserve it (no date → kept)
      entries.push({ date: undefined, raw: trimmed });
    }
  }

  return entries;
}

/**
 * Convert a slug to a title-cased display name.
 * 'email-templates' → 'Email Templates'
 */
function slugToName(slug: string): string {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function daysAgo(dateStr: string, referenceDate: Date = new Date()): number {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return Infinity;
  const diffMs = referenceDate.getTime() - d.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * @deprecated No longer used after Step 4 (topic-wiki-memory) removed the
 * Keywords section from area memory output. Kept for now to avoid churning
 * internal callers during the refactor; flag for deletion once verified
 * unused elsewhere in the repo.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
 *
 * Shape (Step 4 of topic-wiki-memory):
 *  - Frontmatter: area_slug, area_name, last_refreshed, topics[] (structured)
 *  - Sections: Topics (wikilinks + status), Active People, Open Work, Recent Decisions
 *  - Removed vs prior: Keywords section (word salad), Recently Completed
 *    section (absorbed into topic-page narratives), Keywords frontmatter field
 *
 * The area file becomes a **navigation index + operational snapshot** rather
 * than an attempted knowledge rollup. Encyclopedic content lives in topic pages.
 *
 * @param referenceDate used only for `last_refreshed` — inject in tests to
 *   pin output for idempotency assertions.
 */
function renderAreaMemory(
  data: AreaMemoryData,
  referenceDate: Date = new Date(),
): string {
  const now = referenceDate.toISOString();
  const lines: string[] = [];

  // YAML frontmatter — topics kept as structured list for tooling; keywords removed.
  lines.push('---');
  lines.push(`area_slug: ${data.slug}`);
  lines.push(`area_name: "${data.name}"`);
  lines.push(`last_refreshed: "${now}"`);
  if (data.topics.length > 0) {
    lines.push('topics:');
    for (const t of data.topics) {
      lines.push(`  - slug: ${t.slug}`);
      lines.push(`    name: ${t.name}`);
      lines.push(`    meeting_count: ${t.meetingCount}`);
      lines.push(`    open_items: ${t.openItems}`);
      lines.push(`    last_referenced: "${t.lastReferenced}"`);
      if (t.pageStatus !== undefined) {
        lines.push(`    page_status: ${t.pageStatus}`);
      }
    }
  }
  lines.push('---');
  lines.push('');

  // Header
  lines.push(`# ${data.name} — Area Memory`);
  lines.push('');
  lines.push('> Auto-generated area context. Do not edit manually — regenerated by `arete memory refresh`.');
  lines.push('');

  // Topics — wikilinks to topic pages with status + one-line summary.
  // Sort by (openItems desc, lastReferenced desc, slug asc) for idempotency.
  if (data.topics.length > 0) {
    lines.push('## Topics');
    lines.push('');
    const sortedTopics = [...data.topics].sort((a, b) => {
      if (a.openItems !== b.openItems) return b.openItems - a.openItems;
      if (a.lastReferenced !== b.lastReferenced) return a.lastReferenced < b.lastReferenced ? 1 : -1;
      if (a.slug < b.slug) return -1;
      if (a.slug > b.slug) return 1;
      return 0;
    });
    for (const t of sortedTopics) {
      const statusPart = t.pageStatus !== undefined ? ` — ${t.pageStatus}` : '';
      const summaryPart = t.pageHeadline !== undefined && t.pageHeadline.length > 0
        ? ` — ${t.pageHeadline}`
        : t.pageStatus === undefined ? ' — *(no page yet)*' : '';
      const datePart = t.pageLastRefreshed !== undefined
        ? ` _(updated: ${t.pageLastRefreshed})_`
        : ` _(last mentioned: ${t.lastReferenced})_`;
      lines.push(`- [[${t.slug}]]${statusPart}${summaryPart}${datePart}`);
    }
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

  // Open Commitments — the area's operational inbox view.
  if (data.openCommitments.length > 0) {
    lines.push('## Open Work');
    lines.push('');
    for (const c of data.openCommitments) {
      const direction = c.direction === 'i_owe_them' ? 'I owe' : 'Owed by';
      lines.push(`- ${c.text} (${direction} ${c.personName}, since ${c.date})`);
    }
    lines.push('');
  }

  // Recent Decisions — pointers to atomic L2 items in .arete/memory/items/decisions.md
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

/**
 * Build the LLM prompt for cross-area synthesis.
 * Exported for testing.
 */
export function buildSynthesisPrompt(
  areaContents: Array<{ slug: string; content: string }>,
): string {
  const areaNames = areaContents.map(a => a.slug).join(', ');
  const areaSections = areaContents
    .map(a => `--- Area: ${a.slug} ---\n${a.content}\n--- End: ${a.slug} ---`)
    .join('\n\n');

  return `You are analyzing area memory summaries for a product builder's workspace. Each area represents a domain of responsibility (e.g., engineering, product, sales).

Review all area summaries below and identify meaningful cross-area connections. Be specific and evidence-based — cite actual commitments, decisions, and people. If there are no meaningful connections, say so honestly.

Areas: ${areaNames}

${areaSections}

Identify:

1. **Cross-area connections** — Decisions, commitments, or people that bridge areas. For each: what the connection is, why it matters, and which areas it touches.

2. **Dependencies & blockers** — Open work in one area that depends on or is blocked by work in another area.

3. **Convergence signals** — Areas trending toward the same topic or problem from different angles.

4. **Attention items** — Things that look like they need coordination across areas but may not be getting it.

Format your response as markdown with ## section headers (Connections, Dependencies, Convergence, Attention). Use bullet points with **bold area names** for each item. Be concise and actionable.`;
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
    /**
     * Optional TopicMemoryService for enriching the Topics section with
     * page status + headline. When undefined, Topics render with meeting
     * aggregates only (no wikilink status) — no crash, just less signal.
     * Factory wiring will pass it; older construction sites remain valid.
     */
    private readonly topicMemory?: TopicMemoryService,
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

    const result: RefreshAreaMemoryResult = {
      updated,
      scannedAreas: targetAreas.length,
      skipped,
    };

    // Run cross-area synthesis only when refreshing all areas and callLLM provided
    if (!options.areaSlug && options.callLLM) {
      try {
        const synthesisResult = await this.synthesizeCrossArea(workspacePaths, { callLLM: options.callLLM });
        if (synthesisResult && !options.dryRun) {
          await this.writeSynthesisFile(workspacePaths, synthesisResult);
          result.synthesis = { updated: true, areasAnalyzed: synthesisResult.areasAnalyzed };
        } else if (synthesisResult) {
          result.synthesis = { updated: false, areasAnalyzed: synthesisResult.areasAnalyzed, reason: 'dry-run' };
        } else {
          result.synthesis = { updated: false, skipped: true, reason: 'no area files' };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[area-memory] Cross-area synthesis failed: ${message}`);
        result.synthesis = { updated: false, skipped: true, reason: `error: ${message}` };
      }
    } else if (!options.areaSlug && !options.callLLM) {
      result.synthesis = { updated: false, skipped: true, reason: 'no AI configured' };
    }

    return result;
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
   * Compact old learnings into an archive file.
   *
   * Reads `.arete/memory/items/learnings.md`, partitions entries by age,
   * archives old entries to `.arete/memory/archive/learnings-YYYY-MM-DD.md`,
   * and rewrites learnings.md with only recent entries.
   *
   * Supports both bullet-list format (`- YYYY-MM-DD: text`) and
   * heading-based format (`### YYYY-MM-DD: Title`).
   *
   * Entries without a parseable date are always PRESERVED (never dropped).
   */
  async compactLearnings(
    workspacePaths: WorkspacePaths,
    options: CompactLearningsOptions = {},
  ): Promise<CompactResult> {
    const olderThanDays = options.olderThanDays ?? 90;
    const learningsPath = join(workspacePaths.memory, 'items', 'learnings.md');
    const content = await this.storage.read(learningsPath);
    if (!content || content.trim() === '') {
      return { archived: 0, kept: 0, archivePath: null };
    }

    const entries = parseLearningsBullets(content);
    if (entries.length === 0) {
      return { archived: 0, kept: 0, archivePath: null };
    }

    // Partition into old vs recent/undated
    const toArchive: LearningEntry[] = [];
    const toKeep: LearningEntry[] = [];

    for (const entry of entries) {
      if (entry.date && daysAgo(entry.date) > olderThanDays) {
        toArchive.push(entry);
      } else {
        // No date → preserve (conservative); recent → keep
        toKeep.push(entry);
      }
    }

    if (toArchive.length === 0) {
      return { archived: 0, kept: entries.length, archivePath: null };
    }

    // Archive old entries
    const archiveDir = join(workspacePaths.memory, 'archive');
    await this.storage.mkdir(archiveDir);
    const archiveDateStr = new Date().toISOString().split('T')[0];
    const archivePath = join(archiveDir, `learnings-${archiveDateStr}.md`);
    const archiveContent = '# Archived Learnings\n\n' +
      toArchive.map(e => e.raw).join('\n\n') + '\n';
    await this.storage.write(archivePath, archiveContent);

    // Rewrite learnings.md with only recent/undated entries
    const header = content.match(/^(#[^#].*\n)/)?.[1] ?? '# Learnings\n';
    const keptContent = toKeep.length > 0
      ? header + '\n' + toKeep.map(e => e.raw).join('\n\n') + '\n'
      : header;
    await this.storage.write(learningsPath, keptContent);

    return {
      archived: toArchive.length,
      kept: toKeep.length,
      archivePath,
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

  /**
   * Synthesize cross-area connections using an LLM.
   *
   * Reads all area memory files, builds a prompt asking the LLM to identify
   * connections, dependencies, and attention items, and returns the response.
   *
   * Returns null if callLLM is not provided or no area files exist.
   */
  async synthesizeCrossArea(
    workspacePaths: WorkspacePaths,
    options: { callLLM?: LLMCallFn } = {},
  ): Promise<{ response: string; areasAnalyzed: string[] } | null> {
    if (!options.callLLM) return null;

    const areaDir = join(workspacePaths.root, AREA_MEMORY_DIR);
    const dirExists = await this.storage.exists(areaDir);
    if (!dirExists) return null;

    const areaFiles = await this.storage.list(areaDir, { extensions: ['.md'] });

    // Read all area files, excluding _-prefixed files (like _synthesis.md)
    const areaContents: Array<{ slug: string; content: string }> = [];
    for (const filePath of areaFiles) {
      const fileName = basename(filePath);
      if (fileName.startsWith('_')) continue;

      const content = await this.storage.read(filePath);
      if (!content) continue;

      const slug = fileName.replace(/\.md$/, '');
      areaContents.push({ slug, content });
    }

    if (areaContents.length === 0) return null;

    const prompt = buildSynthesisPrompt(areaContents);
    const response = await options.callLLM(prompt);

    return {
      response,
      areasAnalyzed: areaContents.map(a => a.slug),
    };
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  /**
   * Write the cross-area synthesis file with YAML frontmatter.
   */
  private async writeSynthesisFile(
    workspacePaths: WorkspacePaths,
    synthesisResult: { response: string; areasAnalyzed: string[] },
  ): Promise<void> {
    const now = new Date().toISOString();
    const areasYaml = synthesisResult.areasAnalyzed.map(a => `"${a}"`).join(', ');
    const content = `---
type: cross-area-synthesis
last_refreshed: "${now}"
areas_analyzed: [${areasYaml}]
---

# Cross-Area Synthesis

> Auto-generated connections across area memories. Refreshed by \`arete memory refresh\`.

${synthesisResult.response}
`;

    const outputDir = join(workspacePaths.root, AREA_MEMORY_DIR);
    await this.storage.mkdir(outputDir);
    await this.storage.write(join(outputDir, '_synthesis.md'), content);
  }

  private async computeAreaData(
    areaContext: AreaContext,
    workspacePaths: WorkspacePaths,
  ): Promise<AreaMemoryData> {
    // Active people: union of recurring-meeting attendees + recent-meeting attendees (30d window)
    const activePeopleSet = new Set<string>();
    for (const meeting of areaContext.recurringMeetings) {
      for (const attendee of meeting.attendees) {
        activePeopleSet.add(attendee);
      }
    }
    const { people: recentMeetingPeople, topics: rawTopics } = await this.scanAreaMeetings(areaContext, workspacePaths);
    for (const person of recentMeetingPeople) {
      activePeopleSet.add(person);
    }

    // Enrich topics with page status + headline from TopicMemoryService (if wired).
    const topics = await this.enrichTopicsWithPages(rawTopics, workspacePaths);

    // Commitments for this area (open and recently completed — latter no longer rendered,
    // but still available for topic-page integration downstream).
    const openCommitments = await this.commitments.listOpen({ area: areaContext.slug });

    // Recent decisions
    const recentDecisions = await this.getRecentDecisions(areaContext, workspacePaths);

    return {
      slug: areaContext.slug,
      name: areaContext.name,
      activePeople: [...activePeopleSet],
      openCommitments,
      recentDecisions,
      topics,
    };
  }

  /**
   * Enrich raw TopicEntry aggregates (from meeting frontmatter scan) with
   * status + headline + last_refreshed from the matching topic page, when one
   * exists. Partial-state tolerant — `listAll()` errors are swallowed silently
   * here; the unenriched topics still render with "no page yet" prose.
   */
  private async enrichTopicsWithPages(
    rawTopics: TopicEntry[],
    workspacePaths: WorkspacePaths,
  ): Promise<TopicEntry[]> {
    if (this.topicMemory === undefined) return rawTopics;

    let pagesBySlug: Map<string, TopicPage>;
    try {
      const { topics: pages } = await this.topicMemory.listAll(workspacePaths);
      pagesBySlug = new Map(pages.map((p) => [p.frontmatter.topic_slug, p]));
    } catch {
      return rawTopics;
    }

    return rawTopics.map((t) => {
      const page = pagesBySlug.get(t.slug);
      if (page === undefined) return t;
      return {
        ...t,
        pageStatus: page.frontmatter.status,
        pageHeadline: getTopicHeadline(page),
        pageLastRefreshed: page.frontmatter.last_refreshed,
      };
    });
  }

  /**
   * Single-pass scan of area-matched meeting files.
   *
   * Collects both recent attendee IDs (for active people) and topic aggregates
   * in one loop, avoiding the O(2N) double-scan that separate methods would cause.
   *
   * Matches meetings via BOTH frontmatter `area:` field AND recurring meeting
   * title match. People collection is limited to RECENT_DAYS; topics use all
   * matched meetings (stale exclusion applied at the end).
   */
  private async scanAreaMeetings(
    areaContext: AreaContext,
    workspacePaths: WorkspacePaths,
  ): Promise<{ people: string[]; topics: TopicEntry[] }> {
    const TOPIC_STALE_DAYS = 60;
    const meetingsDir = join(workspacePaths.resources, 'meetings');
    if (!(await this.storage.exists(meetingsDir))) return { people: [], topics: [] };

    const meetingFiles = await this.storage.list(meetingsDir, { extensions: ['.md'] });

    const people = new Set<string>();
    // Aggregate topics: slug → { count, openItems, lastReferenced }
    const topicMap = new Map<string, { count: number; openItems: number; lastReferenced: string }>();

    for (const meetingPath of meetingFiles) {
      const fileName = basename(meetingPath);
      if (fileName === 'index.md' || fileName === 'MANIFEST.md') continue;

      const dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;
      const date = dateMatch[1];

      const content = await this.storage.read(meetingPath);
      if (!content) continue;

      const parsed = parseMeetingFile(content);
      if (!parsed) continue;

      const fm = parsed.frontmatter;

      // Match via area: frontmatter field OR recurring meeting title
      let matchesArea = fm.area === areaContext.slug;
      if (!matchesArea && areaContext.recurringMeetings.length > 0) {
        const title = fm.title.toLowerCase();
        for (const recurring of areaContext.recurringMeetings) {
          if (title.includes(recurring.title.toLowerCase())) {
            matchesArea = true;
            break;
          }
        }
      }
      if (!matchesArea) continue;

      // Collect attendee IDs (only for recent meetings)
      if (daysAgo(date) <= RECENT_DAYS && fm.attendee_ids) {
        for (const id of fm.attendee_ids) {
          if (id) people.add(id);
        }
      }

      // Collect topics from all matched meetings (no date restriction here)
      if (fm.topics && fm.topics.length > 0) {
        const openItems = fm.open_action_items ?? 0;
        for (const slug of fm.topics) {
          const existing = topicMap.get(slug);
          if (!existing) {
            topicMap.set(slug, { count: 1, openItems, lastReferenced: date });
          } else {
            existing.count += 1;
            existing.openItems += openItems;
            if (date > existing.lastReferenced) existing.lastReferenced = date;
          }
        }
      }
    }

    // Build topic entries — exclude topics not mentioned in 60+ days with no open work
    const topicEntries: TopicEntry[] = [];
    for (const [slug, data] of topicMap.entries()) {
      if (daysAgo(data.lastReferenced) > TOPIC_STALE_DAYS && data.openItems === 0) continue;
      topicEntries.push({
        slug,
        name: slugToName(slug),
        meetingCount: data.count,
        openItems: data.openItems,
        lastReferenced: data.lastReferenced,
      });
    }

    // Sort by openItems desc, then meetingCount desc
    topicEntries.sort((a, b) => b.openItems - a.openItems || b.meetingCount - a.meetingCount);

    return { people: [...people], topics: topicEntries };
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
