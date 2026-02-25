/**
 * Template rendering, resolution, and registry.
 *
 * Ported from scripts/integrations/utils.py
 * Replaces {variable_name} placeholders with values from variables object.
 */
/**
 * Registry of all known skill template variants.
 * Used by `arete template resolve/list/view` for validation and discovery.
 *
 * Key: skill ID. Value: array of variant names (without .md extension).
 */
export declare const TEMPLATE_REGISTRY: Record<string, string[]>;
/**
 * Render a template file with variable substitution.
 *
 * @param templatePath - Path to template file
 * @param variables - Object of variable names to values
 * @returns Rendered template string
 * @throws If template file is not found
 */
export declare function renderTemplate(templatePath: string, variables: Record<string, string | number | boolean | null | undefined>): Promise<string>;
/**
 * Synchronous variant for in-memory template strings.
 * Use when the template is already loaded (e.g., from a string).
 *
 * @param template - Template string with {variable} placeholders
 * @param variables - Object of variable names to values
 * @returns Rendered template string
 */
export declare function renderTemplateString(template: string, variables: Record<string, string | number | boolean | null | undefined>): string;
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
export declare function resolveTemplatePath(workspaceRoot: string, skillId: string, variant: string): Promise<string | null>;
/**
 * Resolve a skill template and return its content.
 * Combines resolveTemplatePath + readFile in one call for CLI/skill use.
 *
 * @returns { path, content } of the resolved template, or null if not found
 */
export declare function resolveTemplateContent(workspaceRoot: string, skillId: string, variant: string): Promise<{
    path: string;
    content: string;
} | null>;
//# sourceMappingURL=templates.d.ts.map