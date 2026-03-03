/**
 * Integration section generation utilities.
 *
 * Pure functions for generating, injecting, and deriving skill integration profiles.
 * All paths are workspace-relative; no skill-relative or absolute paths are used.
 */
const INTEGRATION_START = '<!-- ARETE_INTEGRATION_START -->';
const INTEGRATION_END = '<!-- ARETE_INTEGRATION_END -->';
function defaultPath(type) {
    switch (type) {
        case 'project': return 'projects/active/{name}/';
        case 'resource': return 'resources/';
        case 'context': return 'context/';
        default: return '';
    }
}
/**
 * Generate the markdown content for the ## Areté Integration section.
 * Returns null if no meaningful integration (all outputs type:none, empty, or undefined).
 *
 * The returned string is the section content WITHOUT sentinel markers.
 * Use injectIntegrationSection() to embed it in a SKILL.md file.
 */
export function generateIntegrationSection(skillId, integration) {
    const outputs = integration.outputs ?? [];
    const meaningfulOutputs = outputs.filter(o => o.type !== 'none');
    const contextUpdates = integration.contextUpdates ?? [];
    if (meaningfulOutputs.length === 0 && contextUpdates.length === 0) {
        return null;
    }
    const lines = [];
    lines.push('## Areté Integration');
    lines.push('');
    lines.push("After completing this skill's workflow:");
    for (const output of meaningfulOutputs) {
        lines.push('');
        const path = output.path ?? defaultPath(output.type);
        const typeLabel = output.type === 'project' ? ' using project template' : '';
        lines.push(`**Output**: Save to \`${path}\`${typeLabel}.`);
        if (output.template) {
            lines.push(`- Template: Run \`arete template resolve --skill ${skillId} --variant ${output.template}\``);
        }
    }
    const shouldIndex = meaningfulOutputs.some(o => o.index === true);
    if (shouldIndex) {
        lines.push('');
        lines.push('**Indexing**: Run `arete index` to make output searchable by brief, context, and other skills.');
    }
    if (contextUpdates.length > 0) {
        lines.push('');
        lines.push('**Context updates**:');
        for (const update of contextUpdates) {
            lines.push(`- ${update}`);
        }
    }
    return lines.join('\n');
}
/**
 * Inject (or replace) the ## Areté Integration section into SKILL.md content.
 * Uses sentinel markers for idempotent replacement.
 *
 * Behavior:
 * - Markers found + section provided: replace everything between markers (inclusive)
 * - Markers NOT found + section provided: append markers + section at end
 * - Markers found + section null: remove markers and enclosed content
 * - Markers NOT found + section null: return content unchanged
 * - Idempotent: inject(inject(content, section), section) === inject(content, section)
 */
export function injectIntegrationSection(skillMdContent, section) {
    const startIdx = skillMdContent.indexOf(INTEGRATION_START);
    const endIdx = skillMdContent.indexOf(INTEGRATION_END);
    const hasMarkers = startIdx !== -1 && endIdx !== -1 && startIdx < endIdx;
    if (section === null) {
        if (!hasMarkers)
            return skillMdContent;
        // Remove the section including markers, collapsing surrounding whitespace cleanly
        const before = skillMdContent.slice(0, startIdx).replace(/\n+$/, '');
        const after = skillMdContent.slice(endIdx + INTEGRATION_END.length).replace(/^\n+/, '');
        return after.length > 0 ? `${before}\n\n${after}` : before;
    }
    const wrapped = `${INTEGRATION_START}\n${section}\n${INTEGRATION_END}`;
    if (hasMarkers) {
        // Replace in-place, preserving surrounding content exactly
        const before = skillMdContent.slice(0, startIdx);
        const after = skillMdContent.slice(endIdx + INTEGRATION_END.length);
        return `${before}${wrapped}${after}`;
    }
    // Append at end with a blank line separator
    return `${skillMdContent.trimEnd()}\n\n${wrapped}`;
}
/**
 * Derive a SkillIntegration from legacy fields (createsProject, projectTemplate).
 * Returns undefined if no legacy fields are present.
 *
 * This is specifically for native skills that use the old createsProject/projectTemplate
 * pattern and don't yet have an explicit integration field.
 */
export function deriveIntegrationFromLegacy(def) {
    if (def.createsProject !== true)
        return undefined;
    return {
        outputs: [
            {
                type: 'project',
                path: 'projects/active/{name}/',
                template: def.projectTemplate,
                index: true,
            },
        ],
    };
}
//# sourceMappingURL=integration.js.map