/**
 * Shared type definitions for Areté CLI
 */

/** Shape of the resolved config object */
export interface AreteConfig {
  schema: number;
  version: string | null;
  source: string;
  created?: string;
  skills: {
    core: string[];
    overrides: string[];
  };
  tools: string[];
  integrations: Record<string, unknown>;
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
}

/** People category for person classification */
export type PersonCategory = 'internal' | 'customers' | 'users';

/** Person record (from frontmatter or API) */
export interface Person {
  slug: string;
  name: string;
  email?: string | null;
  role?: string | null;
  company?: string | null;
  team?: string | null;
  category: PersonCategory;
}

/** Return type of getWorkspacePaths() */
export interface WorkspacePaths {
  root: string;
  manifest: string;
  cursor: string;
  rules: string;
  skills: string;
  skillsCore: string;
  skillsLocal: string;
  tools: string;
  integrations: string;
  context: string;
  memory: string;
  projects: string;
  resources: string;
  people: string;
  credentials: string;
  templates: string;
}

/** Return type of parseSourceType() */
export interface SourceType {
  type: 'npm' | 'symlink' | 'local';
  path: string | null;
}

/** Source paths from the CLI package */
export interface SourcePaths {
  root: string;
  skills: string;
  tools: string;
  rules: string;
  integrations: string;
  templates: string;
}

/** Common CLI command options */
export interface CommandOptions {
  json?: boolean;
}

/** Integration auth configuration */
export interface IntegrationAuth {
  type: 'api_key' | 'oauth';
  envVar?: string;
  configKey?: string;
  instructions?: string;
}

/** Integration definition */
export interface IntegrationDefinition {
  name: string;
  displayName: string;
  description: string;
  implements: string[];
  auth: IntegrationAuth;
  status: 'available' | 'planned';
}

/** Seedable/pullable integration config */
export interface ScriptableIntegration {
  name: string;
  displayName: string;
  description: string;
  defaultDays: number;
  maxDays?: number;
  script: string;
  command: string;
}

/** Result from running an integration script */
export interface ScriptResult {
  stdout: string;
  stderr: string;
  code?: number;
}

/** Integration status from config file */
export type IntegrationStatus = 'active' | 'inactive' | 'error' | null;

/** Install command results */
export interface InstallResults {
  directories: string[];
  files: string[];
  skills: string[];
  rules: string[];
  errors: Array<{ type: string; path: string; error: string }>;
}

/** Sync directory results */
export interface SyncResults {
  added: string[];
  updated: string[];
  preserved: string[];
  removed: string[];
}
