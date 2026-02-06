/**
 * Workspace detection and path utilities
 */

import { existsSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the path to the CLI package root
 */
export function getPackageRoot() {
  // Go up from src/core/ to package root
  return resolve(__dirname, '..', '..');
}

/**
 * Check if a directory is an Areté workspace
 */
export function isAreteWorkspace(dir) {
  // Check for arete.yaml (new format) or characteristic directories
  const hasManifest = existsSync(join(dir, 'arete.yaml'));
  const hasCursorDir = existsSync(join(dir, '.cursor'));
  const hasContext = existsSync(join(dir, 'context'));
  const hasMemory = existsSync(join(dir, 'memory'));
  
  return hasManifest || (hasCursorDir && hasContext && hasMemory);
}

/**
 * Find workspace root starting from a directory
 */
export function findWorkspaceRoot(startDir = process.cwd()) {
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
export function getWorkspacePaths(workspaceRoot) {
  return {
    root: workspaceRoot,
    manifest: join(workspaceRoot, 'arete.yaml'),
    cursor: join(workspaceRoot, '.cursor'),
    rules: join(workspaceRoot, '.cursor', 'rules'),
    skills: join(workspaceRoot, '.cursor', 'skills'),
    skillsCore: join(workspaceRoot, '.cursor', 'skills-core'),
    skillsLocal: join(workspaceRoot, '.cursor', 'skills-local'),
    tools: join(workspaceRoot, '.cursor', 'tools'),
    integrations: join(workspaceRoot, '.cursor', 'integrations'),
    context: join(workspaceRoot, 'context'),
    memory: join(workspaceRoot, 'memory'),
    projects: join(workspaceRoot, 'projects'),
    resources: join(workspaceRoot, 'resources'),
    credentials: join(workspaceRoot, '.credentials'),
    templates: join(workspaceRoot, 'templates')
  };
}

/**
 * Get source paths from CLI package
 */
export function getSourcePaths() {
  const packageRoot = getPackageRoot();
  
  return {
    root: packageRoot,
    skills: join(packageRoot, '.cursor', 'skills'),
    tools: join(packageRoot, '.cursor', 'tools'),
    rules: join(packageRoot, '.cursor', 'rules'),
    integrations: join(packageRoot, '.cursor', 'integrations'),
    templates: join(packageRoot, 'templates')
  };
}

/**
 * Determine source type from string
 * @param {string} source - 'npm', 'symlink', or 'local:/path/to/arete'
 */
export function parseSourceType(source) {
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
