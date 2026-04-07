/**
 * Generates CLAUDE.md content for Arete PM workspaces.
 *
 * Pure function — no I/O, no side effects.
 */
import type { AreteConfig } from '../models/workspace.js';
import type { SkillDefinition } from '../models/skills.js';
/**
 * Generate the full CLAUDE.md content for an Arete workspace.
 */
export declare function generateClaudeMd(config: AreteConfig, skills: SkillDefinition[]): string;
//# sourceMappingURL=claude-md.d.ts.map