/**
 * Install command - scaffold a new Areté workspace
 */

import { existsSync, mkdirSync, writeFileSync, symlinkSync, cpSync, readdirSync, copyFileSync } from 'fs';
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
import { BASE_WORKSPACE_DIRS, DEFAULT_FILES, PRODUCT_RULES_ALLOW_LIST } from '../core/workspace-structure.js';
import { success, error, warn, info, header, listItem, formatPath } from '../core/utils.js';
import { getAdapter } from '../core/adapters/index.js';
import type { IDETarget } from '../core/ide-adapter.js';
import { transpileRules } from '../core/rule-transpiler.js';
import type { CommandOptions, InstallResults } from '../types.js';

export interface InstallOptions extends CommandOptions {
  source?: string;
  ide?: string;
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
  
  // Validate and get IDE adapter
  const ide = (options.ide || 'cursor') as string;
  if (ide !== 'cursor' && ide !== 'claude') {
    if (json) {
      console.log(JSON.stringify({ success: false, error: `Invalid IDE target: ${ide}. Must be 'cursor' or 'claude'` }));
    } else {
      error(`Invalid IDE target: ${ide}. Must be 'cursor' or 'claude'`);
    }
    process.exit(1);
  }
  const adapter = getAdapter(ide as IDETarget);
  
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
  
  const allDirs = [...BASE_WORKSPACE_DIRS, ...adapter.getIDEDirs()];
  
  for (const dir of allDirs) {
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
  
  // Get source paths (packages/runtime/ in dev, dist/ when compiled)
  const rulesSubdir = adapter.target === 'cursor' ? 'cursor' : 'claude-code';
  const baseSource = sourceInfo.path
    ? join(sourceInfo.path, 'packages', 'runtime')
    : null;
  const sourcePaths = baseSource
    ? {
        root: sourceInfo.path!,
        skills: join(baseSource, 'skills'),
        tools: join(baseSource, 'tools'),
        rules: join(baseSource, 'rules', rulesSubdir),
        integrations: join(baseSource, 'integrations'),
        templates: join(baseSource, 'templates'),
      }
    : (() => {
        const base = getSourcePaths();
        return {
          ...base,
          rules: join(base.rules, rulesSubdir),
        };
      })();
  
  const workspacePaths = getWorkspacePaths(targetDir, adapter);
  const useSymlinks = sourceInfo.type === 'symlink';
  
  // Copy/symlink skills to .agents/skills
  if (!json) info(`${useSymlinks ? 'Linking' : 'Copying'} skills...`);
  
  if (existsSync(sourcePaths.skills)) {
    const skillsCopied = copyDirectoryContents(
      sourcePaths.skills, 
      workspacePaths.agentSkills,
      { symlink: useSymlinks }
    );
    results.skills = skillsCopied.map(p => basename(p));
  }
  
  // Copy/symlink tools to IDE-specific tools directory
  if (!json) info(`${useSymlinks ? 'Linking' : 'Copying'} tools...`);
  
  if (existsSync(sourcePaths.tools)) {
    copyDirectoryContents(
      sourcePaths.tools,
      workspacePaths.tools,
      { symlink: useSymlinks }
    );
  }
  
  // Single manifest used for transpilation, arete.yaml, and IDE root files
  const manifest = {
    schema: 1,
    version: '0.1.0',
    source: source,
    agent_mode: 'guide' as const,
    created: new Date().toISOString().split('T')[0],
    ide_target: adapter.target,
    skills: {
      core: results.skills,
      overrides: [] as string[]
    },
    tools: [] as string[],
    integrations: {},
    settings: getDefaultConfig().settings
  };
  
  // Transpile rules to IDE-specific format
  if (!json) info('Transpiling rules...');
  
  if (existsSync(sourcePaths.rules)) {
    const transpileResults = transpileRules(
      sourcePaths.rules,
      workspacePaths.rules,
      adapter,
      manifest,
      PRODUCT_RULES_ALLOW_LIST
    );
    
    results.rules = transpileResults.added.map(p => basename(p));
    
    // Note: transpileRules handles errors internally and logs them
    // We don't need to track individual file errors here
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
  
  // Write arete.yaml manifest
  if (!json) info('Creating manifest...');
  
  const manifestPath = join(targetDir, 'arete.yaml');
  let manifestYaml = stringifyYaml(manifest);
  
  // Add commented-out calendar config example
  manifestYaml += `
# Calendar integration (macOS only)
# Uncomment and configure with: arete integration configure calendar
# calendar:
#   provider: macos
#   calendars:
#     - Work
#     - Personal
`;
  
  writeFileSync(manifestPath, manifestYaml, 'utf8');
  results.files.push('arete.yaml');
  
  // Generate IDE-specific root files (e.g., CLAUDE.md for Claude)
  if (!json) info('Generating IDE-specific files...');
  
  const rootFiles = adapter.generateRootFiles(manifest, targetDir, sourcePaths.rules);
  for (const [filename, content] of Object.entries(rootFiles)) {
    const filePath = join(targetDir, filename);
    writeFileSync(filePath, content, 'utf-8');
    results.files.push(filename);
  }
  
  // Copy GUIDE.md to workspace root (copy-if-missing, never overwrite)
  if (!json) info('Copying user guide...');
  
  const guideDest = join(targetDir, 'GUIDE.md');
  
  if (!existsSync(guideDest)) {
    // Try multiple possible source locations
    const possibleSources = [
      sourceInfo.path ? join(sourceInfo.path, 'packages', 'runtime', 'GUIDE.md') : null,
      join(sourcePaths.skills, '..', 'GUIDE.md'),
      join(getPackageRoot(), 'packages', 'runtime', 'GUIDE.md'), // packages/runtime in dev
      join(getPackageRoot(), 'dist', 'GUIDE.md') // dist when built
    ].filter(Boolean) as string[];
    
    let copied = false;
    for (const guideSource of possibleSources) {
      if (existsSync(guideSource)) {
        try {
          copyFileSync(guideSource, guideDest);
          results.files.push('GUIDE.md');
          copied = true;
          break;
        } catch (err) {
          // Try next source
        }
      }
    }
    
    if (!copied && !json) {
      warn('GUIDE.md not found in package (run npm run build)');
    }
  }
  
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
