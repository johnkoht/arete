/**
 * Skill router: map user query to the best-matching Areté skill.
 * Used by CLI `arete skill route` and optionally by agents to decide which skill to load.
 */

export type RoutedSkill = {
  skill: string;
  path: string;
  reason: string;
};

export type SkillCandidate = {
  id?: string;
  name?: string;
  description?: string;
  path?: string;
  triggers?: string[];
};

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'for', 'with', 'my', 'me', 'i', 'to', 'and', 'or', 'is', 'it',
  'in', 'on', 'at', 'of', 'this', 'that', 'what', 'how', 'can', 'you', 'please'
]);

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

  // Trigger phrases (from frontmatter triggers)
  for (const phrase of triggerPhrases) {
    if (q.includes(phrase) || phrase.split(/\s+/).every(w => q.includes(w))) {
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

  return score;
}

/**
 * Route a user message to the best-matching skill, if any.
 * Returns the skill id, path, and a short reason; or null if no good match.
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

  return {
    skill: best.skill.id || best.skill.name || '',
    path,
    reason
  };
}
