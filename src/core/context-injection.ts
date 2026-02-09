/**
 * Context Injection Service — Intelligence Layer (Phase 3)
 *
 * Given a task description (or skill name + project context), determine which
 * workspace files are relevant and assemble them into a ContextBundle.
 *
 * This is the programmatic backbone of the primitive briefing. It maps product
 * primitives to workspace files and identifies gaps where context is missing.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import type {
  WorkspacePaths,
  ProductPrimitive,
  ContextFile,
  ContextGap,
  ContextBundle,
  ContextInjectionOptions,
} from '../types.js';
import { PRODUCT_PRIMITIVES } from '../types.js';
import { getSearchProvider } from './search.js';

// ---------------------------------------------------------------------------
// Primitive → workspace file mapping
// ---------------------------------------------------------------------------

/** Workspace files relevant to each primitive */
const PRIMITIVE_FILE_MAP: Record<ProductPrimitive, { files: string[]; category: ContextFile['category'] }[]> = {
  Problem: [
    { files: ['context/business-overview.md'], category: 'context' },
  ],
  User: [
    { files: ['context/users-personas.md'], category: 'context' },
  ],
  Solution: [
    { files: ['context/products-services.md', 'context/technology-overview.md'], category: 'context' },
  ],
  Market: [
    { files: ['context/competitive-landscape.md'], category: 'context' },
  ],
  Risk: [],
};

/** Files always included regardless of primitives */
const ALWAYS_INCLUDE: { file: string; category: ContextFile['category'] }[] = [
  { file: 'goals/strategy.md', category: 'goals' },
  { file: 'goals/quarter.md', category: 'goals' },
];

// ---------------------------------------------------------------------------
// Tokenizer (shared with skill-router)
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'for', 'with', 'my', 'me', 'i', 'to', 'and', 'or', 'is', 'it',
  'in', 'on', 'at', 'of', 'this', 'that', 'what', 'how', 'can', 'you', 'please',
  'want', 'need', 'create', 'build', 'start', 'run', 'do', 'help',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safely read a file; return null if missing or unreadable */
