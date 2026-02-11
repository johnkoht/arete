/**
 * Workspace detection and path utilities
 */

import { existsSync } from 'fs';
import { join, dirname, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import type { WorkspacePaths, SourceType, SourcePaths } from '../types.js';
import type { IDEAdapter } from './ide-adapter.js';
import { detectAdapter } from './adapters/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the path to the CLI package root
 */
export function getPackageRoot(): string {
  // Go up from src/core/ to package root
  return resolve(__dirname, '..', '..');
}

/**
 * Check if a directory is an Areté workspace
 */
export function isAreteWorkspace(dir: string): boolean {
  // Check for arete.yaml (new format) or characteristic directories
  const hasManifest = existsSync(join(dir, 'arete.yaml'));
  const hasCursorDir = existsSync(join(dir, '.cursor')) || existsSync(join(dir, '.claude'));
  const hasContext = existsSync(join(dir, 'context'));
  const hasMemory = existsSync(join(dir, '.arete', 'memory')) || existsSync(join(dir, 'memory'));
  
  return hasManifest || (hasCursorDir && hasContext && hasMemory);
}

/**
 * Find workspace root starting from a directory
 */
export function findWorkspaceRoot(startDir: string = process.cwd()): string | null {
  let current = resolve(startDir);
  
  while (current !== dirname(current)) {
    if (isAreteWorkspace(current)) {
      return current;
    }
    current = dirname(current);
  }
  
  return null;
}

/**
 * Get workspace paths
 */
export function getWorkspacePaths(workspaceRoot: string, adapter?: IDEAdapter): WorkspacePaths {
  const adp = adapter || detectAdapter(workspaceRoot);
  
  return {
    root: workspaceRoot,
    manifest: join(workspaceRoot, 'arete.yaml'),
    ideConfig: join(workspaceRoot, adp.configDirName),
    rules: join(workspaceRoot, adp.rulesDir()),
    agentSkills: join(workspaceRoot, '.agents', 'skills'),
    tools: join(workspaceRoot, adp.toolsDir()),
    integrations: join(workspaceRoot, adp.integrationsDir()),
    context: join(workspaceRoot, 'context'),
    memory: join(workspaceRoot, '.arete', 'memory'),
    now: join(workspaceRoot, 'now'),
    goals: join(workspaceRoot, 'goals'),
    projects: join(workspaceRoot, 'projects'),
    resources: join(workspaceRoot, 'resources'),
    people: join(workspaceRoot, 'people'),
    credentials: join(workspaceRoot, '.credentials'),
    templates: join(workspaceRoot, 'templates')
  };
}

/**
 * Get source paths from CLI package.
 * When running from src/ (tsx dev), use runtime/. When running from dist/ (compiled), use dist/.
 */
export function getSourcePaths(): SourcePaths {
  const packageRoot = getPackageRoot();
  const __filenameForResolve = fileURLToPath(import.meta.url);
  const runningFromSrc = __filenameForResolve.includes(sep + 'src' + sep);
  const base = runningFromSrc ? join(packageRoot, 'runtime') : join(packageRoot, 'dist');

  return {
    root: packageRoot,
    skills: join(base, 'skills'),
    tools: join(base, 'tools'),
    rules: join(base, 'rules'),
    integrations: join(base, 'integrations'),
    templates: join(base, 'templates')
  };
}

/**
 * Determine source type from string
 */
export function parseSourceType(source: string): SourceType {
  if (source === 'npm') {
    return { type: 'npm', path: null };
  }
  if (source === 'symlink') {
    return { type: 'symlink', path: getPackageRoot() };
  }
  if (source.startsWith('local:')) {
    const localPath = source.slice(6);
    return { type: 'local', path: resolve(localPath) };
  }
  
  throw new Error(`Unknown source type: ${source}. Use 'npm', 'symlink', or 'local:/path'`);
}

export default {
  getPackageRoot,
  isAreteWorkspace,
  findWorkspaceRoot,
  getWorkspacePaths,
  getSourcePaths,
  parseSourceType
};
