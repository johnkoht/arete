/**
 * Skills domain types.
 *
 * Imports from common.ts ONLY.
 */
import type { ProductPrimitive, SkillCategory, WorkType } from './common.js';
/** Output type for a skill integration profile */
export type SkillIntegrationOutputType = 'project' | 'resource' | 'context' | 'none';
/** Describes a single output produced by a skill */
export type SkillIntegrationOutput = {
    type: SkillIntegrationOutputType;
    path?: string;
    template?: string;
    index?: boolean;
};
/** Integration profile for a skill — how it interacts with Areté's intelligence layer */
export type SkillIntegration = {
    outputs?: SkillIntegrationOutput[];
    contextUpdates?: string[];
};
/** Full skill definition with all metadata */
export type SkillDefinition = {
    id: string;
    name: string;
    description: string;
    path: string;
    triggers: string[];
    primitives?: ProductPrimitive[];
    workType?: WorkType;
    category: SkillCategory;
    intelligence?: string[];
    requiresBriefing?: boolean;
    createsProject?: boolean;
    projectTemplate?: string;
    integration?: SkillIntegration;
    profile?: string;
};
/** Skill metadata extracted from frontmatter */
export type SkillMetadata = {
    name: string;
    description?: string;
    triggers?: string[];
    primitives?: ProductPrimitive[];
    workType?: WorkType;
    category?: SkillCategory;
    intelligence?: string[];
    requiresBriefing?: boolean;
    createsProject?: boolean;
    projectTemplate?: string;
    integration?: SkillIntegration;
};
/** Skill candidate for routing (maps to ExtendedSkillCandidate) */
export type SkillCandidate = {
    id?: string;
    name?: string;
    description?: string;
    path?: string;
    triggers?: string[];
    primitives?: ProductPrimitive[];
    work_type?: WorkType;
    category?: SkillCategory;
    intelligence?: string[];
    requires_briefing?: boolean;
    creates_project?: boolean;
    project_template?: string;
    /** Tool-specific fields (Phase 4) */
    type?: 'skill' | 'tool';
    lifecycle?: 'time-bound' | 'condition-bound' | 'cyclical' | 'one-time';
    duration?: string;
};
/** Routed skill result (maps to ExtendedRoutedSkill) */
export type RoutedSkill = {
    skill: string;
    path: string;
    reason: string;
    primitives?: ProductPrimitive[];
    work_type?: WorkType;
    category?: SkillCategory;
    requires_briefing?: boolean;
    /** Set when skills.defaults redirected to a different skill */
    resolvedFrom?: string;
    /** Type of matched item (skill or tool) */
    type: 'skill' | 'tool';
    /** Action to take: load (skill) or activate (tool) */
    action: 'load' | 'activate';
    /** Tool lifecycle (only for tools) */
    lifecycle?: 'time-bound' | 'condition-bound' | 'cyclical' | 'one-time';
    /** Tool duration (only for tools) */
    duration?: string;
};
/** Full tool definition with all metadata */
export type ToolDefinition = {
    id: string;
    name: string;
    description: string;
    path: string;
    triggers: string[];
    lifecycle?: 'time-bound' | 'condition-bound' | 'cyclical' | 'one-time';
    duration?: string;
    workType?: WorkType;
    category?: SkillCategory;
};
/** Options for installing a skill */
export type InstallSkillOptions = {
    name?: string;
    source: string;
    workspaceRoot: string;
    category?: SkillCategory;
    overwrite?: boolean;
    yes?: boolean;
};
/** Result of installing a skill */
export type InstallSkillResult = {
    installed: boolean;
    path: string;
    name: string;
    error?: string;
};
//# sourceMappingURL=skills.d.ts.map