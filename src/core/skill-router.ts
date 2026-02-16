/**
 * Skill/tool router: map user query to the best-matching Areté skill or tool.
 * Delegates to @arete/core IntelligenceService for compatibility.
 *
 * Used by CLI `arete skill route` and optionally by agents to decide which skill/tool to load/activate.
 * See packages/core/src/compat/intelligence.ts
 */

export { routeToSkill } from '@arete/core';
export type { RoutedSkill, SkillCandidate } from '@arete/core';
