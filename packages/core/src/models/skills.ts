/**
 * Skills domain types.
 *
 * Imports from common.ts ONLY.
 */

import type { ProductPrimitive, SkillCategory, WorkType } from './common.js';

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

/** Options for installing a skill */
export type InstallSkillOptions = {
  name: string;
  source: string;
  category?: SkillCategory;
  overwrite?: boolean;
};

/** Result of installing a skill */
export type InstallSkillResult = {
  installed: boolean;
  path: string;
  name: string;
  error?: string;
};
