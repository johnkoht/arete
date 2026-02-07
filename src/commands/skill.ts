/**
 * Skill management commands
 */

import { existsSync, readdirSync, readFileSync, cpSync, mkdirSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import chalk from 'chalk';
import { findWorkspaceRoot, getWorkspacePaths } from '../core/workspace.js';
import { loadConfig, getWorkspaceConfigPath } from '../core/config.js';
import { routeToSkill } from '../core/skill-router.js';
import { success, error, warn, info, header, listItem, formatPath } from '../core/utils.js';
import type { CommandOptions } from '../types.js';

export interface SkillOptions extends CommandOptions {
  name?: string;
}

interface SkillInfo {
  name: string;
  description?: string;
  type?: string;
  includes?: Record<string, unknown>;
  path?: string;
  id?: string;
  source?: string;
  overridden?: boolean;
  triggers?: string[];
}

/**
 * Get skill info from SKILL.md
 */
function getSkillInfo(skillPath: string): SkillInfo {
  const skillFile = join(skillPath, 'SKILL.md');
  if (!existsSync(skillFile)) {
    return { name: basename(skillPath) };
  }
  
  try {
    const content = readFileSync(skillFile, 'utf8');
    // Parse frontmatter
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (match) {
      const frontmatter = parseYaml(match[1]) as Record<string, unknown>;
      return {
        name: (frontmatter.name as string) || basename(skillPath),
        description: (frontmatter.description as string) || '',
        type: (frontmatter.type as string) || 'stateless',
        includes: (frontmatter.includes as Record<string, unknown>) || {},
        triggers: Array.isArray(frontmatter.triggers) ? (frontmatter.triggers as string[]) : undefined
      };
    }
  } catch {
    // Ignore parse errors
  }
  
  return { name: basename(skillPath) };
}

/**
 * Get list of skills with info
 */
function getSkillsList(dir: string): SkillInfo[] {
  if (!existsSync(dir)) return [];
  
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => (d.isDirectory() || d.isSymbolicLink()) && !d.name.startsWith('_'))
    .map(d => {
      const skillPath = join(dir, d.name);
      return {
        ...getSkillInfo(skillPath),
        path: skillPath,
        id: d.name
      };
    });
}

/**
 * Get merged skills with effective path (local overrides core). Used for routing.
 * Exported for use by the top-level route command.
 */
export function getMergedSkillsForRouting(paths: ReturnType<typeof getWorkspacePaths>): SkillInfo[] {
  const coreSkills = getSkillsList(paths.skillsCore);
  const localSkills = getSkillsList(paths.skillsLocal);
  const localIds = new Set(localSkills.map(s => s.id));
  const result: SkillInfo[] = [];
  for (const s of coreSkills) {
    const overridden = s.id && localIds.has(s.id);
    if (overridden) {
      const local = localSkills.find(l => l.id === s.id);
      if (local) result.push({ ...local, source: 'local', overridden: true });
    } else {
      result.push({ ...s, source: 'core', overridden: false });
    }
  }
  for (const s of localSkills) {
    if (!s.id || !coreSkills.some(c => c.id === s.id)) {
      result.push({ ...s, source: 'local', overridden: false });
    }
  }
  return result;
}

/**
 * List skills
 */
async function listSkills(options: CommandOptions): Promise<void> {
  const { json } = options;
  
  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
    }
    process.exit(1);
  }
  
  const paths = getWorkspacePaths(workspaceRoot);
  
  const coreSkills = getSkillsList(paths.skillsCore);
  const localSkills = getSkillsList(paths.skillsLocal);
  
  // Merge and mark overrides
  const allSkills: SkillInfo[] = [];
  const localIds = localSkills.map(s => s.id);
  
  for (const skill of coreSkills) {
    const isOverridden = localIds.includes(skill.id);
    allSkills.push({
      ...skill,
      source: 'core',
      overridden: isOverridden
    });
  }
  
  for (const skill of localSkills) {
    const isOverride = coreSkills.some(s => s.id === skill.id);
    if (!isOverride) {
      allSkills.push({
        ...skill,
        source: 'local',
        overridden: false
      });
    }
  }
  
  if (json) {
    console.log(JSON.stringify({
      success: true,
      skills: allSkills,
      counts: {
        core: coreSkills.length,
        local: localSkills.length,
        total: allSkills.length
      }
    }, null, 2));
    return;
  }
  
  header('Available Skills');
  
  console.log(chalk.dim(`  ${coreSkills.length} core, ${localSkills.length} local`));
  console.log('');
  
  for (const skill of allSkills.sort((a, b) => (a.id || '').localeCompare(b.id || ''))) {
    let badge = '';
    if (skill.overridden) {
      badge = chalk.yellow(' (overridden)');
    } else if (skill.source === 'local') {
      badge = chalk.green(' (local)');
    }
    
    const typeTag = skill.type === 'lifecycle' ? chalk.dim(' [lifecycle]') : '';
    
    console.log(`  ${chalk.dim('•')} ${chalk.bold(skill.id || skill.name)}${badge}${typeTag}`);
    if (skill.description) {
      console.log(`    ${chalk.dim(skill.description)}`);
    }
  }
  
  console.log('');
}

