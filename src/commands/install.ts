/**
 * Install command - scaffold a new Areté workspace
 */

import { existsSync, mkdirSync, writeFileSync, symlinkSync, cpSync, readdirSync } from 'fs';
import { join, resolve, basename } from 'path';
import { stringify as stringifyYaml } from 'yaml';
import chalk from 'chalk';
import { 
  isAreteWorkspace, 
  getWorkspacePaths, 
  getSourcePaths, 
  parseSourceType,
  getPackageRoot
} from '../core/workspace.js';
import { getDefaultConfig } from '../core/config.js';
import { WORKSPACE_DIRS, DEFAULT_FILES } from '../core/workspace-structure.js';
import { success, error, warn, info, header, listItem, formatPath } from '../core/utils.js';
import type { CommandOptions, InstallResults } from '../types.js';

export interface InstallOptions extends CommandOptions {
  source?: string;
}

/**
 * Copy directory contents (non-recursive for specific folders)
 */
function copyDirectoryContents(src: string, dest: string, options: { symlink?: boolean } = {}): string[] {
  const { symlink = false } = options;
  
  if (!existsSync(src)) {
    return [];
  }
  
  // Ensure destination directory exists
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  
  const copied: string[] = [];
  const items = readdirSync(src, { withFileTypes: true });
  
  for (const item of items) {
    const srcPath = join(src, item.name);
    const destPath = join(dest, item.name);
    
    // Skip if it already exists
    if (existsSync(destPath)) {
      continue;
    }
    
    if (symlink) {
      // Create symlink
      symlinkSync(srcPath, destPath);
      copied.push(destPath);
    } else {
      // Copy
      cpSync(srcPath, destPath, { recursive: true });
      copied.push(destPath);
    }
  }
  
  return copied;
}

/**
 * Install command handler
 */