function safeRead(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/** Extract the first non-empty paragraph as a summary (max ~300 chars) */
function extractSummary(content: string): string {
  const lines = content.split('\n');
  const paras: string[] = [];
  let buf = '';
  for (const line of lines) {
    if (line.startsWith('---') && paras.length === 0 && buf === '') {
      // skip frontmatter
      const fmEnd = content.indexOf('\n---', content.indexOf('---') + 3);
      if (fmEnd >= 0) {
        const afterFm = content.slice(fmEnd + 4).trim();
        return extractSummary(afterFm);
      }
    }
    const trimmed = line.trim();
    if (trimmed === '' && buf.length > 0) {
      paras.push(buf.trim());
      buf = '';
    } else if (!trimmed.startsWith('#') && trimmed !== '') {
      buf += (buf.length > 0 ? ' ' : '') + trimmed;
    }
  }
  if (buf.length > 0) paras.push(buf.trim());
  const summary = paras[0] || '';
  return summary.length > 300 ? summary.slice(0, 297) + '...' : summary;
}

/** Check if a file's content is a placeholder (empty or stub) */
function isPlaceholder(content: string): boolean {
  const body = content.replace(/^---[\s\S]*?---\n?/, '').trim();
  // Strip markdown headings to measure actual content length
  const textOnly = body.replace(/^#+\s+.*/gm, '').trim();
  if (textOnly.length < 20) return true;
  if (textOnly.includes('TODO') || textOnly.includes('[Add ') || textOnly.includes('Add your ')) return true;
  return false;
}

/** List project directories with README.md in a base dir */
function listProjects(baseDir: string): string[] {
  if (!existsSync(baseDir)) return [];
  try {
    return readdirSync(baseDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
      .map(d => d.name)
      .filter(name => existsSync(join(baseDir, name, 'README.md')));
  } catch {
    return [];
  }
}

/** Check if a text contains any of the query tokens */
function hasTokenOverlap(text: string, tokens: string[]): boolean {
  const lower = text.toLowerCase();
  return tokens.some(t => lower.includes(t));
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Assemble relevant workspace context for a given task/query.
 *
 * @param query - Task description or skill name + context
 * @param paths - Workspace paths
 * @param options - Optionally specify primitives, work type, maxFiles, minScore
 * @returns ContextBundle with files, gaps, and confidence
 */
export async function getRelevantContext(
  query: string,
  paths: WorkspacePaths,
  options: ContextInjectionOptions = {}
): Promise<ContextBundle> {
  const now = new Date().toISOString();
  const queryTokens = tokenize(query);
  const primitives = options.primitives && options.primitives.length > 0
    ? options.primitives
    : [...PRODUCT_PRIMITIVES];
  
  const maxFiles = options.maxFiles ?? 15;
  const minScore = options.minScore ?? 0.3;
  const staticScore = 0.5; // Minimum relevance for static map files

  const files: ContextFile[] = [];
  const gaps: ContextGap[] = [];
  const seenPaths = new Set<string>();

  // Helper to add a file to the bundle
  function addFile(
    filePath: string,
    category: ContextFile['category'],
    primitive?: ProductPrimitive,
    relevanceScore?: number
  ): void {
    if (seenPaths.has(filePath)) return;
    const content = safeRead(filePath);
    if (content === null) return;
    seenPaths.add(filePath);
    files.push({
      path: filePath,
      relativePath: relative(paths.root, filePath),
      primitive,
      category,
      summary: extractSummary(content),
      content,
      relevanceScore,
    });
  }

  // 1. Always-include files (goals/strategy, goals/quarter) - static, minimum relevance
  for (const entry of ALWAYS_INCLUDE) {
    const fullPath = join(paths.root, entry.file);
    addFile(fullPath, entry.category, undefined, staticScore);
  }

  // 2. Primitive-mapped files - static, minimum relevance
  for (const prim of primitives) {
    const mappings = PRIMITIVE_FILE_MAP[prim];
    let foundForPrimitive = false;

    for (const mapping of mappings) {
      for (const file of mapping.files) {
        const fullPath = join(paths.root, file);
        const content = safeRead(fullPath);
        if (content !== null && !isPlaceholder(content)) {
          addFile(fullPath, mapping.category, prim, staticScore);
          foundForPrimitive = true;
        }
      }
    }

    // Check for gaps: no substantive file found for this primitive
    if (!foundForPrimitive) {
      const gapSuggestions: Record<ProductPrimitive, string> = {
        Problem: 'Add problem context to context/business-overview.md or start a discovery project',
        User: 'Add user/persona details to context/users-personas.md or create people files in people/',
        Solution: 'Add product details to context/products-services.md',
        Market: 'Add competitive landscape to context/competitive-landscape.md',
        Risk: 'Risks are often scattered across memory and projects — use arete memory search to find past decisions and learnings',
      };
      gaps.push({
        primitive: prim,
        description: `No substantive context found for ${prim} primitive`,
        suggestion: gapSuggestions[prim],
      });
    }
  }

  // 3. People files: if User primitive is relevant, add people who match query tokens (token-based, static scoring)
  if (primitives.includes('User')) {
    const peopleCategories = ['internal', 'customers', 'users'];
    for (const cat of peopleCategories) {
      const catDir = join(paths.people, cat);
      if (!existsSync(catDir)) continue;
      try {
        const entries = readdirSync(catDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === 'index.md') continue;
          const filePath = join(catDir, entry.name);
          const content = safeRead(filePath);
          if (content && hasTokenOverlap(content, queryTokens)) {
            addFile(filePath, 'people', 'User', staticScore);
          }
        }
      } catch {
        // skip unreadable directories
      }
    }
  }

  // 4. Active projects: scan READMEs for query-relevant projects (token-based, static scoring)
  const activeDir = join(paths.projects, 'active');
  const activeProjects = listProjects(activeDir);
  for (const projName of activeProjects) {
    const readmePath = join(activeDir, projName, 'README.md');
    const content = safeRead(readmePath);
    if (content && hasTokenOverlap(content, queryTokens)) {
      const prim = primitives.includes('Solution') ? 'Solution' : undefined;
      addFile(readmePath, 'projects', prim, staticScore);
    }
  }

  // 5. Memory items: search for query-relevant items in .arete/memory (token-based, static scoring)
  const memoryItemsDir = join(paths.memory, 'items');
  if (existsSync(memoryItemsDir)) {
    const memoryFiles = ['decisions.md', 'learnings.md'];
    for (const mf of memoryFiles) {
      const filePath = join(memoryItemsDir, mf);
      const content = safeRead(filePath);
      if (content && hasTokenOverlap(content, queryTokens)) {
        addFile(filePath, 'memory', 'Risk', staticScore);
      }
    }
  }

  // 6. SearchProvider discovery: use semantic search to find additional relevant files
  try {
    const provider = getSearchProvider(paths.root);
    const searchResults = await provider.semanticSearch(query, {
      limit: maxFiles * 2, // Fetch more than needed, we'll filter and dedupe
      minScore,
    });

    for (const result of searchResults) {
      // Skip if already included in static files
      if (seenPaths.has(result.path)) continue;
      
      // Skip if score is below threshold
      if (result.score < minScore) continue;

      // Determine category from path
      const relPath = relative(paths.root, result.path);
      let category: ContextFile['category'] = 'resources';
      if (relPath.startsWith('context/')) category = 'context';
      else if (relPath.startsWith('goals/')) category = 'goals';
      else if (relPath.startsWith('projects/')) category = 'projects';
      else if (relPath.startsWith('people/')) category = 'people';
      else if (relPath.startsWith('.arete/memory/')) category = 'memory';

      // Add discovered file with its search score
      addFile(result.path, category, undefined, result.score);
    }
  } catch (err) {
    // If SearchProvider fails, continue with static files only
    // This ensures backward compatibility and graceful degradation
  }

  // 7. Sort files by relevance score (descending), then cap at maxFiles
  files.sort((a, b) => {
    const scoreA = a.relevanceScore ?? 0;
    const scoreB = b.relevanceScore ?? 0;
    return scoreB - scoreA;
  });

  // Cap at maxFiles
  const cappedFiles = files.slice(0, maxFiles);

  // 8. Compute confidence
  const totalPrimitives = primitives.length;
  const coveredPrimitives = totalPrimitives - gaps.length;
  const contextFileCount = cappedFiles.filter(f => f.category === 'context').length;

  let confidence: ContextBundle['confidence'];
  if (coveredPrimitives >= totalPrimitives && contextFileCount >= 2) {
    confidence = 'High';
  } else if (coveredPrimitives >= totalPrimitives * 0.5 || contextFileCount >= 1) {
    confidence = 'Medium';
  } else {
    confidence = 'Low';
  }

  return {
    query,
    primitives,
    files: cappedFiles,
    gaps,
    confidence,
    assembledAt: now,
  };
}
