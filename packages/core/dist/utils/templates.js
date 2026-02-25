/**
 * Template rendering, resolution, and registry.
 *
 * Ported from scripts/integrations/utils.py
 * Replaces {variable_name} placeholders with values from variables object.
 */
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
/**
 * Registry of all known skill template variants.
 * Used by `arete template resolve/list/view` for validation and discovery.
 *
 * Key: skill ID. Value: array of variant names (without .md extension).
 */
export const TEMPLATE_REGISTRY = {
    'create-prd': ['prd-simple', 'prd-regular', 'prd-full', 'project'],
    'prepare-meeting-agenda': ['one-on-one', 'leadership', 'customer', 'dev-team', 'other'],
    'discovery': ['project', 'research-note', 'user-feedback'],
    'competitive-analysis': ['project'],
    'construct-roadmap': ['project', 'roadmap'],
    'week-plan': ['week-priorities'],
    'quarter-plan': ['quarter-goals'],
};
/**
 * Render a template file with variable substitution.
 *
 * @param templatePath - Path to template file
 * @param variables - Object of variable names to values
 * @returns Rendered template string
 * @throws If template file is not found
 */
export async function renderTemplate(templatePath, variables) {
    let template;
    try {
        template = await readFile(templatePath, 'utf-8');
    }
    catch (err) {
        const path = typeof err.path === 'string'
            ? err.path
            : templatePath;
        throw new Error(`Template not found: ${path}`);
    }
    // Replace {variable} placeholders
    for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{${key}}`;
        const replacement = value != null ? String(value) : '';
        template = template.split(placeholder).join(replacement);
    }
    return template;
}
/**
 * Synchronous variant for in-memory template strings.
 * Use when the template is already loaded (e.g., from a string).
 *
 * @param template - Template string with {variable} placeholders
 * @param variables - Object of variable names to values
 * @returns Rendered template string
 */
export function renderTemplateString(template, variables) {
    for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{${key}}`;
        const replacement = value != null ? String(value) : '';
        template = template.split(placeholder).join(replacement);
    }
    return template;
}
/**
 * Resolve a skill template path using 2-level precedence (+ legacy fallback):
 *
 * 1. Workspace override:  {workspaceRoot}/templates/outputs/{skillId}/{variant}.md
 * 2. Skill-local default: {workspaceRoot}/.agents/skills/{skillId}/templates/{variant}.md
 * 3. Legacy fallback:     {workspaceRoot}/templates/outputs/{variant}.md
 *
 * Level 1 is the unified workspace override location for all skills (Decision 1).
 * Level 3 exists only for backward compat with workspaces created before this system.
 *
 * Returns the absolute path to the first file that exists, or null if none found.
 *
 * @param workspaceRoot - Absolute path to the workspace root
 * @param skillId - The skill identifier (e.g., 'create-prd')
 * @param variant - Template variant name without extension (e.g., 'prd-regular')
 */
export async function resolveTemplatePath(workspaceRoot, skillId, variant) {
    const candidates = [
        join(workspaceRoot, 'templates', 'outputs', skillId, `${variant}.md`),
        join(workspaceRoot, '.agents', 'skills', skillId, 'templates', `${variant}.md`),
        join(workspaceRoot, 'templates', 'outputs', `${variant}.md`),
    ];
    for (const candidate of candidates) {
        try {
            await access(candidate);
            return candidate;
        }
        catch {
            // File does not exist at this level; try next
        }
    }
    return null;
}
/**
 * Resolve a skill template and return its content.
 * Combines resolveTemplatePath + readFile in one call for CLI/skill use.
 *
 * @returns { path, content } of the resolved template, or null if not found
 */
export async function resolveTemplateContent(workspaceRoot, skillId, variant) {
    const resolved = await resolveTemplatePath(workspaceRoot, skillId, variant);
    if (!resolved)
        return null;
    try {
        const content = await readFile(resolved, 'utf-8');
        return { path: resolved, content };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=templates.js.map