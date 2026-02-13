/**
 * Skill/tool router: map user query to the best-matching Areté skill or tool.
 * Used by CLI `arete skill route` and optionally by agents to decide which skill/tool to load/activate.
 *
 * Enhanced in Phase 3 to read extended frontmatter (primitives, work_type, category)
 * and include intelligence metadata in routing responses.
 *
 * Phase 4: Extended to support lifecycle-based tools with type/action/lifecycle metadata.
 */

import type {
  ExtendedSkillCandidate,
  ExtendedRoutedSkill,
  ProductPrimitive,
  WorkType,
  SkillCategory,
} from '../types.js';

// Keep legacy types for backward compatibility
export type RoutedSkill = ExtendedRoutedSkill;

export type SkillCandidate = {
  id?: string;
  name?: string;
  description?: string;
  path?: string;
  triggers?: string[];
  // Extended fields (Phase 3)
  primitives?: ProductPrimitive[];
  work_type?: WorkType;
  category?: SkillCategory;
  intelligence?: string[];
  requires_briefing?: boolean;
  creates_project?: boolean;
  project_template?: string;
  // Tool-specific fields (Phase 4: Tool Routing)
  type?: 'skill' | 'tool';
  lifecycle?: 'time-bound' | 'condition-bound' | 'cyclical' | 'one-time';
  duration?: string;
};

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'for', 'with', 'my', 'me', 'i', 'to', 'and', 'or', 'is', 'it',
  'in', 'on', 'at', 'of', 'this', 'that', 'what', 'how', 'can', 'you', 'please'
]);

/** Work-type keywords for matching queries like "I want to do discovery" */
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

  // Exact or strong id match: "meeting prep" / "meeting-prep" -> meeting-prep
  if (id && (q.includes(id) || id.includes(qTokens.join(' ')) || qTokens.some(t => id.includes(t)))) {
    score += 20;
  }
  if (id && q.replace(/\s+/g, '-').includes(id)) {
    score += 15;
  }

  // Trigger phrases (from frontmatter triggers). Use whole-word matching so
  // "meeting prep" does not match "prepare a meeting agenda" (prep in "prepare").
  for (const phrase of triggerPhrases) {
    const phraseWords = phrase.split(/\s+/).filter(w => w.length > 0);
    const exactMatch = q.includes(phrase);
    const wholeWordMatch = phraseWords.length > 0 && phraseWords.every(w => qTokenSet.has(w));
    if (exactMatch || wholeWordMatch) {
      score += 18;
    }
  }

  // Description keyword overlap ("Use when..." contains intent)
  const descTokens = tokenize(desc);
  const overlap = qTokens.filter(t => descTokens.includes(t)).length;
  if (overlap > 0) {
    score += overlap * 4;
  }

  // Phrase chunks from description (e.g. "prepare for a meeting", "daily plan")
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

  // Phase 3: work_type matching — if query mentions a work type the skill supports
  if (skill.work_type) {
    const keywords = WORK_TYPE_KEYWORDS[skill.work_type] || [];
    const workTypeMatch = qTokens.some(t => keywords.includes(t));
    if (workTypeMatch) {
      score += 6;
    }
  }

  // Phase 3: Category-based tiebreaker — essential > default > community
  // Applied as a small bonus so essential skills win ties
  if (skill.category === 'essential') {
    score += 2;
  } else if (skill.category === 'default') {
    score += 1;
  }
  // community gets no bonus

  return score;
}

/**
 * Route a user message to the best-matching skill or tool, if any.
 * Returns the skill/tool id, path, reason, and intelligence metadata; or null if no good match.
 */
export function routeToSkill(query: string, skills: SkillCandidate[]): RoutedSkill | null {
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
    // Phase 3: include intelligence metadata for downstream services
    primitives: best.skill.primitives,
    work_type: best.skill.work_type,
    category: best.skill.category,
    requires_briefing: best.skill.requires_briefing,
    // Phase 4: tool routing metadata
    type: isTool ? 'tool' : 'skill',
    action: isTool ? 'activate' : 'load',
    lifecycle: isTool ? best.skill.lifecycle : undefined,
    duration: isTool ? best.skill.duration : undefined,
  };
}
