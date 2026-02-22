/**
 * Shared helper: map ToolDefinition → SkillCandidate for routing.
 *
 * Extracted to avoid duplicating the mapping in route.ts and skill.ts.
 * All scoring-relevant fields (triggers, description, work_type, category)
 * must be included — see intelligence.ts scoreMatch().
 */

import type { ToolDefinition, SkillCandidate } from '@arete/core';

export function toolToCandidate(tool: ToolDefinition): SkillCandidate {
  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    path: tool.path,
    triggers: tool.triggers,
    type: 'tool' as const,
    work_type: tool.workType,
    category: tool.category,
    lifecycle: tool.lifecycle,
    duration: tool.duration,
  };
}

export function toolsToCandidates(tools: ToolDefinition[]): SkillCandidate[] {
  return tools.map(toolToCandidate);
}
