/**
 * Compatibility shims for assembleBriefing and routeToSkill.
 * Delegates to IntelligenceService for backward compatibility.
 */
import type { WorkspacePaths, PrimitiveBriefing, SkillCandidate, RoutedSkill } from '../models/index.js';
/** Options for assembleBriefing (legacy BriefingOptions) */
export type BriefingOptions = {
    primitives?: import('../models/index.js').ProductPrimitive[];
    workType?: import('../models/index.js').WorkType;
    skill?: string;
};
/**
 * Assemble a primitive briefing for a task.
 * Delegates to IntelligenceService.
 */
export declare function assembleBriefing(task: string, paths: WorkspacePaths, options?: BriefingOptions): Promise<PrimitiveBriefing>;
/**
 * Route a user message to the best-matching skill or tool.
 * Delegates to IntelligenceService.
 */
export declare function routeToSkill(query: string, skills: SkillCandidate[]): RoutedSkill | null;
//# sourceMappingURL=intelligence.d.ts.map