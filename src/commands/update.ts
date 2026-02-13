/**
 * Update command - pull latest from source
 */

import { existsSync, readdirSync, rmSync, cpSync, symlinkSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import chalk from 'chalk';
import { findWorkspaceRoot, getWorkspacePaths, getSourcePaths, parseSourceType } from '../core/workspace.js';
import { loadConfig } from '../core/config.js';
import { ensureWorkspaceStructure, migrateLegacyWorkspaceStructure, PRODUCT_RULES_ALLOW_LIST } from '../core/workspace-structure.js';
import { success, error, info, header, listItem, formatPath } from '../core/utils.js';
import { getAdapterFromConfig } from '../core/adapters/index.js';
import { transpileRules } from '../core/rule-transpiler.js';
import type { CommandOptions, SyncResults } from '../types.js';

export interface UpdateOptions extends CommandOptions {
  check?: boolean;
}

/**
 * Get list of items in directory
 */
function getDirContents(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => !d.name.startsWith('.') && !d.name.startsWith('_'))
    .map(d => d.name);
}

/**
 * Sync directory contents from source to destination
 */
function syncDirectory(srcDir: string, destDir: string, options: { symlink?: boolean; preserve?: string[] } = {}): SyncResults {
  const { symlink = false, preserve = [] } = options;
  const results: SyncResults = { added: [], updated: [], preserved: [], removed: [] };
  
  if (!existsSync(srcDir)) {
    return results;
  }
  
  const srcItems = getDirContents(srcDir);
  
  // Add/update items from source
  for (const item of srcItems) {
    const srcPath = join(srcDir, item);
    const destPath = join(destDir, item);
    
    if (preserve.includes(item)) {
      results.preserved.push(item);
      continue;
    }
    
    const exists = existsSync(destPath);
    
    // Remove existing if updating
    if (exists) {
      rmSync(destPath, { recursive: true, force: true });
      results.updated.push(item);
    } else {
      results.added.push(item);
    }
    
    // Copy or symlink
    if (symlink) {
      symlinkSync(srcPath, destPath);
    } else {
      cpSync(srcPath, destPath, { recursive: true });
    }
  }
  
  return results;
}

/**
 * Update command handler
 */
