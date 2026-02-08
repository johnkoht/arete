/**
 * Configuration resolution
 * Priority: workspace arete.yaml > global ~/.arete/config.yaml > defaults
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { AreteConfig, AgentMode } from '../types.js';
import { parse as parseYaml } from 'yaml';
import { homedir } from 'os';

const DEFAULT_CONFIG: AreteConfig = {
  schema: 1,
  version: null,
  source: 'npm',
  agent_mode: undefined,
  skills: {
    core: [],
    overrides: [],
    defaults: undefined
  },
  tools: [],
  integrations: {},
  settings: {
    memory: {
      decisions: {
        prompt_before_save: true
      },
      learnings: {
        prompt_before_save: true
      }
    }
  }
};

/**
 * Load and parse a YAML config file
 */
function loadYamlFile(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const content = readFileSync(filePath, 'utf8');
    return parseYaml(content) as Record<string, unknown>;
  } catch (err) {
    console.error(`Warning: Could not parse ${filePath}: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Deep merge two objects
 */
function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target };
  
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}

/**
 * Get global config path
 */
export function getGlobalConfigPath(): string {
  return join(homedir(), '.arete', 'config.yaml');
}

/**
 * Get workspace config path
 */
export function getWorkspaceConfigPath(workspacePath: string): string {
  return join(workspacePath, 'arete.yaml');
}

/**
 * Load resolved configuration for a workspace
 * Resolution order: workspace > global > defaults
 */
export function loadConfig(workspacePath: string | null): AreteConfig {
  // Start with defaults
  let config = { ...DEFAULT_CONFIG } as Record<string, any>;
  
  // Merge global config
  const globalConfig = loadYamlFile(getGlobalConfigPath());
  if (globalConfig) {
    config = deepMerge(config, globalConfig);
  }
  
  // Merge workspace config (highest priority)
  if (workspacePath) {
    const workspaceConfig = loadYamlFile(getWorkspaceConfigPath(workspacePath));
    if (workspaceConfig) {
      config = deepMerge(config, workspaceConfig);
    }
  }
  
  return config as AreteConfig;
}

/**
 * Get default config
 */
export function getDefaultConfig(): AreteConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * Resolve agent mode: AGENT_MODE env (if set) > arete.yaml agent_mode > infer from workspace.
 * Used by context rule and CLI so GUIDE never sees build skills/services.
 */
export function getAgentMode(workspacePath: string | null): AgentMode {
  const envMode = process.env.AGENT_MODE?.toLowerCase();
  if (envMode === 'builder' || envMode === 'guide') {
    return envMode;
  }
  if (workspacePath) {
    const config = loadConfig(workspacePath);
    if (config.agent_mode === 'builder' || config.agent_mode === 'guide') {
      return config.agent_mode;
    }
  }
  // Infer: if this looks like the Areté source repo, builder; else guide
  if (workspacePath) {
    const hasBuild = existsSync(join(workspacePath, '.cursor', 'build', 'MEMORY.md'));
    const hasCli = existsSync(join(workspacePath, 'src', 'cli.ts'));
    if (hasBuild && hasCli) return 'builder';
  }
  return 'guide';
}

export default {
  loadConfig,
  getDefaultConfig,
  getAgentMode,
  getGlobalConfigPath,
  getWorkspaceConfigPath
};
