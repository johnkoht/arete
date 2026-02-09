/**
 * Shared type definitions for Areté CLI
 */

/** Agent mode: builder = building Areté; guide = leading/empowering the user (end-product) */
export type AgentMode = 'builder' | 'guide';

/** Shape of the resolved config object */
export interface AreteConfig {
  schema: number;
  version: string | null;
  source: string;
  created?: string;
  /** Agent mode: builder (building Areté) or guide (end-user workspace). Used by rules and CLI. */
  agent_mode?: AgentMode;
  /** Internal email domain for classifying meeting attendees (e.g. "acme.com") */
  internal_email_domain?: string;
  skills: {
    core: string[];
    overrides: string[];
    /** Role-to-skill mapping: default skill name -> preferred replacement (null = use Areté default) */
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
  /** Canonical memory path: .arete/memory (items, summaries) */
  memory: string;
  now: string;
  goals: string;
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

// ---------------------------------------------------------------------------
// Intelligence Services Types (Phase 3)
// ---------------------------------------------------------------------------

/** Product primitive — the five building blocks of product knowledge */
export type ProductPrimitive = 'Problem' | 'User' | 'Solution' | 'Market' | 'Risk';

/** All valid product primitives */
export const PRODUCT_PRIMITIVES: readonly ProductPrimitive[] = [
  'Problem', 'User', 'Solution', 'Market', 'Risk'
] as const;

/** Work type classification for skills */
export type WorkType = 'discovery' | 'definition' | 'delivery' | 'analysis' | 'planning' | 'operations';

/** Skill category */
export type SkillCategory = 'essential' | 'default' | 'community';

// --- Context Injection ---

/** A file reference with content assembled during context injection */
export interface ContextFile {
  path: string;
  relativePath: string;
  primitive?: ProductPrimitive;
  category: 'context' | 'goals' | 'projects' | 'people' | 'resources' | 'memory';
  summary?: string;
  content?: string;
  relevanceScore?: number;
}

/** Gap identified during context assembly */
export interface ContextGap {
  primitive?: ProductPrimitive;
  description: string;
  suggestion?: string;
}

/** Result of context injection — the assembled context bundle */
export interface ContextBundle {
  query: string;
  primitives: ProductPrimitive[];
  files: ContextFile[];
  gaps: ContextGap[];
  confidence: 'High' | 'Medium' | 'Low';
  assembledAt: string;
}

/** Options for getRelevantContext */
export interface ContextInjectionOptions {
  primitives?: ProductPrimitive[];
  workType?: WorkType;
  maxFiles?: number;
  minScore?: number;
}

// --- Memory Retrieval ---

/** Memory item type */
export type MemoryItemType = 'decisions' | 'learnings' | 'observations';

/** A single memory search result */
export interface MemoryResult {
  content: string;
  source: string;
  type: MemoryItemType;
  date?: string;
  relevance: string;
  score?: number;
}

/** Memory search results */
export interface MemorySearchResult {
  query: string;
  results: MemoryResult[];
  total: number;
}

/** Options for searchMemory */
export interface MemorySearchOptions {
  types?: MemoryItemType[];
  limit?: number;
}

// --- Entity Resolution ---

/** Entity type for resolution */
export type EntityType = 'person' | 'meeting' | 'project' | 'any';

/** A resolved entity */
export interface ResolvedEntity {
  type: 'person' | 'meeting' | 'project';
  path: string;
  name: string;
  slug?: string;
  metadata: Record<string, unknown>;
  score: number;
}

// --- Enhanced Skill Router ---

/** Extended skill candidate with Phase 2 frontmatter */
export interface ExtendedSkillCandidate {
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
}

/** Enhanced routing result with intelligence metadata */
export interface ExtendedRoutedSkill {
  skill: string;
  path: string;
  reason: string;
  primitives?: ProductPrimitive[];
  work_type?: WorkType;
  category?: SkillCategory;
  requires_briefing?: boolean;
  /** Set when skills.defaults redirected to a different skill */
  resolvedFrom?: string;
}
