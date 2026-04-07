/**
 * Generates Claude Code slash command files from skill definitions.
 *
 * Each skill becomes a `.claude/commands/{name}.md` file that references
 * the full SKILL.md workflow.
 */

import type { SkillDefinition } from '../models/skills.js';

/**
 * Generate the content for a single `.claude/commands/{name}.md` file.
 */
export function generateSkillCommand(skill: SkillDefinition): string {
  const lines: string[] = [];

  lines.push(skill.description || skill.name);
  lines.push('');

  if (skill.requiresBriefing) {
    lines.push('First, run the briefing:');
    lines.push('```bash');
    lines.push(`arete brief --for "$ARGUMENTS" --skill ${skill.id} --json`);
    lines.push('```');
    lines.push('Present the briefing results, then proceed with the skill workflow.');
    lines.push('');
  }

  if (skill.profile) {
    lines.push(
      `Adopt the voice and approach described in \`.agents/profiles/${skill.profile}.md\` while executing this skill.`
    );
    lines.push('');
  }

  lines.push(`Read and follow the complete workflow in \`.agents/skills/${skill.id}/SKILL.md\`.`);
  lines.push('');
  lines.push('If the user provided context: $ARGUMENTS');

  return lines.join('\n') + '\n';
}

/**
 * Generate command files for all skills.
 * Returns a map of `{ '{name}.md': content }`.
 */
export function generateAllSkillCommands(
  skills: SkillDefinition[]
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const skill of skills) {
    result[`${skill.id}.md`] = generateSkillCommand(skill);
  }
  return result;
}
