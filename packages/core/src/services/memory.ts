/**
 * MemoryService — manages memory entries and search.
 */

import { join } from 'node:path';
import type { StorageAdapter } from '../storage/adapter.js';
import type { SearchProvider } from '../search/types.js';
import { tokenize } from '../search/tokenize.js';
import type {
  MemorySearchRequest,
  MemorySearchResult,
  CreateMemoryRequest,
  MemoryEntry,
  MemoryTimeline,
  TimelineItem,
  MemoryIndex,
  DateRange,
  WorkspacePaths,
  MemoryItemType,
  ExtendedMemoryItemType,
} from '../models/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 10;

const MEMORY_FILES: Record<MemoryItemType, string> = {
  decisions: 'decisions.md',
  learnings: 'learnings.md',
  observations: 'agent-observations.md',
};

const RECENCY_30_DAYS = 30;
const RECENCY_90_DAYS = 90;
const RECENCY_30_BOOST = 0.2;
const RECENCY_90_BOOST = 0.1;
const THEME_MIN_OCCURRENCES = 3;
const THEME_MAX_COUNT = 10;

// ---------------------------------------------------------------------------
// Parsing and scoring
// ---------------------------------------------------------------------------

interface MemorySection {
  title: string;
  date?: string;
  body: string;
  raw: string;
}