/**
 * Override a skill (copy to skills-local)
 */
async function overrideSkill(options: SkillOptions): Promise<void> {
  const { name, json } = options;
  
  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
    }
    process.exit(1);
  }
  
  const paths = getWorkspacePaths(workspaceRoot);
  
  const corePath = join(paths.skillsCore, name!);
  const localPath = join(paths.skillsLocal, name!);
  
  // Check if skill exists in core
  if (!existsSync(corePath)) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: `Skill not found: ${name}` }));
    } else {
      error(`Skill not found in core: ${name}`);
      info('Run "arete skill list" to see available skills');
    }
    process.exit(1);
  }
  
  // Check if already overridden
  if (existsSync(localPath)) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: `Skill already overridden: ${name}` }));
    } else {
      warn(`Skill is already overridden: ${name}`);
      listItem('Location', formatPath(localPath));
    }
    process.exit(1);
  }
  
  // Ensure skills-local exists
  if (!existsSync(paths.skillsLocal)) {
    mkdirSync(paths.skillsLocal, { recursive: true });
  }
  
  // Copy skill to local
  cpSync(corePath, localPath, { recursive: true, dereference: true });
  
  // Update arete.yaml to track override
  const configPath = getWorkspaceConfigPath(workspaceRoot);
  if (existsSync(configPath)) {
    try {
      const configContent = readFileSync(configPath, 'utf8');
      const yamlConfig = (parseYaml(configContent) as Record<string, unknown>) || {};
      
      const skills = (yamlConfig.skills || {}) as Record<string, unknown>;
      const overrides = (skills.overrides || []) as string[];
      
      if (!overrides.includes(name!)) {
        overrides.push(name!);
        skills.overrides = overrides;
        yamlConfig.skills = skills;
        writeFileSync(configPath, stringifyYaml(yamlConfig), 'utf8');
      }
    } catch {
      // Ignore config update errors
    }
  }
  
  if (json) {
    console.log(JSON.stringify({
      success: true,
      skill: name,
      path: localPath
    }, null, 2));
  } else {
    success(`Created local override for: ${name}`);
    listItem('Location', formatPath(localPath));
    console.log('');
    console.log(chalk.dim('Edit the files in this directory to customize the skill.'));
    console.log(chalk.dim('The local version will take priority over the core version.'));
    console.log('');
  }
}

/**
 * Add a skill (placeholder for registry)
 */
async function addSkill(options: SkillOptions): Promise<void> {
  const { json } = options;
  
  if (json) {
    console.log(JSON.stringify({
      success: false,
      error: 'Skill registry not yet implemented',
      hint: 'Core skills are installed automatically. Use "arete skill override" to customize.'
    }));
  } else {
    warn('Skill registry not yet implemented');
    info('Core skills are installed automatically with "arete install"');
    info('Use "arete skill override <name>" to customize a skill');
  }
}

/**
 * Remove a skill (local only)
 */
async function removeSkill(options: SkillOptions): Promise<void> {
  const { name, json } = options;
  
  if (json) {
    console.log(JSON.stringify({
      success: false,
      error: 'Not yet implemented',
      hint: 'To remove an override, delete the folder from .cursor/skills-local/'
    }));
  } else {
    warn('Not yet implemented');
    info(`To remove an override, delete: .cursor/skills-local/${name}/`);
  }
}

/**
 * Route a user query to a skill
 */
async function routeSkill(options: SkillOptions & { query?: string }): Promise<void> {
  const { query, json } = options;

  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
    }
    process.exit(1);
  }

  if (!query?.trim()) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Missing query. Use: arete skill route "<your message>"' }));
    } else {
      error('Missing query');
      info('Example: arete skill route "prep me for my meeting with Jane"');
    }
    process.exit(1);
  }

  const paths = getWorkspacePaths(workspaceRoot);
  const skills = getMergedSkillsForRouting(paths);
  const candidates = skills.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    path: s.path,
    triggers: s.triggers
  }));

  const routed = routeToSkill(query, candidates);

  if (json) {
    console.log(JSON.stringify({
      success: true,
      query: query.trim(),
      route: routed
        ? { skill: routed.skill, path: routed.path, reason: routed.reason }
        : null
    }, null, 2));
    return;
  }

  if (routed) {
    success(`Route to skill: ${routed.skill}`);
    listItem('Path', formatPath(routed.path));
    listItem('Reason', routed.reason);
    console.log('');
    info('Load and execute: .cursor/skills-core/' + routed.skill + '/SKILL.md (or skills-local if overridden)');
  } else {
    warn('No matching skill');
    info('Try: arete skill list');
  }
}

/**
 * Skill command router
 */
export async function skillCommand(action: string, options: SkillOptions): Promise<void> {
  switch (action) {
    case 'list':
      return listSkills(options);
    case 'add':
      return addSkill(options);
    case 'remove':
      return removeSkill(options);
    case 'override':
      return overrideSkill(options);
    case 'route':
      return routeSkill(options);
    default:
      error(`Unknown action: ${action}`);
      process.exit(1);
  }
}

export default skillCommand;
