/**
 * Skill management commands
 */

import { existsSync, readdirSync, readFileSync, cpSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, basename } from 'path';
import { createInterface } from 'readline';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import chalk from 'chalk';
import { findWorkspaceRoot, getWorkspacePaths } from '../core/workspace.js';
import { loadConfig, getWorkspaceConfigPath } from '../core/config.js';
import { routeToSkill } from '../core/skill-router.js';
import { success, error, warn, info, header, listItem, formatPath } from '../core/utils.js';
import type { CommandOptions } from '../types.js';

export interface SkillOptions extends CommandOptions {
  name?: string;
  verbose?: boolean;
  yes?: boolean;
  role?: string;
  query?: string;
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
  // Extended frontmatter (Phase 3)
  primitives?: string[];
  work_type?: string;
  category?: string;
  intelligence?: string[];
  requires_briefing?: boolean;
  creates_project?: boolean;
  project_template?: string;
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
        triggers: Array.isArray(frontmatter.triggers) ? (frontmatter.triggers as string[]) : undefined,
        // Extended frontmatter (Phase 3)
        primitives: Array.isArray(frontmatter.primitives) ? (frontmatter.primitives as string[]) : undefined,
        work_type: typeof frontmatter.work_type === 'string' ? frontmatter.work_type : undefined,
        category: typeof frontmatter.category === 'string' ? frontmatter.category : undefined,
        intelligence: Array.isArray(frontmatter.intelligence) ? (frontmatter.intelligence as string[]) : undefined,
        requires_briefing: typeof frontmatter.requires_briefing === 'boolean' ? frontmatter.requires_briefing : undefined,
        creates_project: typeof frontmatter.creates_project === 'boolean' ? frontmatter.creates_project : undefined,
        project_template: typeof frontmatter.project_template === 'string' ? frontmatter.project_template : undefined,
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

/** Apply skills.defaults: if matched role has a preferred skill, resolve to it. */
export function applySkillDefaults(
  routed: import('../core/skill-router.js').RoutedSkill | null,
  mergedSkills: SkillInfo[],
  defaults: Record<string, string | null> | undefined
): import('../core/skill-router.js').RoutedSkill | null {
  if (!routed || !defaults) return routed;
  const preferred = defaults[routed.skill];
  if (preferred === null || preferred === undefined) return routed;
  const resolved = mergedSkills.find(s => s.id === preferred);
  if (!resolved?.path) return routed;
  return {
    ...routed,
    skill: resolved.id ?? preferred,
    path: resolved.path,
    resolvedFrom: routed.skill,
  };
}

/** Default skill names (roles) that Areté ships — used for set-default/unset-default validation. */
export function getDefaultRoleNames(paths: ReturnType<typeof getWorkspacePaths>): string[] {
  if (!existsSync(paths.skillsCore)) return [];
  return readdirSync(paths.skillsCore, { withFileTypes: true })
    .filter(d => (d.isDirectory() || d.isSymbolicLink()) && !d.name.startsWith('_'))
    .map(d => d.name)
    .sort();
}

/**
 * List skills
 */
async function listSkills(options: SkillOptions): Promise<void> {
  const { json, verbose } = options;
  
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
  
  const defaultCount = allSkills.filter(s => s.source === 'core' && !s.overridden).length;
  const customizedCount = allSkills.filter(s => s.overridden).length;
  const thirdPartyCount = allSkills.filter(s => s.source === 'local' && !s.overridden).length;
  console.log(chalk.dim(`  ${defaultCount} default, ${customizedCount} customized, ${thirdPartyCount} third-party`));
  console.log('');
  
  for (const skill of allSkills.sort((a, b) => (a.id || '').localeCompare(b.id || ''))) {
    let badge = '';
    if (skill.overridden) {
      badge = chalk.yellow(' (customized)');
    } else if (skill.source === 'local') {
      badge = chalk.green(' (third-party)');
    }
    
    const typeTag = skill.type === 'lifecycle' ? chalk.dim(' [lifecycle]') : '';
    const displayName = skill.id || skill.name;
    console.log(`  ${chalk.dim('•')} ${chalk.bold(displayName)}${badge}${typeTag}`);
    if (skill.description) {
      console.log(`    ${chalk.dim(skill.description)}`);
    }
    if (verbose) {
      const parts: string[] = [];
      if (skill.primitives?.length) parts.push(`primitives: ${skill.primitives.join(', ')}`);
      if (skill.work_type) parts.push(`work_type: ${skill.work_type}`);
      if (skill.category) parts.push(`category: ${skill.category}`);
      if (parts.length) console.log(`    ${chalk.dim(parts.join(' | '))}`);
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
 * Reset a skill (remove user override, restore default)
 */
async function resetSkill(options: SkillOptions): Promise<void> {
  const { name, json, yes } = options;

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
  const localPath = join(paths.skillsLocal, name!);
  const corePath = join(paths.skillsCore, name!);

  if (!existsSync(localPath)) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: `No local override for skill: ${name}` }));
    } else {
      warn(`No local override for skill: ${name}`);
      info('Only customized skills can be reset. Use "arete skill list" to see overrides.');
    }
    process.exit(1);
  }

  if (!existsSync(corePath)) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: `Skill not in core: ${name}` }));
    } else {
      error(`Skill not in core: ${name}. Resetting would remove it entirely.`);
    }
    process.exit(1);
  }

  // Warn if local differs from core (user has modified)
  const coreFile = join(corePath, 'SKILL.md');
  const localFile = join(localPath, 'SKILL.md');
  if (existsSync(coreFile) && existsSync(localFile)) {
    const coreContent = readFileSync(coreFile, 'utf8');
    const localContent = readFileSync(localFile, 'utf8');
    if (coreContent !== localContent) {
      if (!json) warn('Your customized version differs from the default. Resetting will discard your changes.');
    }
  }

  if (!yes && !json) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question(`Remove override for "${name}" and use default? [y/N] `, resolve);
    });
    rl.close();
    if (answer.trim().toLowerCase() !== 'y' && answer.trim().toLowerCase() !== 'yes') {
      info('Cancelled.');
      return;
    }
  }

  rmSync(localPath, { recursive: true, force: true });

  const configPath = getWorkspaceConfigPath(workspaceRoot);
  if (existsSync(configPath)) {
    try {
      const configContent = readFileSync(configPath, 'utf8');
      const yamlConfig = (parseYaml(configContent) as Record<string, unknown>) || {};
      const skills = (yamlConfig.skills || {}) as Record<string, unknown>;
      const overrides = ((skills.overrides as string[]) || []).filter((s: string) => s !== name);
      skills.overrides = overrides;
      yamlConfig.skills = skills;
      writeFileSync(configPath, stringifyYaml(yamlConfig), 'utf8');
    } catch {
      // Ignore config update errors
    }
  }

  if (json) {
    console.log(JSON.stringify({ success: true, skill: name, message: 'Override removed' }, null, 2));
  } else {
    success(`Reset skill: ${name}. Using default from skills-core.`);
  }
}

