/**
 * Primitive Briefing Assembly — Intelligence Layer (Phase 3)
 *
 * Ties together context injection, memory retrieval, and entity resolution
 * to assemble a primitive briefing before a skill runs. This is the adapter
 * pattern in action: Areté prepares context before any skill and captures
 * output after.
 *
 * See: .cursor/build/prds/product-os/skill-interface.md §1 (Primitive Briefing)
 */

import { getRelevantContext } from './context-injection.js';
import { searchMemory } from './memory-retrieval.js';
import { resolveEntities } from './entity-resolution.js';
import type {
  WorkspacePaths,
  ProductPrimitive,
  WorkType,
  ContextBundle,
  MemorySearchResult,
  ResolvedEntity,
  ContextInjectionOptions,
} from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Full primitive briefing result */
export interface PrimitiveBriefing {
  /** Task description used to generate the briefing */
  task: string;
  /** Skill name, if provided */
  skill?: string;
  /** When the briefing was assembled */
  assembledAt: string;
  /** Overall confidence based on context richness */
  confidence: 'High' | 'Medium' | 'Low';
  /** Context bundle from context injection */
  context: ContextBundle;
  /** Memory search results */
  memory: MemorySearchResult;
  /** Resolved entities from the task description */
  entities: ResolvedEntity[];
  /** Formatted markdown briefing */
  markdown: string;
}

/** Options for assembleBriefing */
export interface BriefingOptions {
  /** Product primitives to focus on */
  primitives?: ProductPrimitive[];
  /** Work type for context hints */
  workType?: WorkType;
  /** Skill name */
  skill?: string;
}

// ---------------------------------------------------------------------------
// Markdown formatting
// ---------------------------------------------------------------------------

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

  // Group context files by primitive
  const byPrimitive = new Map<string, typeof context.files>();
  const untagged: typeof context.files = [];
  for (const file of context.files) {
    if (file.primitive) {
      const existing = byPrimitive.get(file.primitive) || [];
      existing.push(file);
      byPrimitive.set(file.primitive, existing);
    } else {
      untagged.push(file);
    }
  }

  // Emit primitive sections
  for (const prim of context.primitives) {
    const files = byPrimitive.get(prim) || [];
    const gap = context.gaps.find(g => g.primitive === prim);

    lines.push(`### ${prim}`);

    if (files.length > 0) {
      for (const f of files) {
        const summary = f.summary || '(no summary)';
        lines.push(`- ${summary} — Source: \`${f.relativePath}\``);
      }
    }

    if (gap) {
      lines.push('');
      lines.push('**Gap**: ' + gap.description);
      if (gap.suggestion) lines.push(`  - Suggestion: ${gap.suggestion}`);
    }

    lines.push('');
  }

  // Strategy/goals context (untagged files)
  if (untagged.length > 0) {
    lines.push('### Strategic Context');
    for (const f of untagged) {
      const summary = f.summary || '(no summary)';
      lines.push(`- ${summary} — Source: \`${f.relativePath}\``);
    }
    lines.push('');
  }

  // Memory items
  if (memory.results.length > 0) {
    lines.push('### Relevant Memory');
    for (const item of memory.results.slice(0, 5)) {
      const dateStr = item.date ? `[${item.date}] ` : '';
      const typeLabel = item.type.charAt(0).toUpperCase() + item.type.slice(1);
      // Extract title from content (first line after ###)
      const titleMatch = item.content.match(/^###\s+(?:\d{4}-\d{2}-\d{2}:\s*)?(.+)/m);
      const title = titleMatch ? titleMatch[1].trim() : item.content.slice(0, 80);
      lines.push(`- **${typeLabel}**: ${dateStr}${title} — Source: \`${item.source}\``);
    }
    lines.push('');
  }

  // Resolved entities
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

  // Gaps summary
  if (context.gaps.length > 0) {
    lines.push('### Gaps');
    lines.push('**What\'s missing that this task might need:**');
    for (const gap of context.gaps) {
      const suggestion = gap.suggestion ? ` — Suggestion: ${gap.suggestion}` : '';
      lines.push(`- ${gap.description}${suggestion}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Entity extraction from task description
// ---------------------------------------------------------------------------

/**
 * Extract potential entity references from a task description.
 * Looks for capitalized words/phrases that might be names, project names, etc.
 */
function extractEntityReferences(task: string): string[] {
  const refs: string[] = [];
  // Match capitalized words that aren't at sentence starts (likely proper nouns)
  // Also match quoted phrases
  const quotedMatches = task.match(/"([^"]+)"|'([^']+)'/g);
  if (quotedMatches) {
    for (const m of quotedMatches) {
      refs.push(m.replace(/["']/g, ''));
    }
  }

  // Match sequences of capitalized words (proper nouns / names)
  const words = task.split(/\s+/);
  let currentName: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^a-zA-Z'-]/g, '');
    if (word.length > 0 && word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
      // Skip common words that happen to be capitalized (sentence starters, etc.)
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

  // Deduplicate
  return [...new Set(refs)].filter(r => r.length > 1);
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Assemble a primitive briefing for a task.
 *
 * Ties together context injection, memory retrieval, and entity resolution
 * to produce a comprehensive briefing the agent or user can review before
 * a skill runs.
 *
 * @param task - Task description (e.g. "create a PRD for search feature")
 * @param paths - Workspace paths
 * @param options - Primitives, work type, skill name
 * @returns PrimitiveBriefing with markdown and structured data
 */
export async function assembleBriefing(
  task: string,
  paths: WorkspacePaths,
  options: BriefingOptions = {}
): Promise<PrimitiveBriefing> {
  const now = new Date().toISOString();
  const { primitives, workType, skill } = options;

  // 1. Context injection
  const contextOptions: ContextInjectionOptions = {};
  if (primitives) contextOptions.primitives = primitives;
  if (workType) contextOptions.workType = workType;
  const context = await getRelevantContext(task, paths, contextOptions);

  // 2. Memory retrieval
  const memory = await searchMemory(task, paths, { limit: 5 });

  // 3. Entity resolution — extract references from the task and resolve them
  const entityRefs = extractEntityReferences(task);
  const entities: ResolvedEntity[] = [];
  const seenPaths = new Set<string>();
  for (const ref of entityRefs) {
    const resolved = resolveEntities(ref, 'any', paths, 3);
    for (const entity of resolved) {
      if (!seenPaths.has(entity.path)) {
        seenPaths.add(entity.path);
        entities.push(entity);
      }
    }
  }

  // 4. Determine overall confidence
  const confidence = context.confidence;

  // 5. Format markdown briefing
  const markdown = formatBriefingMarkdown(
    task,
    skill,
    confidence,
    context,
    memory,
    entities,
    now,
  );

  return {
    task,
    skill,
    assembledAt: now,
    confidence,
    context,
    memory,
    entities,
    markdown,
  };
}
