/**
 * Template rendering with variable substitution.
 *
 * Ported from scripts/integrations/utils.py
 * Replaces {variable_name} placeholders with values from variables object.
 */

import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Render a template file with variable substitution.
 *
 * @param templatePath - Path to template file
 * @param variables - Object of variable names to values
 * @returns Rendered template string
 * @throws If template file is not found
 */
export async function renderTemplate(
  templatePath: string,
  variables: Record<string, string | number | boolean | null | undefined>
): Promise<string> {
  let template: string;
  try {
    template = await readFile(templatePath, 'utf-8');
  } catch (err) {
    const path = typeof (err as { path?: string }).path === 'string'
      ? (err as { path: string }).path
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
export function renderTemplateString(
  template: string,
  variables: Record<string, string | number | boolean | null | undefined>
): string {
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    const replacement = value != null ? String(value) : '';
    template = template.split(placeholder).join(replacement);
  }
  return template;
}

/**
 * Resolve a skill template path using 3-level precedence:
 *
 * 1. Workspace override:  {workspaceRoot}/templates/outputs/{skillId}/{variant}.md
 * 2. Skill-local default: {workspaceRoot}/.agents/skills/{skillId}/templates/{variant}.md
 * 3. Legacy fallback:     {workspaceRoot}/templates/outputs/{variant}.md
 *
 * Returns the first path that exists, or null if none found.
 *
 * @param workspaceRoot - Absolute path to the workspace root
 * @param skillId - The skill identifier (e.g., 'create-prd')
 * @param variant - Template variant name without extension (e.g., 'prd-simple')
 * @returns Absolute path to the resolved template, or null if not found
 */
export async function resolveTemplatePath(
  workspaceRoot: string,
  skillId: string,
  variant: string
): Promise<string | null> {
  const candidates = [
    join(workspaceRoot, 'templates', 'outputs', skillId, `${variant}.md`),
    join(workspaceRoot, '.agents', 'skills', skillId, 'templates', `${variant}.md`),
    join(workspaceRoot, 'templates', 'outputs', `${variant}.md`),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // File does not exist at this level; try next
    }
  }

  return null;
}
