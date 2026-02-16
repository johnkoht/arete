/**
 * IntelligenceService — assembles briefings and routes to skills.
 *
 * Ported from src/core/briefing.ts and src/core/skill-router.ts.
 * Orchestrates ContextService, MemoryService, and EntityService.
 * No direct fs imports — uses injected services only.
 */

import type { ContextService } from './context.js';
import type { MemoryService } from './memory.js';
import type { EntityService } from './entity.js';
import type { ProductPrimitive, WorkType } from '../models/common.js';
import type {
  BriefingRequest,
  PrimitiveBriefing,
  SkillDefinition,
  SkillContext,
  SkillCandidate,
  RoutedSkill,
  ContextBundle,
  MemorySearchResult,
  ResolvedEntity,
  ContextFile,
} from '../models/index.js';

// ---------------------------------------------------------------------------
// routeToSkill — ported from skill-router.ts
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'for', 'with', 'my', 'me', 'i', 'to', 'and', 'or', 'is', 'it',
  'in', 'on', 'at', 'of', 'this', 'that', 'what', 'how', 'can', 'you', 'please'
]);

const WORK_TYPE_KEYWORDS: Record<WorkType, string[]> = {
  discovery: ['discovery', 'discover', 'research', 'explore', 'investigate', 'understand'],
  definition: ['define', 'prd', 'requirements', 'spec', 'specification'],
  delivery: ['deliver', 'launch', 'ship', 'release', 'rollout'],
  analysis: ['analyze', 'analysis', 'compare', 'evaluate', 'assess'],
  planning: ['plan', 'planning', 'goals', 'priorities', 'quarter', 'week', 'roadmap'],
  operations: ['sync', 'save', 'process', 'update', 'finalize', 'tour', 'review'],
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

function scoreMatch(query: string, skill: SkillCandidate): number {
  const q = query.toLowerCase().trim();
  const qTokens = tokenize(q);
  if (qTokens.length === 0) return 0;

  const qTokenSet = new Set(qTokens);
  const id = (skill.id || skill.name || '').toLowerCase().replace(/-/g, ' ');
  const desc = (skill.description || '').toLowerCase();
  const triggerPhrases = (skill.triggers || []).map(t => t.toLowerCase());

  let score = 0;

  if (id && (q.includes(id) || id.includes(qTokens.join(' ')) || qTokens.some(t => id.includes(t)))) {
    score += 20;
  }
  if (id && q.replace(/\s+/g, '-').includes(id)) {
    score += 15;
  }

  for (const phrase of triggerPhrases) {
    const phraseWords = phrase.split(/\s+/).filter(w => w.length > 0);
    const exactMatch = q.includes(phrase);
    const wholeWordMatch = phraseWords.length > 0 && phraseWords.every(w => qTokenSet.has(w));
    if (exactMatch || wholeWordMatch) {
      score += 18;
    }
  }

  const descTokens = tokenize(desc);
  const overlap = qTokens.filter(t => descTokens.includes(t)).length;
  if (overlap > 0) {
    score += overlap * 4;
  }

  const descPhrases = desc
    .replace(/use when the user wants to/gi, '')
    .split(/[,.]/)
    .map(s => s.trim())
    .filter(s => s.length > 5);
  for (const phrase of descPhrases) {
    const words = tokenize(phrase);
    if (words.length >= 2 && words.every(w => q.includes(w))) {
      score += 10;
    }
  }

  if (skill.work_type) {
    const keywords = WORK_TYPE_KEYWORDS[skill.work_type] || [];
    const workTypeMatch = qTokens.some(t => keywords.includes(t));
    if (workTypeMatch) {
      score += 6;
    }
  }

  if (skill.category === 'essential') {
    score += 2;
  } else if (skill.category === 'default') {
    score += 1;
  }

  return score;
}

// ---------------------------------------------------------------------------
// assembleBriefing helpers
// ---------------------------------------------------------------------------

function extractEntityReferences(task: string): string[] {
  const refs: string[] = [];
  const quotedMatches = task.match(/"([^"]+)"|'([^']+)'/g);
  if (quotedMatches) {
    for (const m of quotedMatches) {
      refs.push(m.replace(/["']/g, ''));
    }
  }

  const words = task.split(/\s+/);
  let currentName: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^a-zA-Z'-]/g, '');
    if (word.length > 0 && word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
      const skipWords = new Set([
        'I', 'A', 'The', 'This', 'That', 'What', 'How', 'When', 'Where', 'Why',
        'Create', 'Build', 'Start', 'Run', 'Help', 'Prep', 'Plan', 'Review',
        'Write', 'Make', 'Do', 'Set', 'Get', 'Find', 'Show', 'Update',
        'For', 'With', 'About', 'From', 'Into', 'Before', 'After',
      ]);
      if (!skipWords.has(word)) {
        currentName.push(word);
      } else if (currentName.length > 0) {
        refs.push(currentName.join(' '));
        currentName = [];
      }
    } else {
      if (currentName.length > 0) {
        refs.push(currentName.join(' '));
        currentName = [];
      }
    }
  }
  if (currentName.length > 0) {
    refs.push(currentName.join(' '));
  }

  return [...new Set(refs)].filter(r => r.length > 1);
}

function formatBriefingMarkdown(
  task: string,
  skill: string | undefined,
  confidence: string,
  context: ContextBundle,
  memory: MemorySearchResult,
  entities: ResolvedEntity[],
  assembledAt: string,
): string {
  const lines: string[] = [];

  lines.push(`## Primitive Briefing: ${task}`);
  lines.push('');
  lines.push(`**Assembled**: ${assembledAt.slice(0, 16).replace('T', ' ')}`);
  if (skill) lines.push(`**Skill**: ${skill}`);
  lines.push(`**Confidence**: ${confidence}`);
  lines.push('');

  const byPrimitive = new Map<string, ContextFile[]>();
  const untagged: ContextFile[] = [];
  for (const file of context.files) {
    if (file.primitive) {
      const existing = byPrimitive.get(file.primitive) || [];
      existing.push(file);
      byPrimitive.set(file.primitive, existing);
    } else {
      untagged.push(file);
    }
  }

  for (const prim of context.primitives) {
    const files = byPrimitive.get(prim) || [];
    const gap = context.gaps.find(g => g.primitive === prim);

    lines.push(`### ${prim}`);

    if (files.length > 0) {
      const sortedFiles = [...files].sort((a, b) => {
        const scoreA = a.relevanceScore ?? 0;
        const scoreB = b.relevanceScore ?? 0;
        return scoreB - scoreA;
      });

      for (const f of sortedFiles) {
        const summary = f.summary || '(no summary)';
        const scoreStr = f.relevanceScore !== undefined
          ? ` (relevance: ${f.relevanceScore.toFixed(2)})`
          : '';
        lines.push(`- ${summary} — Source: \`${f.relativePath}\`${scoreStr}`);
      }
    }

    if (gap) {
      lines.push('');
      lines.push('**Gap**: ' + gap.description);
      if (gap.suggestion) lines.push(`  - Suggestion: ${gap.suggestion}`);
    }

    lines.push('');
  }

  if (untagged.length > 0) {
    lines.push('### Strategic Context');
    const sortedUntagged = [...untagged].sort((a, b) => {
      const scoreA = a.relevanceScore ?? 0;
      const scoreB = b.relevanceScore ?? 0;
      return scoreB - scoreA;
    });

    for (const f of sortedUntagged) {
      const summary = f.summary || '(no summary)';
      const scoreStr = f.relevanceScore !== undefined
        ? ` (relevance: ${f.relevanceScore.toFixed(2)})`
        : '';
      lines.push(`- ${summary} — Source: \`${f.relativePath}\`${scoreStr}`);
    }
    lines.push('');
  }

  if (memory.results.length > 0) {
    lines.push('### Relevant Memory');
    for (const item of memory.results.slice(0, 5)) {
      const dateStr = item.date ? `[${item.date}] ` : '';
      const typeLabel = item.type.charAt(0).toUpperCase() + item.type.slice(1);
      const titleMatch = item.content.match(/^###\s+(?:\d{4}-\d{2}-\d{2}:\s*)?(.+)/m);
      const title = titleMatch ? titleMatch[1].trim() : item.content.slice(0, 80);
      const scoreStr = item.score !== undefined
        ? ` (score: ${item.score.toFixed(2)})`
        : '';
      lines.push(`- **${typeLabel}**: ${dateStr}${title} — Source: \`${item.source}\`${scoreStr}`);
    }
    lines.push('');
  }

  if (entities.length > 0) {
    lines.push('### Resolved Entities');
    for (const entity of entities) {
      const meta: string[] = [];
      if (entity.type === 'person') {
        if (entity.metadata.role) meta.push(String(entity.metadata.role));
        if (entity.metadata.company) meta.push(String(entity.metadata.company));
        if (entity.metadata.category) meta.push(String(entity.metadata.category));
      } else if (entity.type === 'meeting') {
        if (entity.metadata.date) meta.push(String(entity.metadata.date));
      } else if (entity.type === 'project') {
        if (entity.metadata.status) meta.push(String(entity.metadata.status));
      }
      const metaStr = meta.length > 0 ? ` (${meta.join(', ')})` : '';
      lines.push(`- **${entity.type}**: ${entity.name}${metaStr} — \`${entity.path}\``);
    }
    lines.push('');
  }

  if (context.gaps.length > 0) {
    lines.push('### Gaps');
    lines.push('**What\'s missing that this task might need:**');
    for (const gap of context.gaps) {
      const suggestion = gap.suggestion ? ` — Suggestion: ${gap.suggestion}` : '';
      lines.push(`- ${gap.description}${suggestion}`);
    }

    if (confidence === 'Low') {
      lines.push('');
      lines.push('**Note**: Low confidence indicates that semantic search found limited relevant content for this task. Consider adding more context to the workspace or refining the task description.');
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// IntelligenceService
// ---------------------------------------------------------------------------

export class IntelligenceService {
  constructor(
    private context: ContextService,
    private memory: MemoryService,
    private entities: EntityService
  ) {}

  async assembleBriefing(request: BriefingRequest): Promise<PrimitiveBriefing> {
    const now = new Date().toISOString();
    const { task, paths, skillName, primitives, workType } = request;

    const contextOptions: { primitives?: ProductPrimitive[]; workType?: WorkType } = {};
    if (primitives) contextOptions.primitives = primitives;
    if (workType) contextOptions.workType = workType;

    const context = await this.context.getRelevantContext({
      query: task,
      paths,
      primitives: contextOptions.primitives,
      workType: contextOptions.workType,
    });

    const memory = await this.memory.search({
      query: task,
      paths,
      limit: 5,
    });

    const entityRefs = extractEntityReferences(task);
    const entities: ResolvedEntity[] = [];
    const seenPaths = new Set<string>();
    for (const ref of entityRefs) {
      const resolved = await this.entities.resolveAll(ref, 'any', paths, 3);
      for (const entity of resolved) {
        if (!seenPaths.has(entity.path)) {
          seenPaths.add(entity.path);
          entities.push(entity);
        }
      }
    }

    const confidence = context.confidence;
    const markdown = formatBriefingMarkdown(
      task,
      skillName,
      confidence,
      context,
      memory,
      entities,
      now,
    );

    return {
      task,
      skill: skillName,
      assembledAt: now,
      confidence,
      context,
      memory,
      entities,
      markdown,
    };
  }

  routeToSkill(query: string, skills: SkillCandidate[]): RoutedSkill | null {
    if (!query?.trim() || skills.length === 0) return null;

    let best: { skill: SkillCandidate; score: number } | null = null;

    for (const skill of skills) {
      const path = skill.path;
      const id = skill.id || skill.name || (path ? path.split(/[/\\]/).pop() : '');
      if (!id) continue;

      const score = scoreMatch(query, { ...skill, id });
      if (score > 0 && (!best || score > best.score)) {
        best = { skill: { ...skill, id, path }, score };
      }
    }

    if (!best || best.score < 4) return null;

    const path = best.skill.path || '';
    const reason = best.score >= 18
      ? 'Strong match from intent keywords or triggers'
      : 'Match from skill description';

    const isTool = best.skill.type === 'tool';

    return {
      skill: best.skill.id || best.skill.name || '',
      path,
      reason,
      primitives: best.skill.primitives,
      work_type: best.skill.work_type,
      category: best.skill.category,
      requires_briefing: best.skill.requires_briefing,
      type: isTool ? 'tool' : 'skill',
      action: isTool ? 'activate' : 'load',
      lifecycle: isTool ? best.skill.lifecycle : undefined,
      duration: isTool ? best.skill.duration : undefined,
    };
  }

  async prepareForSkill(
    _skill: SkillDefinition,
    _task: string
  ): Promise<SkillContext> {
    throw new Error('prepareForSkill not implemented (Phase 6)');
  }
}
