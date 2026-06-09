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
    // Emits a command that returns raw assembled context (no LLM synthesis).
    // Phase 8 followup-2: `arete brief --for` is a context-assembly call, not a
    // synthesis call. The skill (this command's body, executed by the agent
    // reading SKILL.md) applies its own judgment downstream — read what's
    // relevant to the skill's purpose, ignore the rest.
    lines.push('First, run the briefing to gather raw context:');
    lines.push('```bash');
    lines.push(`arete brief --for "$ARGUMENTS" --skill ${skill.id} --json`);
    lines.push('```');
    lines.push('Use the raw context to inform the skill workflow; filter to what the skill needs.');
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
