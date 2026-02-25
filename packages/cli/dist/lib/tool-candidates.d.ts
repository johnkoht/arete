/**
 * Shared helper: map ToolDefinition → SkillCandidate for routing.
 *
 * Extracted to avoid duplicating the mapping in route.ts and skill.ts.
 * All scoring-relevant fields (triggers, description, work_type, category)
 * must be included — see intelligence.ts scoreMatch().
 */
import type { ToolDefinition, SkillCandidate } from '@arete/core';
export declare function toolToCandidate(tool: ToolDefinition): SkillCandidate;
export declare function toolsToCandidates(tools: ToolDefinition[]): SkillCandidate[];
//# sourceMappingURL=tool-candidates.d.ts.map