function parseMemorySections(content: string): MemorySection[] {
  const sections: MemorySection[] = [];
  const lines = content.split('\n');
  let current: { title: string; date?: string; bodyLines: string[]; rawLines: string[] } | null = null;
  for (const line of lines) {
    const headingMatch = line.match(/^###\s+(?:(\d{4}-\d{2}-\d{2}):\s*)?(.+)/);
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

function calculateRecencyBoost(dateStr?: string): number {
  if (!dateStr) return 0;
  try {
    const itemDate = new Date(dateStr);
    const today = new Date();
    const diffMs = today.getTime() - itemDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 0;
    if (diffDays <= RECENCY_30_DAYS) return RECENCY_30_BOOST;
    if (diffDays <= RECENCY_90_DAYS) return RECENCY_90_BOOST;
    return 0;
  } catch {
    return 0;
  }
}

function applyRecencyBoost(score: number, dateStr?: string): number {
  const boost = calculateRecencyBoost(dateStr);
  return score * (1 + boost);
}

function scoreSection(section: MemorySection, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const titleLower = section.title.toLowerCase();
  const bodyLower = section.body.toLowerCase();
  const combined = titleLower + ' ' + bodyLower;
  let score = 0;
  for (const token of queryTokens) {
    if (titleLower.includes(token)) score += 3;
    else if (bodyLower.includes(token)) score += 1;
  }
  const matchCount = queryTokens.filter(t => combined.includes(t)).length;
  if (matchCount > 1) score += matchCount;
  return score;
}

function buildRelevance(section: MemorySection, queryTokens: string[]): string {
  const titleLower = section.title.toLowerCase();
  const bodyLower = section.body.toLowerCase();
  const titleMatches = queryTokens.filter(t => titleLower.includes(t));
  const bodyMatches = queryTokens.filter(t => bodyLower.includes(t));
  const parts: string[] = [];
  if (titleMatches.length > 0) parts.push(`Title matches: ${titleMatches.join(', ')}`);
  if (bodyMatches.length > 0) {
    const unique = bodyMatches.filter(t => !titleMatches.includes(t));
    if (unique.length > 0) parts.push(`Body matches: ${unique.join(', ')}`);
  }
  return parts.join('; ') || 'Token match';
}

function getMemoryTypeFromPath(filePath: string): MemoryItemType | null {
  const fileName = filePath.split(/[/\\]/).pop() || '';
  if (fileName === 'decisions.md') return 'decisions';
  if (fileName === 'learnings.md') return 'learnings';
  if (fileName === 'agent-observations.md') return 'observations';
  return null;
}

function isInDateRange(dateStr: string, range?: DateRange): boolean {
  if (!range) return true;
  if (range.start && dateStr < range.start) return false;
  if (range.end && dateStr > range.end) return false;
  return true;
}

function extractDateFromFilename(filename: string): string | undefined {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : undefined;
}

function extractThemes(items: TimelineItem[]): string[] {
  const tokenCounts = new Map<string, number>();
  for (const item of items) {
    const tokens = tokenize(item.title + ' ' + item.content);
    const unique = new Set(tokens);
    for (const token of unique) {
      tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
    }
  }
  const themes: Array<{ token: string; count: number }> = [];
  for (const [token, count] of tokenCounts) {
    if (count >= THEME_MIN_OCCURRENCES) {
      themes.push({ token, count });
    }
  }
  themes.sort((a, b) => b.count - a.count);
  return themes.slice(0, THEME_MAX_COUNT).map(t => t.token);
}

// ---------------------------------------------------------------------------
// MemoryService
// ---------------------------------------------------------------------------

export class MemoryService {
  constructor(
    private storage: StorageAdapter,
    private searchProvider: SearchProvider
  ) {}

  async search(request: MemorySearchRequest): Promise<MemorySearchResult> {
    const { query, paths, types, limit = DEFAULT_LIMIT } = request;
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) {
      return { query, results: [], total: 0 };
    }

    let allResults: { content: string; source: string; type: ExtendedMemoryItemType; date?: string; relevance: string; score?: number }[] = [];

    // 1. Search memory files (decisions, learnings, observations)
    const memoryItemsDir = join(paths.memory, 'items');
    const typesToSearch: MemoryItemType[] = types && types.length > 0
      ? types
      : ['decisions', 'learnings', 'observations'];
    const memoryFileRelPaths: string[] = [];
    for (const memType of typesToSearch) {
      const fileName = MEMORY_FILES[memType];
      const filePath = join(memoryItemsDir, fileName);
      const exists = await this.storage.exists(filePath);
      if (exists) {
        memoryFileRelPaths.push(join('.arete', 'memory', 'items', fileName));
      }
    }

    // Try semantic search for memory files first
    if (memoryFileRelPaths.length > 0) {
      try {
        const searchResults = await this.searchProvider.semanticSearch(query, {
          paths: memoryFileRelPaths,
          limit: limit * 3,
        });
        if (searchResults.length > 0) {
          for (const sr of searchResults) {
            const memType = getMemoryTypeFromPath(sr.path);
            if (!memType) continue;
            const sections = parseMemorySections(sr.content);
            const fileName = sr.path.split(/[/\\]/).pop() || '';
            for (const section of sections) {
              const boostedScore = applyRecencyBoost(sr.score, section.date);
              allResults.push({
                content: section.raw,
                source: fileName,
                type: memType,
                date: section.date,
                relevance: `Semantic match (score: ${sr.score.toFixed(2)})`,
                score: boostedScore,
              });
            }
          }
        }
      } catch {
        // Fall through to token-based fallback
      }
    }

    // Fallback to token-based search for memory files if semantic returned nothing
    if (allResults.length === 0 && memoryFileRelPaths.length > 0) {
      for (const memType of typesToSearch) {
        const fileName = MEMORY_FILES[memType];
        const filePath = join(memoryItemsDir, fileName);
        const exists = await this.storage.exists(filePath);
        if (!exists) continue;
        const content = await this.storage.read(filePath);
        if (content === null) continue;
        const sections = parseMemorySections(content);
        for (const section of sections) {
          const rawScore = scoreSection(section, queryTokens);
          if (rawScore > 0) {
            const normalizedScore = Math.min(rawScore / (queryTokens.length * 4), 1);
            const boostedScore = applyRecencyBoost(normalizedScore, section.date);
            allResults.push({
              content: section.raw,
              source: fileName,
              type: memType,
              date: section.date,
              relevance: buildRelevance(section, queryTokens),
              score: boostedScore,
            });
          }
        }
      }
    }

    // 2. Search meetings (resources/meetings/*.md)
    const meetingsDir = join(paths.resources, 'meetings');
    const meetingsExist = await this.storage.exists(meetingsDir);
    if (meetingsExist) {
      const meetingFiles = await this.storage.list(meetingsDir, { extensions: ['.md'] });
      for (const meetingPath of meetingFiles) {
        const baseName = meetingPath.split(/[/\\]/).pop() ?? '';
        if (baseName === 'index.md') continue;

        const content = await this.storage.read(meetingPath);
        if (content === null) continue;

        // Extract title from frontmatter or first heading
        let title = baseName.replace(/\.md$/, '');
        const titleMatch = content.match(/^title:\s*"?([^"\n]+)"?\s*$/m);
        if (titleMatch) {
          title = titleMatch[1].trim();
        } else {
          const headingMatch = content.match(/^#\s+(.+)/m);
          if (headingMatch) title = headingMatch[1].trim();
        }

        // Score against query
        const combined = (title + ' ' + content).toLowerCase();
        let rawScore = 0;
        for (const token of queryTokens) {
          if (combined.includes(token)) rawScore += 1;
          if (title.toLowerCase().includes(token)) rawScore += 2;
        }
        if (rawScore <= 0) continue;

        const meetingDate = extractDateFromFilename(baseName);
        const normalizedScore = Math.min(rawScore / (queryTokens.length * 3), 1);
        const boostedScore = meetingDate ? applyRecencyBoost(normalizedScore, meetingDate) : normalizedScore;

        allResults.push({
          content: content.slice(0, 500),
          source: baseName,
          type: 'meeting',
          date: meetingDate,
          relevance: `Meeting match (score: ${normalizedScore.toFixed(2)})`,
          score: boostedScore,
        });
      }
    }

    // 3. Search conversations (resources/conversations/*.md)
    const conversationsDir = join(paths.resources, 'conversations');
    const conversationsExist = await this.storage.exists(conversationsDir);
    if (conversationsExist) {
      const conversationFiles = await this.storage.list(conversationsDir, { extensions: ['.md'] });
      for (const conversationPath of conversationFiles) {
        const baseName = conversationPath.split(/[/\\]/).pop() ?? '';
        if (baseName === 'index.md') continue;

        const content = await this.storage.read(conversationPath);
        if (content === null) continue;

        // Extract title from frontmatter or first heading
        let title = baseName.replace(/\.md$/, '');
        const titleMatch = content.match(/^title:\s*"?([^"\n]+)"?\s*$/m);
        if (titleMatch) {
          title = titleMatch[1].trim();
        } else {
          const headingMatch = content.match(/^#\s+(.+)/m);
          if (headingMatch) title = headingMatch[1].trim();
        }

        // Score against query
        const combined = (title + ' ' + content).toLowerCase();
        let rawScore = 0;
        for (const token of queryTokens) {
          if (combined.includes(token)) rawScore += 1;
          if (title.toLowerCase().includes(token)) rawScore += 2;
        }
        if (rawScore <= 0) continue;

        const conversationDate = extractDateFromFilename(baseName);
        const normalizedScore = Math.min(rawScore / (queryTokens.length * 3), 1);
        const boostedScore = conversationDate ? applyRecencyBoost(normalizedScore, conversationDate) : normalizedScore;

        allResults.push({
          content: content.slice(0, 500),
          source: baseName,
          type: 'conversation',
          date: conversationDate,
          relevance: `Conversation match (score: ${normalizedScore.toFixed(2)})`,
          score: boostedScore,
        });
      }
    }

    // Sort by score (descending), then by date (descending)
    allResults.sort((a, b) => {
      const scoreA = a.score ?? 0;
      const scoreB = b.score ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      const dateA = a.date || '';
      const dateB = b.date || '';
      return dateB.localeCompare(dateA);
    });

    const total = allResults.length;
    const results = allResults.slice(0, limit);
    return { query, results, total };
  }

  async create(entry: CreateMemoryRequest): Promise<MemoryEntry> {
    const { type, title, content, paths, source } = entry;
    const fileName = MEMORY_FILES[type];
    const filePath = join(paths.memory, 'items', fileName);
    const date = new Date().toISOString().slice(0, 10);
    const heading = `### ${date}: ${title}\n\n`;
    const block = heading + content.trim() + '\n\n';
    const existing = await this.storage.read(filePath);
    const newContent = existing ? existing + block : `# ${type.charAt(0).toUpperCase() + type.slice(1)}\n\n` + block;
    await this.storage.mkdir(join(paths.memory, 'items'));
    await this.storage.write(filePath, newContent);
    return {
      type,
      title,
      content,
      date,
      source: source ?? fileName,
    };
  }

  async getTimeline(
    query: string,
    paths: WorkspacePaths,
    range?: DateRange
  ): Promise<MemoryTimeline> {
    const queryTokens = tokenize(query);
    const items: TimelineItem[] = [];

    // 1. Search memory items (decisions, learnings, observations)
    const memoryItemsDir = join(paths.memory, 'items');
    const memoryExists = await this.storage.exists(memoryItemsDir);
    if (memoryExists) {
      for (const [memType, fileName] of Object.entries(MEMORY_FILES) as Array<[MemoryItemType, string]>) {
        const filePath = join(memoryItemsDir, fileName);
        const content = await this.storage.read(filePath);
        if (content === null) continue;

        const sections = parseMemorySections(content);
        for (const section of sections) {
          if (!section.date) continue;
          if (!isInDateRange(section.date, range)) continue;

          const score = scoreSection(section, queryTokens);
          if (score <= 0 && queryTokens.length > 0) continue;

          const normalizedScore = queryTokens.length > 0
            ? Math.min(score / (queryTokens.length * 4), 1)
            : 0.5;

          items.push({
            type: memType,
            title: section.title,
            content: section.body,
            date: section.date,
            source: fileName,
            relevanceScore: applyRecencyBoost(normalizedScore, section.date),
          });
        }
      }
    }

    // 2. Search meeting transcripts/notes
    const meetingsDir = join(paths.resources, 'meetings');
    const meetingsExist = await this.storage.exists(meetingsDir);
    if (meetingsExist) {
      const meetingFiles = await this.storage.list(meetingsDir, { extensions: ['.md'] });
      for (const meetingPath of meetingFiles) {
        const baseName = meetingPath.split(/[/\\]/).pop() ?? '';
        if (baseName === 'index.md') continue;

        const meetingDate = extractDateFromFilename(baseName);
        if (meetingDate && !isInDateRange(meetingDate, range)) continue;

        const content = await this.storage.read(meetingPath);
        if (content === null) continue;

        // Extract title from frontmatter or first heading
        let title = baseName.replace(/\.md$/, '');
        const titleMatch = content.match(/^title:\s*"?([^"\n]+)"?\s*$/m);
        if (titleMatch) {
          title = titleMatch[1].trim();
        } else {
          const headingMatch = content.match(/^#\s+(.+)/m);
          if (headingMatch) title = headingMatch[1].trim();
        }

        // Score against query
        const combined = (title + ' ' + content).toLowerCase();
        let score = 0;
        for (const token of queryTokens) {
          if (combined.includes(token)) score += 1;
          if (title.toLowerCase().includes(token)) score += 2;
        }
        if (score <= 0 && queryTokens.length > 0) continue;

        const date = meetingDate ?? '';
        if (!date && !isInDateRange('', range)) continue;

        const normalizedScore = queryTokens.length > 0
          ? Math.min(score / (queryTokens.length * 3), 1)
          : 0.5;

        items.push({
          type: 'meeting',
          title,
          content: content.slice(0, 500),
          date,
          source: baseName,
          relevanceScore: date ? applyRecencyBoost(normalizedScore, date) : normalizedScore,
        });
      }
    }

    // 3. Search conversations (resources/conversations/*.md)
    const conversationsDir = join(paths.resources, 'conversations');
    const conversationsExist = await this.storage.exists(conversationsDir);
    if (conversationsExist) {
      const conversationFiles = await this.storage.list(conversationsDir, { extensions: ['.md'] });
      for (const conversationPath of conversationFiles) {
        const baseName = conversationPath.split(/[/\\]/).pop() ?? '';
        if (baseName === 'index.md') continue;

        const conversationDate = extractDateFromFilename(baseName);
        if (conversationDate && !isInDateRange(conversationDate, range)) continue;

        const content = await this.storage.read(conversationPath);
        if (content === null) continue;

        // Extract title from frontmatter or first heading
        let title = baseName.replace(/\.md$/, '');
        const titleMatch = content.match(/^title:\s*"?([^"\n]+)"?\s*$/m);
        if (titleMatch) {
          title = titleMatch[1].trim();
        } else {
          const headingMatch = content.match(/^#\s+(.+)/m);
          if (headingMatch) title = headingMatch[1].trim();
        }

        // Score against query
        const combined = (title + ' ' + content).toLowerCase();
        let score = 0;
        for (const token of queryTokens) {
          if (combined.includes(token)) score += 1;
          if (title.toLowerCase().includes(token)) score += 2;
        }
        if (score <= 0 && queryTokens.length > 0) continue;

        const date = conversationDate ?? '';
        if (!date && !isInDateRange('', range)) continue;

        const normalizedScore = queryTokens.length > 0
          ? Math.min(score / (queryTokens.length * 3), 1)
          : 0.5;

        items.push({
          type: 'conversation',
          title,
          content: content.slice(0, 500),
          date,
          source: baseName,
          relevanceScore: date ? applyRecencyBoost(normalizedScore, date) : normalizedScore,
        });
      }
    }

    // 4. Sort by date (chronological, newest first)
    items.sort((a, b) => b.date.localeCompare(a.date));

    // 5. Extract recurring themes
    const themes = extractThemes(items);

    // 6. Build effective date range
    const dates = items.map(i => i.date).filter(d => d.length > 0);
    const effectiveRange: DateRange = {
      start: range?.start ?? (dates.length > 0 ? dates[dates.length - 1] : undefined),
      end: range?.end ?? (dates.length > 0 ? dates[0] : undefined),
    };

    return {
      query,
      items,
      themes,
      dateRange: effectiveRange,
    };
  }

  async getIndex(paths: WorkspacePaths): Promise<MemoryIndex> {
    const now = new Date().toISOString();
    const memoryItemsDir = join(paths.memory, 'items');
    const exists = await this.storage.exists(memoryItemsDir);
    const decisions: MemoryEntry[] = [];
    const learnings: MemoryEntry[] = [];
    const observations: MemoryEntry[] = [];
    if (!exists) {
      return { decisions, learnings, observations, lastUpdated: now };
    }
    for (const [memType, fileName] of Object.entries(MEMORY_FILES)) {
      const filePath = join(memoryItemsDir, fileName);
      const content = await this.storage.read(filePath);
      if (content === null) continue;
      const sections = parseMemorySections(content);
      const arr = memType === 'decisions' ? decisions : memType === 'learnings' ? learnings : observations;
      for (const s of sections) {
        arr.push({
          type: memType as MemoryItemType,
          title: s.title,
          content: s.body,
          date: s.date ?? '',
          source: fileName,
        });
      }
    }
    return { decisions, learnings, observations, lastUpdated: now };
  }
}