export async function updateCommand(options: UpdateOptions): Promise<void> {
  const { check, json } = options;
  
  // Find workspace
  const workspaceRoot = findWorkspaceRoot();
  
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ 
        success: false, 
        error: 'Not in an Areté workspace'
      }));
    } else {
      error('Not in an Areté workspace');
      info('Run "arete install" to create a workspace first');
    }
    process.exit(1);
  }
  
  const config = loadConfig(workspaceRoot);
  
  // Load adapter from config (auto-detects if ide_target not set)
  const adapter = getAdapterFromConfig(config, workspaceRoot);
  
  const paths = getWorkspacePaths(workspaceRoot, adapter);
  
  // Determine source
  const source = config.source || 'npm';
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
  
  // Get source paths (runtime/ in dev/symlink, dist/ when compiled)
  const sourcePaths = sourceInfo.path
    ? {
        skills: join(sourceInfo.path, 'runtime', 'skills'),
        rules: join(sourceInfo.path, 'runtime', 'rules'),
        tools: join(sourceInfo.path, 'runtime', 'tools')
      }
    : getSourcePaths();
  
  // Preserved skills (no longer used; kept for backward compat in config)
  const localOverrides = config.skills?.overrides || [];
  
  if (!json) {
    header(check ? 'Checking for Updates' : 'Updating Workspace');
    listItem('Workspace', formatPath(workspaceRoot));
    listItem('Source', source);
    console.log('');
  }
  
  const results = {
    skills: { added: [] as string[], updated: [] as string[], preserved: localOverrides },
    rules: { added: [] as string[], updated: [] as string[], preserved: [] as string[] },
    structure: { directoriesAdded: [] as string[], filesAdded: [] as string[] }
  };

  // Migrate legacy structure (memory/, scratchpad, goals-strategy, resources/plans) before backfill
  const migrationResult = migrateLegacyWorkspaceStructure(workspaceRoot);
  if (migrationResult.migrated.length > 0 && !json) {
    info('Migrated legacy workspace structure to Product OS layout');
    for (const msg of migrationResult.messages) {
      info(`  ${msg}`);
    }
  }

  // Ensure workspace structure (missing dirs and default files — never overwrites)
  const structureResult = ensureWorkspaceStructure(workspaceRoot, { dryRun: check, adapter });
  results.structure.directoriesAdded = structureResult.directoriesAdded;
  results.structure.filesAdded = structureResult.filesAdded;

  // Check skills
  if (existsSync(sourcePaths.skills)) {
    const srcSkills = getDirContents(sourcePaths.skills);
    const destSkills = getDirContents(paths.agentSkills);
    
    for (const skill of srcSkills) {
      if (localOverrides.includes(skill)) {
        // Skip - user has local override
      } else if (destSkills.includes(skill)) {
        results.skills.updated.push(skill);
      } else {
        results.skills.added.push(skill);
      }
    }
  }
  
  // Check rules (map source .mdc filenames to IDE-specific dest filenames for comparison)
  // Only consider rules in PRODUCT_RULES_ALLOW_LIST — matches what transpileRules actually processes
  if (existsSync(sourcePaths.rules)) {
    const srcRules = getDirContents(sourcePaths.rules)
      .filter((f) => f.endsWith('.mdc'))
      .filter((f) => PRODUCT_RULES_ALLOW_LIST.includes(f));
    const destRules = getDirContents(paths.rules);

    for (const rule of srcRules) {
      const baseName = rule.replace(/\.mdc$/, '');
      const destFilename = `${baseName}${adapter.ruleExtension}`;
      if (destRules.includes(destFilename)) {
        results.rules.updated.push(rule);
      } else {
        results.rules.added.push(rule);
      }
    }
  }
  
  // JSON output for check mode
  if (json) {
    console.log(JSON.stringify({
      success: true,
      mode: check ? 'check' : 'update',
      source,
      updates: results
    }, null, 2));
    
    if (check) return;
  }

  // Display structure backfill (already applied when not check)
  if (!json && (results.structure.directoriesAdded.length > 0 || results.structure.filesAdded.length > 0)) {
    info('Workspace structure: added missing directories and/or default files');
    if (results.structure.directoriesAdded.length > 0) {
      info(`  Directories: ${results.structure.directoriesAdded.join(', ')}`);
    }
    if (results.structure.filesAdded.length > 0) {
      info(`  Files: ${results.structure.filesAdded.join(', ')}`);
    }
  }
  
  // Display what will be updated
  if (!json) {
    if (results.skills.added.length > 0) {
      info(`Skills to add: ${results.skills.added.join(', ')}`);
    }
    if (results.skills.updated.length > 0) {
      info(`Skills to update: ${results.skills.updated.join(', ')}`);
    }
    if (results.skills.preserved.length > 0) {
      info(`Skills preserved (local override): ${results.skills.preserved.join(', ')}`);
    }
    if (results.rules.added.length > 0) {
      info(`Rules to add: ${results.rules.added.join(', ')}`);
    }
    if (results.rules.updated.length > 0) {
      info(`Rules to update: ${results.rules.updated.join(', ')}`);
    }
  }
  
  // Check mode - don't apply
  if (check) {
    if (!json) {
      console.log('');
      info('Run "arete update" without --check to apply updates');
    }
    return;
  }
  
  // Apply updates
  const useSymlinks = sourceInfo.type === 'symlink';
  
  if (!json) {
    console.log('');
    info('Applying updates...');
  }
  
  // Update .agents/skills
  const skillsResult = syncDirectory(sourcePaths.skills, paths.agentSkills, {
    symlink: useSymlinks,
    preserve: localOverrides
  });
  
  // Update tools (IDE-specific directory)
  if (existsSync(sourcePaths.tools)) {
    syncDirectory(sourcePaths.tools, paths.tools, {
      symlink: useSymlinks,
      preserve: [] // No tool overrides yet
    });
  }
  
  // Transpile rules to IDE-specific format (always regenerate)
  const rulesResult = transpileRules(
    sourcePaths.rules,
    paths.rules,
    adapter,
    config,
    PRODUCT_RULES_ALLOW_LIST
  );
  
  // Regenerate IDE-specific root files (e.g., CLAUDE.md with updated timestamp)
  const rootFiles = adapter.generateRootFiles(config, workspaceRoot, sourcePaths.rules);
  for (const [filename, content] of Object.entries(rootFiles)) {
    writeFileSync(join(workspaceRoot, filename), content, 'utf-8');
  }
  
  // Summary
  if (!json) {
    console.log('');
    success('Update complete!');
    const skillsAdded = skillsResult.added.length;
    const skillsUpdated = skillsResult.updated.length;
    if (skillsAdded > 0 || skillsUpdated > 0) {
      const parts: string[] = [];
      if (skillsAdded > 0) parts.push(`${skillsAdded} added`);
      if (skillsUpdated > 0) parts.push(`${skillsUpdated} updated`);
      listItem('Skills', parts.join(', '));
    }
    const rulesCount = rulesResult.added.length;
    if (rulesCount > 0) {
      listItem('Rules', `${rulesCount} transpiled`);
    }
    const structureAdded = results.structure.directoriesAdded.length + results.structure.filesAdded.length;
    if (structureAdded > 0) {
      listItem('Structure (new dirs/files)', structureAdded.toString());
    }
    if (skillsResult.preserved.length > 0) {
      listItem('Preserved (overrides)', skillsResult.preserved.join(', '));
    }
    console.log('');
  }
}

export default updateCommand;
