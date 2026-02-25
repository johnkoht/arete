/**
 * Compatibility shims for workspace functions.
 * Provides sync API that matches legacy src/core/workspace.ts.
 */

import { existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import type { WorkspacePaths } from '../models/index.js';
import type { SourceType, SourcePaths } from '../models/index.js';
import { detectAdapter } from '../adapters/index.js';

/** Sync - uses fs for backward compatibility with sync callers. */
export function isAreteWorkspace(dir: string): boolean {
  if (existsSync(join(dir, 'arete.yaml'))) return true;
  const hasIde =
    existsSync(join(dir, '.cursor')) || existsSync(join(dir, '.claude'));
  const hasContext = existsSync(join(dir, 'context'));
  const hasMemory =
    existsSync(join(dir, '.arete', 'memory')) || existsSync(join(dir, 'memory'));
  return !!(hasIde && hasContext && hasMemory);
}

/** Sync - uses fs for backward compatibility. */
export function findWorkspaceRoot(startDir: string = process.cwd()): string | null {
  let current = resolve(startDir);
  while (current !== dirname(current)) {
    if (isAreteWorkspace(current)) return current;
    current = dirname(current);
  }
  return null;
}

/** Sync - uses adapters (which use fs for detection). */
export function getWorkspacePaths(
  workspaceRoot: string
): WorkspacePaths {
  const adapter = detectAdapter(workspaceRoot);
  return {
    root: workspaceRoot,
    manifest: join(workspaceRoot, 'arete.yaml'),
    ideConfig: join(workspaceRoot, adapter.configDirName),
    rules: join(workspaceRoot, adapter.rulesDir()),
    agentSkills: join(workspaceRoot, '.agents', 'skills'),
    tools: join(workspaceRoot, adapter.toolsDir()),
    integrations: join(workspaceRoot, adapter.integrationsDir()),
    context: join(workspaceRoot, 'context'),
    memory: join(workspaceRoot, '.arete', 'memory'),
    now: join(workspaceRoot, 'now'),
    goals: join(workspaceRoot, 'goals'),
    projects: join(workspaceRoot, 'projects'),
    resources: join(workspaceRoot, 'resources'),
    people: join(workspaceRoot, 'people'),
    credentials: join(workspaceRoot, '.credentials'),
    templates: join(workspaceRoot, 'templates'),
  };
}

/**
 * Parse source type. For 'symlink', packageRoot must be provided.
 */
export function parseSourceType(
  source: string,
  packageRoot?: string
): SourceType {
  if (source === 'npm') {
    return { type: 'npm', path: null };
  }
  if (source === 'symlink') {
    if (!packageRoot) {
      throw new Error(
        'parseSourceType: packageRoot required when source is symlink'
      );
    }
    return { type: 'symlink', path: packageRoot };
  }
  if (source.startsWith('local:')) {
    const localPath = source.slice(6);
    return { type: 'local', path: resolve(localPath) };
  }
  throw new Error(
    `Unknown source type: ${source}. Use 'npm', 'symlink', or 'local:/path'`
  );
}

/**
 * Get source paths for runtime assets (skills, tools, rules, templates).
 * Always uses packages/runtime/ as the canonical source.
 */
export function getSourcePaths(packageRoot: string): SourcePaths {
  const base = join(packageRoot, 'packages', 'runtime');
  return {
    root: packageRoot,
    skills: join(base, 'skills'),
    tools: join(base, 'tools'),
    rules: join(base, 'rules'),
    integrations: join(base, 'integrations'),
    templates: join(base, 'templates'),
    guide: join(base, 'GUIDE.md'),
  };
}
