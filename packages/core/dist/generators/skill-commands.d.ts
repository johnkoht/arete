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
export declare function generateSkillCommand(skill: SkillDefinition): string;
/**
 * Generate command files for all skills.
 * Returns a map of `{ '{name}.md': content }`.
 */
export declare function generateAllSkillCommands(skills: SkillDefinition[]): Record<string, string>;
//# sourceMappingURL=skill-commands.d.ts.map