/**
 * Show diff between user override and default skill
 */
async function diffSkill(options: SkillOptions): Promise<void> {
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
  const localPath = join(paths.skillsLocal, name!);
  const corePath = join(paths.skillsCore, name!);

  if (!existsSync(localPath)) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: `No local override for skill: ${name}` }));
    } else {
      warn(`No local override for skill: ${name}`);
      info('Use "arete skill override ' + name + '" to create one, then "arete skill diff ' + name + '" to see changes.');
    }
    process.exit(1);
  }

  const coreFile = join(corePath, 'SKILL.md');
  const localFile = join(localPath, 'SKILL.md');
  if (!existsSync(coreFile) || !existsSync(localFile)) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Missing SKILL.md in core or local' }));
    } else {
      error('Missing SKILL.md in default or customized skill.');
    }
    process.exit(1);
  }

  const coreLines = readFileSync(coreFile, 'utf8').split(/\r?\n/);
  const localLines = readFileSync(localFile, 'utf8').split(/\r?\n/);

  // Simple line-by-line diff: compare by index, show - for default-only, + for local-only
  const result: { op: string; line: string; num?: number }[] = [];
  const maxLen = Math.max(coreLines.length, localLines.length);
  for (let i = 0; i < maxLen; i++) {
    const coreLine = i < coreLines.length ? coreLines[i] : undefined;
    const localLine = i < localLines.length ? localLines[i] : undefined;
    if (coreLine === localLine) {
      result.push({ op: ' ', line: coreLine ?? '', num: i + 1 });
    } else {
      if (coreLine !== undefined) result.push({ op: '-', line: coreLine, num: i + 1 });
      if (localLine !== undefined) result.push({ op: '+', line: localLine, num: i + 1 });
    }
  }

  if (json) {
    console.log(JSON.stringify({
      success: true,
      skill: name,
      diff: result.filter(r => r.op !== ' ')
    }, null, 2));
    return;
  }

  header(`Diff: ${name} (default vs your version)`);
  console.log(chalk.dim('  - line from default (skills-core)'));
  console.log(chalk.dim('  + line from your version (skills-local)'));
  console.log('');
  for (const { op, line } of result) {
    if (op === '-') console.log(chalk.red(`  - ${line}`));
    else if (op === '+') console.log(chalk.green(`  + ${line}`));
    else if (line) console.log(chalk.dim(`    ${line}`));
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
 * Show current skill defaults (role → preferred skill)
 */
async function defaultsSkills(options: SkillOptions): Promise<void> {
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
  const config = loadConfig(workspaceRoot);
  const roles = getDefaultRoleNames(paths);
  const defaults = config.skills?.defaults ?? {};

  const table: Record<string, string> = {};
  for (const role of roles) {
    const preferred = defaults[role];
    table[role] = preferred ?? '(default)';
  }

  if (json) {
    console.log(JSON.stringify({ success: true, defaults: table, roles }, null, 2));
    return;
  }

  header('Skill defaults (role → preferred skill)');
  console.log(chalk.dim('  When routing matches a role, this skill is used instead of the Areté default.'));
  console.log('');
  for (const [role, skill] of Object.entries(table).sort(([a], [b]) => a.localeCompare(b))) {
    const value = skill === '(default)' ? chalk.dim('(default)') : chalk.bold(skill);
    console.log(`  ${chalk.dim('•')} ${role} ${chalk.dim('→')} ${value}`);
  }
  console.log('');
}

/**
 * Set preferred skill for a role
 */
async function setDefaultSkill(options: SkillOptions): Promise<void> {
  const { name: skillName, role, json } = options;

  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
    }
    process.exit(1);
  }

  if (!skillName || !role) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Use: arete skill set-default <skill-name> --for <role>' }));
    } else {
      error('Use: arete skill set-default <skill-name> --for <role>');
    }
    process.exit(1);
  }

  const paths = getWorkspacePaths(workspaceRoot);
  const config = loadConfig(workspaceRoot);
  const merged = getMergedSkillsForRouting(paths);
  const roles = getDefaultRoleNames(paths);

  if (!roles.includes(role)) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: `Unknown role: ${role}`, validRoles: roles }));
    } else {
      error(`Unknown role: ${role}`);
      info('Valid roles: ' + roles.join(', '));
    }
    process.exit(1);
  }

  const skillExists = merged.some(s => s.id === skillName);
  if (!skillExists) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: `Skill not found: ${skillName}` }));
    } else {
      error(`Skill not found: ${skillName}`);
      info('Run "arete skill list" to see installed skills.');
    }
    process.exit(1);
  }

  const configPath = getWorkspaceConfigPath(workspaceRoot);
  let yamlConfig: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf8');
      yamlConfig = (parseYaml(content) as Record<string, unknown>) || {};
    } catch {
      // ignore
    }
  }
  const skills = (yamlConfig.skills || {}) as Record<string, unknown>;
  const defaults = (skills.defaults as Record<string, string | null>) || {};
  defaults[role] = skillName;
  skills.defaults = defaults;
  yamlConfig.skills = skills;

  if (!existsSync(join(workspaceRoot))) {
    // ensure parent dir exists for arete.yaml
  }
  writeFileSync(configPath, stringifyYaml(yamlConfig), 'utf8');

  if (json) {
    console.log(JSON.stringify({ success: true, role, skill: skillName }, null, 2));
  } else {
    success(`Default for role "${role}" set to: ${skillName}`);
  }
}

