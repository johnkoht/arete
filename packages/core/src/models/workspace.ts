/**
 * Workspace domain types.
 *
 * Imports from common.ts ONLY.
 */

import type { AgentMode } from './common.js';

/** Supported IDE targets */
export type IDETarget = 'cursor' | 'claude';

/** Shape of the resolved config object */
export type AreteConfig = {
  schema: number;
  version: string | null;
  source: string;
  created?: string;
  /** Agent mode: builder (building Areté) or guide (end-user workspace) */
  agent_mode?: AgentMode;
  /** Target IDE: cursor or claude */
  ide_target?: IDETarget;
  /** Internal email domain for classifying meeting attendees */
  internal_email_domain?: string;
  /** QMD collection name for this workspace (auto-generated on install) */
  qmd_collection?: string;
  skills: {
    core: string[];
    overrides: string[];
    /** Role-to-skill mapping: default skill name -> preferred replacement */
    defaults?: Record<string, string | null>;
  };
  tools: string[];
  integrations: Record<string, unknown> & {
    /** Calendar integration configuration */
    calendar?: {
      provider: string;
      calendars?: string[];
    };
  };
  settings: {
    memory: {
      decisions: {
        prompt_before_save: boolean;
      };
      learnings: {
        prompt_before_save: boolean;
      };
    };
  };
};

/** Return type of getWorkspacePaths() */
export type WorkspacePaths = {
  root: string;
  manifest: string;
  ideConfig: string;
  rules: string;
  /** Single skills location: .agents/skills (last-in-wins) */
  agentSkills: string;
  tools: string;
  integrations: string;
  context: string;
  /** Canonical memory path: .arete/memory */
  memory: string;
  now: string;
  goals: string;
  projects: string;
  resources: string;
  people: string;
  credentials: string;
  templates: string;
};

/** Status of a workspace */
export type WorkspaceStatus = {
  initialized: boolean;
  version: string | null;
  ideTarget?: IDETarget;
  agentMode?: AgentMode;
  errors: string[];
};

/** Options for creating a new workspace */
export type CreateWorkspaceOptions = {
  ideTarget?: IDETarget;
  agentMode?: AgentMode;
  source?: string;
  skipInstall?: boolean;
  /** Package root for resolving symlink/local sources. Required when source is 'symlink'. */
  packageRoot?: string;
  /** Pre-resolved source paths (skills, rules, tools, etc.). When provided, used for copying. */
  sourcePaths?: SourcePaths;
};

/** Result of an install operation */
export type InstallResult = {
  directories: string[];
  files: string[];
  skills: string[];
  rules: string[];
  errors: Array<{ type: string; path: string; error: string }>;
};

/** Result of an update operation */
export type UpdateResult = {
  added: string[];
  updated: string[];
  preserved: string[];
  removed: string[];
};

/** Options for workspace update */
export type UpdateWorkspaceOptions = {
  /** Pre-resolved source paths used to sync canonical runtime assets (skills/rules/tools). */
  sourcePaths?: SourcePaths;
};

/** Return type of parseSourceType() */
export type SourceType = {
  type: 'npm' | 'symlink' | 'local';
  path: string | null;
};

/** Source paths from the CLI package */
export type SourcePaths = {
  root: string;
  skills: string;
  tools: string;
  rules: string;
  integrations: string;
  templates: string;
  /** Path to GUIDE.md file in the runtime/dist package */
  guide: string;
};