export async function installCommand(directory: string | undefined, options: InstallOptions): Promise<void> {
  const targetDir = resolve(directory || '.');
  const { source = 'npm', json } = options;
  
  // Parse source type
  let sourceInfo;
  try {
    sourceInfo = parseSourceType(source);
  } catch (err) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: (err as Error).message }));
    } else {
      error((err as Error).message);
    }
    process.exit(1);
  }
  
  // Check if already a workspace
  if (isAreteWorkspace(targetDir)) {
    if (json) {
      console.log(JSON.stringify({ 
        success: false, 
        error: 'Directory is already an Areté workspace',
        path: targetDir
      }));
    } else {
      warn(`Directory is already an Areté workspace: ${formatPath(targetDir)}`);
      info('Use "arete update" to pull latest changes');
    }
    process.exit(1);
  }
  
  if (!json) {
    header('Installing Areté Workspace');
    console.log(`  Target: ${chalk.cyan(formatPath(targetDir))}`);
    console.log(`  Source: ${chalk.cyan(source)}`);
    console.log('');
  }
  
  const results: InstallResults = {
    directories: [],
    files: [],
    skills: [],
    rules: [],
    errors: []
  };
  
  // Create target directory if needed
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
    results.directories.push(targetDir);
  }
  
  // Create workspace directories
  if (!json) info('Creating workspace structure...');
  
  for (const dir of WORKSPACE_DIRS) {
    const fullPath = join(targetDir, dir);
    if (!existsSync(fullPath)) {
      try {
        mkdirSync(fullPath, { recursive: true });
        results.directories.push(dir);
      } catch (err) {
        results.errors.push({ type: 'directory', path: dir, error: (err as Error).message });
      }
    }
  }
  
  // Create default files
  if (!json) info('Creating default files...');
  
  for (const [filePath, content] of Object.entries(DEFAULT_FILES)) {
    const fullPath = join(targetDir, filePath);
    if (!existsSync(fullPath)) {
      try {
        writeFileSync(fullPath, content, 'utf8');
        results.files.push(filePath);
      } catch (err) {
        results.errors.push({ type: 'file', path: filePath, error: (err as Error).message });
      }
    }
  }
  
  // Get source paths
  const sourcePaths = sourceInfo.path ? {
    skills: join(sourceInfo.path, '.cursor', 'skills'),
    tools: join(sourceInfo.path, '.cursor', 'tools'),
    rules: join(sourceInfo.path, '.cursor', 'rules'),
    integrations: join(sourceInfo.path, '.cursor', 'integrations'),
    templates: join(sourceInfo.path, 'templates')
  } : getSourcePaths();
  
  const workspacePaths = getWorkspacePaths(targetDir);
  const useSymlinks = sourceInfo.type === 'symlink';
  
  // Copy/symlink skills to skills-core
  if (!json) info(`${useSymlinks ? 'Linking' : 'Copying'} skills...`);
  
  if (existsSync(sourcePaths.skills)) {
    const skillsCopied = copyDirectoryContents(
      sourcePaths.skills, 
      workspacePaths.skillsCore,
      { symlink: useSymlinks }
    );
    results.skills = skillsCopied.map(p => basename(p));
  }
  
  // Copy/symlink rules
  if (!json) info(`${useSymlinks ? 'Linking' : 'Copying'} rules...`);
  
  if (existsSync(sourcePaths.rules)) {
    const rulesCopied = copyDirectoryContents(
      sourcePaths.rules,
      workspacePaths.rules,
      { symlink: useSymlinks }
    );
    results.rules = rulesCopied.map(p => basename(p));
  }
  
  // Copy integration configs (always copy, not symlink)
  if (existsSync(sourcePaths.integrations)) {
    const configsDir = join(sourcePaths.integrations, 'configs');
    if (existsSync(configsDir)) {
      copyDirectoryContents(configsDir, join(workspacePaths.integrations, 'configs'));
    }
  }
  
  // Copy templates (always copy, not symlink)
  if (existsSync(sourcePaths.templates)) {
    for (const subdir of ['inputs', 'outputs', 'projects']) {
      const srcSubdir = join(sourcePaths.templates, subdir);
      const destSubdir = join(workspacePaths.templates, subdir);
      if (existsSync(srcSubdir)) {
        copyDirectoryContents(srcSubdir, destSubdir);
      }
    }
  }
  
  // Create arete.yaml manifest
  if (!json) info('Creating manifest...');
  
  const manifest = {
    schema: 1,
    version: '0.1.0',
    source: source,
    created: new Date().toISOString().split('T')[0],
    skills: {
      core: results.skills,
      overrides: [] as string[]
    },
    tools: [] as string[],
    integrations: {},
    settings: getDefaultConfig().settings
  };
  
  const manifestPath = join(targetDir, 'arete.yaml');
  writeFileSync(manifestPath, stringifyYaml(manifest), 'utf8');
  results.files.push('arete.yaml');
  
  // Output results
  if (json) {
    console.log(JSON.stringify({
      success: true,
      path: targetDir,
      source: sourceInfo,
      results
    }, null, 2));
  } else {
    console.log('');
    success('Workspace installed successfully!');
    console.log('');
    listItem('Location', formatPath(targetDir));
    listItem('Source', source);
    listItem('Skills installed', results.skills.length.toString());
    listItem('Rules installed', results.rules.length.toString());
    
    if (results.errors.length > 0) {
      console.log('');
      warn(`${results.errors.length} errors occurred:`);
      for (const err of results.errors) {
        console.log(`  - ${err.path}: ${err.error}`);
      }
    }
    
    console.log('');
    console.log(chalk.dim('Next steps:'));
    console.log(`  1. ${chalk.cyan('cd ' + formatPath(targetDir))}`);
    console.log(`  2. ${chalk.cyan('arete setup')} to configure integrations`);
    console.log(`  3. ${chalk.cyan('arete status')} to verify installation`);
    console.log('');
  }
}

export default installCommand;
