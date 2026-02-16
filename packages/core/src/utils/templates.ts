/**
 * Template rendering with variable substitution.
 *
 * Ported from scripts/integrations/utils.py
 * Replaces {variable_name} placeholders with values from variables object.
 */

import { readFile } from 'node:fs/promises';

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
