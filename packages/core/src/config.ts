/**
 * Configuration resolution
 * Priority: workspace arete.yaml > global ~/.arete/config.yaml > defaults
 *
 * Uses StorageAdapter for file access (no direct fs in services).
 */

import { homedir } from 'os';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import type { StorageAdapter } from './storage/adapter.js';
import type { AreteConfig } from './models/workspace.js';

const DEFAULT_CONFIG: AreteConfig = {
  schema: 1,
  version: null,
  source: 'npm',
  agent_mode: undefined,
  ide_target: undefined,
  skills: {
    core: [],
    overrides: [],
    defaults: undefined,
  },
  tools: [],
  integrations: {},
  settings: {
    memory: {
      decisions: { prompt_before_save: true },
      learnings: { prompt_before_save: true },
    },
  },
};

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    if (
      srcVal &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      srcVal !== null
    ) {
      const tgt = (result[key] as Record<string, unknown>) || {};
      result[key] = deepMerge(
        tgt as Record<string, unknown>,
        srcVal as Record<string, unknown>
      );
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

export function getGlobalConfigPath(): string {
  return join(homedir(), '.arete', 'config.yaml');
}

export function getWorkspaceConfigPath(workspacePath: string): string {
  return join(workspacePath, 'arete.yaml');
}

async function loadYamlFile(
  storage: StorageAdapter,
  filePath: string
): Promise<Record<string, unknown> | null> {
  const exists = await storage.exists(filePath);
  if (!exists) return null;
  const content = await storage.read(filePath);
  if (!content) return null;
  try {
    return parseYaml(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Load resolved configuration for a workspace.
 */
export async function loadConfig(
  storage: StorageAdapter,
  workspacePath: string | null
): Promise<AreteConfig> {
  let config = { ...DEFAULT_CONFIG } as Record<string, unknown>;

  const globalPath = getGlobalConfigPath();
  const globalConfig = await loadYamlFile(storage, globalPath);
  if (globalConfig) {
    config = deepMerge(config, globalConfig);
  }

  if (workspacePath) {
    const workspaceConfigPath = getWorkspaceConfigPath(workspacePath);
    const workspaceConfig = await loadYamlFile(storage, workspaceConfigPath);
    if (workspaceConfig) {
      config = deepMerge(config, workspaceConfig);
    }
  }

  return config as AreteConfig;
}

export function getDefaultConfig(): AreteConfig {
  return { ...DEFAULT_CONFIG };
}
