/**
 * Skill commands — list, install, route, defaults, set-default, unset-default
 */
import type { Command } from 'commander';
export declare function registerSkillCommands(program: Command): void;
export declare function detectOverlapRoleFromCandidates(installedSkillId: string, installedDescription: string, installedWorkType: string | undefined, candidates: Array<{
    id: string;
    workType?: string;
}>): string | undefined;
//# sourceMappingURL=skill.d.ts.map