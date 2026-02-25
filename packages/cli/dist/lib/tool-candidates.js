/**
 * Shared helper: map ToolDefinition → SkillCandidate for routing.
 *
 * Extracted to avoid duplicating the mapping in route.ts and skill.ts.
 * All scoring-relevant fields (triggers, description, work_type, category)
 * must be included — see intelligence.ts scoreMatch().
 */
export function toolToCandidate(tool) {
    return {
        id: tool.id,
        name: tool.name,
        description: tool.description,
        path: tool.path,
        triggers: tool.triggers,
        type: 'tool',
        work_type: tool.workType,
        category: tool.category,
        lifecycle: tool.lifecycle,
        duration: tool.duration,
    };
}
export function toolsToCandidates(tools) {
    return tools.map(toolToCandidate);
}
//# sourceMappingURL=tool-candidates.js.map