/**
 * Unset preferred skill for a role (restore Areté default)
 */
async function unsetDefaultSkill(options: SkillOptions): Promise<void> {
  const { name: role, json } = options;

  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
    }
    process.exit(1);
  }

  if (!role) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Use: arete skill unset-default <role>' }));
    } else {
      error('Use: arete skill unset-default <role>');
    }
    process.exit(1);
  }

  const configPath = getWorkspaceConfigPath(workspaceRoot);
  if (!existsSync(configPath)) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: `No custom default for role: ${role}` }));
    } else {
      warn(`No custom default for role: ${role}`);
    }
    return;
  }

  let yamlConfig: Record<string, unknown> = {};
  try {
    const content = readFileSync(configPath, 'utf8');
    yamlConfig = (parseYaml(content) as Record<string, unknown>) || {};
  } catch {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Could not read arete.yaml' }));
    } else {
      error('Could not read arete.yaml');
    }
    process.exit(1);
  }

  const skills = (yamlConfig.skills || {}) as Record<string, unknown>;
  const defaults = (skills.defaults as Record<string, string | null>) || {};
  if (!(role in defaults)) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: `No custom default for role: ${role}` }));
    } else {
      warn(`No custom default for role: ${role}`);
    }
    return;
  }
  delete defaults[role];
  if (Object.keys(defaults).length === 0) {
    delete skills.defaults;
  } else {
    skills.defaults = defaults;
  }
  yamlConfig.skills = skills;
  writeFileSync(configPath, stringifyYaml(yamlConfig), 'utf8');

  if (json) {
    console.log(JSON.stringify({ success: true, role, message: 'Restored Areté default' }, null, 2));
  } else {
    success(`Restored Areté default for role: ${role}`);
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
  const config = loadConfig(workspaceRoot);
  const skills = getMergedSkillsForRouting(paths);
  const candidates = skills.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    path: s.path,
    triggers: s.triggers,
    // Extended frontmatter (Phase 3)
    primitives: s.primitives as import('../types.js').ProductPrimitive[] | undefined,
    work_type: s.work_type as import('../types.js').WorkType | undefined,
    category: s.category as import('../types.js').SkillCategory | undefined,
    intelligence: s.intelligence,
    requires_briefing: s.requires_briefing,
    creates_project: s.creates_project,
    project_template: s.project_template,
  }));

  let routed = routeToSkill(query, candidates);
  routed = applySkillDefaults(routed, skills, config.skills?.defaults);

  if (json) {
    console.log(JSON.stringify({
      success: true,
      query: query.trim(),
      route: routed
        ? {
            skill: routed.skill,
            path: routed.path,
            reason: routed.reason,
            primitives: routed.primitives,
            work_type: routed.work_type,
            category: routed.category,
            requires_briefing: routed.requires_briefing,
            resolvedFrom: routed.resolvedFrom,
          }
        : null
    }, null, 2));
    return;
  }

  if (routed) {
    success(`Route to skill: ${routed.skill}`);
    if (routed.resolvedFrom) {
      listItem('Default for role', `${routed.resolvedFrom} → ${routed.skill}`);
    }
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
    case 'reset':
      return resetSkill(options);
    case 'diff':
      return diffSkill(options);
    case 'defaults':
      return defaultsSkills(options);
    case 'set-default':
      return setDefaultSkill(options);
    case 'unset-default':
      return unsetDefaultSkill(options);
    case 'route':
      return routeSkill(options);
    default:
      error(`Unknown action: ${action}`);
      process.exit(1);
  }
}

export default skillCommand;
