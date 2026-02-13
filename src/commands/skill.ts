/**
 * Skill management commands
 */

import { existsSync, readdirSync, readFileSync, cpSync, mkdirSync, writeFileSync, statSync } from 'fs';
import { join, basename, resolve, sep } from 'path';
import { spawnSync } from 'child_process';
import { createInterface } from 'readline';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import chalk from 'chalk';
import { findWorkspaceRoot, getWorkspacePaths, getSourcePaths } from '../core/workspace.js';
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
  skill?: string;
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

const ARETE_META_FILENAME = '.arete-meta.yaml';

/**
 * Read .arete-meta.yaml sidecar (Phase 4: third-party skill metadata fallback)
 */
function readAreteMeta(skillPath: string): Partial<SkillInfo> | null {
  const metaFile = join(skillPath, ARETE_META_FILENAME);
  if (!existsSync(metaFile)) return null;
  try {
    const content = readFileSync(metaFile, 'utf8');
    const meta = parseYaml(content) as Record<string, unknown>;
    const out: Partial<SkillInfo> = {};
    if (Array.isArray(meta.primitives)) out.primitives = meta.primitives as string[];
    if (typeof meta.work_type === 'string') out.work_type = meta.work_type;
    if (typeof meta.category === 'string') out.category = meta.category;
    if (typeof meta.requires_briefing === 'boolean') out.requires_briefing = meta.requires_briefing;
    if (Array.isArray(meta.triggers)) out.triggers = meta.triggers as string[];
    if (Array.isArray(meta.intelligence)) out.intelligence = meta.intelligence as string[];
    if (typeof meta.creates_project === 'boolean') out.creates_project = meta.creates_project;
    if (typeof meta.project_template === 'string') out.project_template = meta.project_template;
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/**
 * Get skill info from SKILL.md and .arete-meta.yaml (sidecar fallback for extended fields)
 */
function getSkillInfo(skillPath: string): SkillInfo {
  const skillFile = join(skillPath, 'SKILL.md');
  if (!existsSync(skillFile)) {
    return { name: basename(skillPath) };
  }

  let info: SkillInfo = { name: basename(skillPath) };
  try {
    const content = readFileSync(skillFile, 'utf8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (match) {
      const frontmatter = parseYaml(match[1]) as Record<string, unknown>;
      info = {
        name: (frontmatter.name as string) || basename(skillPath),
        description: (frontmatter.description as string) || '',
        type: (frontmatter.type as string) || 'stateless',
        includes: (frontmatter.includes as Record<string, unknown>) || {},
        triggers: Array.isArray(frontmatter.triggers) ? (frontmatter.triggers as string[]) : undefined,
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

  const sidecar = readAreteMeta(skillPath);
  if (sidecar) {
    if (sidecar.primitives !== undefined) info.primitives = sidecar.primitives;
    if (sidecar.work_type !== undefined) info.work_type = sidecar.work_type;
    if (sidecar.category !== undefined) info.category = sidecar.category;
    if (sidecar.requires_briefing !== undefined) info.requires_briefing = sidecar.requires_briefing;
    if (sidecar.triggers !== undefined) info.triggers = sidecar.triggers;
    if (sidecar.intelligence !== undefined) info.intelligence = sidecar.intelligence;
    if (sidecar.creates_project !== undefined) info.creates_project = sidecar.creates_project;
    if (sidecar.project_template !== undefined) info.project_template = sidecar.project_template;
  }

  return info;
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
 * Get skills from .agents/skills for routing.
 * Exported for use by the top-level route command.
 */
export function getMergedSkillsForRouting(paths: ReturnType<typeof getWorkspacePaths>): SkillInfo[] {
  return getSkillsList(paths.agentSkills);
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

/** Skill names (roles) in workspace — used for set-default/unset-default validation. */
export function getDefaultRoleNames(paths: ReturnType<typeof getWorkspacePaths>): string[] {
  if (!existsSync(paths.agentSkills)) return [];
  return readdirSync(paths.agentSkills, { withFileTypes: true })
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
  const allSkills = getSkillsList(paths.agentSkills);
  
  if (json) {
    console.log(JSON.stringify({
      success: true,
      skills: allSkills,
      count: allSkills.length
    }, null, 2));
    return;
  }
  
  header('Available Skills');
  console.log(chalk.dim(`  ${allSkills.length} skill(s) in .agents/skills/`));
  console.log('');
  
  for (const skill of allSkills.sort((a, b) => (a.id || '').localeCompare(b.id || ''))) {
    const typeTag = skill.type === 'lifecycle' ? chalk.dim(' [lifecycle]') : '';
    const displayName = skill.id || skill.name;
    console.log(`  ${chalk.dim('•')} ${chalk.bold(displayName)}${typeTag}`);
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
 * Best-guess work_type from description (for third-party skills)
 * Exported for testing.
 */
export function guessWorkTypeFromDescription(description: string): string | undefined {
  const d = description.toLowerCase();
  if (/\b(prd|requirements?|spec|specification|define)\b/.test(d)) return 'definition';
  if (/\b(discover|research|explore|investigate|understand)\b/.test(d)) return 'discovery';
  if (/\b(analyze|analysis|compare|evaluate|assess)\b/.test(d)) return 'analysis';
  if (/\b(plan|planning|goals?|priorities?|quarter|week|roadmap)\b/.test(d)) return 'planning';
  if (/\b(deliver|launch|ship|release|rollout)\b/.test(d)) return 'delivery';
  if (/\b(sync|save|process|update|finalize|tour|review)\b/.test(d)) return 'operations';
  return undefined;
}

/** Best-guess primitives from description */
function guessPrimitivesFromDescription(description: string): string[] {
  const d = description.toLowerCase();
  const out: string[] = [];
  if (/\b(problem|pain|need|friction|opportunity)\b/.test(d)) out.push('Problem');
  if (/\b(user|persona|customer|segment)\b/.test(d)) out.push('User');
  if (/\b(solution|feature|product)\b/.test(d)) out.push('Solution');
  if (/\b(market|competitor|competitive|landscape)\b/.test(d)) out.push('Market');
  if (/\b(risk|uncertainty|constraint)\b/.test(d)) out.push('Risk');
  return out;
}

/** Write .arete-meta.yaml sidecar for a third-party skill */
function writeAreteMeta(skillPath: string, meta: Record<string, unknown>): void {
  const metaFile = join(skillPath, ARETE_META_FILENAME);
  writeFileSync(metaFile, stringifyYaml(meta), 'utf8');
}

/** 
 * Detect if installed skill overlaps a default role (by work_type or description keywords)
 * Exported for testing.
 */
export function detectOverlapRole(
  installedSkill: SkillInfo,
  _paths: ReturnType<typeof getWorkspacePaths>
): string | undefined {
  const sourcePaths = getSourcePaths();
  const defaultSkills = getSkillsList(sourcePaths.skills);
  const desc = (installedSkill.description ?? '').toLowerCase();
  const skillId = (installedSkill.id ?? '').toLowerCase();
  const workType = installedSkill.work_type ?? guessWorkTypeFromDescription(installedSkill.description ?? '');
  
  // Priority 1: Exact skill name match (e.g., "prd" → "create-prd")
  for (const def of defaultSkills) {
    if (!def.id) continue;
    const defId = def.id.toLowerCase();
    if (skillId === defId || skillId === defId.replace('create-', '') || skillId === defId.replace(/-/g, '')) {
      return def.id;
    }
  }
  
  // Priority 2: Description contains skill name (e.g., "PRD" in description → "create-prd")
  for (const def of defaultSkills) {
    if (!def.id) continue;
    const defName = (def.id ?? '').toLowerCase().replace(/-/g, ' ');
    if (defName && (desc.includes(defName) || desc.includes(def.id ?? ''))) {
      return def.id;
    }
  }
  
  // Priority 3: Specific keyword matches (avoid false positives)
  if (/\b(prd|product requirements)\b/i.test(desc)) {
    const prdSkill = defaultSkills.find(s => s.id === 'create-prd');
    if (prdSkill) return prdSkill.id;
  }
  if (/\b(discover|discovery|research)\b/i.test(desc)) {
    const discSkill = defaultSkills.find(s => s.id === 'discovery');
    if (discSkill) return discSkill.id;
  }
  
  // Priority 4: Work type match (but only if it's not too generic)
  if (workType && workType !== 'operations' && workType !== 'planning') {
    for (const def of defaultSkills) {
      if (!def.id) continue;
      if (def.work_type === workType) {
        return def.id;
      }
    }
  }
  
  return undefined;
}

/**
 * Parse GitHub URL or owner/repo string into normalized owner/repo format.
 * Returns null if input appears to be a local path.
 * 
 * Examples:
 * - "owner/repo" → "owner/repo"
 * - "https://github.com/owner/repo" → "owner/repo"
 * - "https://github.com/owner/repo.git" → "owner/repo"
 * - "https://github.com/owner/repo/tree/main/skills/prd" → null (treated as local; use --skill flag instead)
 * - "./path" → null
 * - "/abs/path" → null
 */
function parseSkillSource(source: string): { type: 'skillssh'; normalized: string } | { type: 'local' } {
  // Local path indicators
  if (source.startsWith('.') || source.startsWith('/') || source.startsWith('~')) {
    return { type: 'local' };
  }

  // GitHub URL patterns - matches github.com/owner/repo (with optional .git and trailing slash, but NO additional path segments)
  const githubUrlMatch = source.match(/^https?:\/\/github\.com\/([^\/]+\/[^\/]+?)(?:\.git)?\/?$/);
  if (githubUrlMatch) {
    return { type: 'skillssh', normalized: githubUrlMatch[1] };
  }

  // owner/repo format (exactly one slash, exactly two parts, no backslashes)
  const parts = source.split('/');
  if (parts.length === 2 && !source.includes('\\') && parts[0] && parts[1]) {
    return { type: 'skillssh', normalized: source };
  }

  // Anything else is treated as local
  return { type: 'local' };
}

/**
 * Install a skill: from skills.sh (owner/repo) or local path.
 * Generates .arete-meta.yaml sidecar and optionally prompts to set as default for a role.
 */
async function installSkill(options: SkillOptions): Promise<void> {
  const { name: source, json, yes } = options;

  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
    }
    process.exit(1);
  }

  if (!source?.trim()) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Missing source. Use: arete skill install <owner/repo> or <path>' }));
    } else {
      error('Missing source');
      info('Examples: arete skill install owner/repo  or  arete skill install ./path/to/skill');
      info('           arete skill install https://github.com/owner/repo');
    }
    process.exit(1);
  }

  const paths = getWorkspacePaths(workspaceRoot);
  const parsed = parseSkillSource(source);
  const isLikelySkillsSh = parsed.type === 'skillssh';

  if (isLikelySkillsSh) {
    // Capture existing skills before running npx skills add
    const existingSkills = new Set<string>();
    if (existsSync(paths.agentSkills)) {
      const entries = readdirSync(paths.agentSkills, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() || e.isSymbolicLink()) {
          existingSkills.add(e.name);
        }
      }
    }
    
    // npx skills add <source> [--skill <name>]
    const normalizedSource = parsed.type === 'skillssh' ? parsed.normalized : source;
    const args = ['skills', 'add', normalizedSource];
    if (options.skill) {
      args.push('--skill', options.skill);
    }
    if (!json) info('Running: npx ' + args.join(' '));
    const result = spawnSync('npx', args, {
      cwd: workspaceRoot,
      shell: true,
      stdio: json ? 'pipe' : 'inherit',
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      if (json) {
        console.log(JSON.stringify({
          success: false,
          error: 'npx skills add failed',
          stderr: result.stderr,
          code: result.status,
        }, null, 2));
      } else {
        error('npx skills add failed');
        if (result.stderr) console.log(result.stderr);
      }
      process.exit(1);
    }
    
    // Find the newly installed skill(s) by comparing before/after
    const newlyInstalledSkills: string[] = [];
    if (existsSync(paths.agentSkills)) {
      const entries = readdirSync(paths.agentSkills, { withFileTypes: true });
      for (const e of entries) {
        if ((e.isDirectory() || e.isSymbolicLink()) && !existingSkills.has(e.name)) {
          newlyInstalledSkills.push(e.name);
        }
      }
    }
    
    // Only add .arete-meta.yaml to the newly installed skill(s)
    let installedPath: string | null = null;
    let installedSkillName: string | null = null;
    
    for (const skillName of newlyInstalledSkills) {
      const skillDir = join(paths.agentSkills, skillName);
      const skillFile = join(skillDir, 'SKILL.md');
      const metaFile = join(skillDir, ARETE_META_FILENAME);
      
      if (existsSync(skillFile) && !existsSync(metaFile)) {
        const skillInfo = getSkillInfo(skillDir);
        const meta: Record<string, unknown> = {
          category: 'community',
          requires_briefing: true,
        };
        const wt = guessWorkTypeFromDescription(skillInfo.description ?? '');
        if (wt) meta.work_type = wt;
        const prims = guessPrimitivesFromDescription(skillInfo.description ?? '');
        if (prims.length) meta.primitives = prims;
        writeAreteMeta(skillDir, meta);
        installedPath = skillDir;
        installedSkillName = skillName;
        if (!json) {
          success(`Added Areté metadata: ${skillName}`);
          listItem('Skill', skillInfo.name ?? skillName);
          if (skillInfo.description) listItem('Description', skillInfo.description);
        }
        // Only process the first newly installed skill for the role prompt
        break;
      }
    }
    if (json) {
      console.log(JSON.stringify({
        success: true,
        source: normalizedSource,
        originalSource: source !== normalizedSource ? source : undefined,
        message: 'Skill installed via skills.sh. Metadata added if skill was found under .agents/skills.',
        path: installedPath ?? undefined,
      }, null, 2));
    } else if (!installedPath) {
      info('Skill was installed by skills.sh. If it appears under .agents/skills, run "arete skill list" to see it.');
      info('To add a skill from a local path: arete skill install ./path/to/skill');
    }
    if (installedPath && !json && !yes) {
      const installedSkillInfo = getSkillInfo(installedPath);
      const role = detectOverlapRole(installedSkillInfo, paths);
      if (role) {
        console.log('');
        info(`This skill appears similar to the default "${role}" skill.`);
        info(`If you set it as default, routing will use your new skill instead.`);
        console.log('');
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>((res) => {
          rl.question(`Replace "${role}" with "${installedSkillName ?? basename(installedPath)}" for routing? [y/N] `, res);
        });
        rl.close();
        if (answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes') {
          await setDefaultSkill({ name: installedSkillInfo.id ?? basename(installedPath), role, json: false });
        }
      }
    }
    return;
  }

  // Local path: copy to .agents/skills/<name>
  const resolvedSource = resolve(workspaceRoot, source);
  if (!existsSync(resolvedSource)) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: `Path not found: ${source}` }));
    } else {
      error(`Path not found: ${source}`);
    }
    process.exit(1);
  }

  const stat = statSync(resolvedSource);
  let sourceDir: string;
  let skillName: string;
  if (stat.isFile()) {
    if (basename(resolvedSource) !== 'SKILL.md') {
      if (json) {
        console.log(JSON.stringify({ success: false, error: 'Local install expects SKILL.md or a directory containing SKILL.md' }));
      } else {
        error('Local install expects SKILL.md or a directory containing SKILL.md');
      }
      process.exit(1);
    }
    sourceDir = join(resolvedSource, '..');
    skillName = basename(sourceDir);
  } else {
    sourceDir = resolvedSource;
    skillName = basename(resolvedSource);
    if (!existsSync(join(sourceDir, 'SKILL.md'))) {
      if (json) {
        console.log(JSON.stringify({ success: false, error: 'Directory must contain SKILL.md' }));
      } else {
        error('Directory must contain SKILL.md');
      }
      process.exit(1);
    }
  }

  const destDir = join(paths.agentSkills, skillName);
  if (existsSync(destDir)) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: `Skill already installed: ${skillName}` }));
    } else {
      error(`Skill already installed: ${skillName}`);
    }
    process.exit(1);
  }

  if (!existsSync(paths.agentSkills)) {
    mkdirSync(paths.agentSkills, { recursive: true });
  }
  cpSync(sourceDir, destDir, { recursive: true, dereference: true });

  const installedSkillInfo = getSkillInfo(destDir);
  const displayName = installedSkillInfo.name ?? skillName;
  const meta: Record<string, unknown> = {
    category: 'community',
    requires_briefing: true,
  };
  const wt = guessWorkTypeFromDescription(installedSkillInfo.description ?? '');
  if (wt) meta.work_type = wt;
  const prims = guessPrimitivesFromDescription(installedSkillInfo.description ?? '');
  if (prims.length) meta.primitives = prims;
  writeAreteMeta(destDir, meta);

  if (json) {
    console.log(JSON.stringify({
      success: true,
      skill: skillName,
      name: displayName,
      description: installedSkillInfo.description,
      path: destDir,
    }, null, 2));
    return;
  }

  success(`Installed skill: ${displayName}`);
  listItem('Location', formatPath(destDir));
  if (installedSkillInfo.description) listItem('Description', installedSkillInfo.description);
  console.log(chalk.dim('  .arete-meta.yaml added (category: community, requires_briefing: true)'));
  console.log('');

  if (!yes) {
    const role = detectOverlapRole(installedSkillInfo, paths);
    if (role) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((res) => {
        rl.question(`Use this skill for role "${role}"? [y/N] `, res);
      });
      rl.close();
      if (answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes') {
        await setDefaultSkill({ name: skillName, role, json: false });
      }
    }
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
      hint: 'To remove a skill, delete the folder from .agents/skills/'
    }));
  } else {
    warn('Not yet implemented');
    info(`To remove a skill, delete: .agents/skills/${name}/`);
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
  
  // Get skills
  const skills = getMergedSkillsForRouting(paths);
  const skillCandidates = skills.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    path: s.path,
    triggers: s.triggers,
    type: 'skill' as const,
    // Extended frontmatter (Phase 3)
    primitives: s.primitives as import('../types.js').ProductPrimitive[] | undefined,
    work_type: s.work_type as import('../types.js').WorkType | undefined,
    category: s.category as import('../types.js').SkillCategory | undefined,
    intelligence: s.intelligence,
    requires_briefing: s.requires_briefing,
    creates_project: s.creates_project,
    project_template: s.project_template,
  }));
  
  // Get tools (Phase 4: Tool Routing)
  const { getMergedToolsForRouting } = await import('./tool.js');
  const tools = getMergedToolsForRouting(paths);
  const toolCandidates = tools.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    path: t.path,
    triggers: t.triggers,
    type: 'tool' as const,
    lifecycle: t.lifecycle,
    duration: t.duration,
    work_type: t.work_type,
    category: t.category,
  }));
  
  // Merge candidates
  const candidates = [...skillCandidates, ...toolCandidates];

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
            type: routed.type,
            action: routed.action,
            primitives: routed.primitives,
            work_type: routed.work_type,
            category: routed.category,
            requires_briefing: routed.requires_briefing,
            resolvedFrom: routed.resolvedFrom,
            lifecycle: routed.lifecycle,
            duration: routed.duration,
          }
        : null
    }, null, 2));
    return;
  }

  if (routed) {
    const isSkill = routed.type === 'skill';
    success(`Route to ${isSkill ? 'skill' : 'tool'}: ${routed.skill}`);
    if (routed.resolvedFrom) {
      listItem('Default for role', `${routed.resolvedFrom} → ${routed.skill}`);
    }
    listItem('Path', formatPath(routed.path));
    listItem('Action', routed.action === 'load' ? 'Load and execute' : 'Activate (creates project)');
    if (routed.lifecycle) {
      listItem('Lifecycle', routed.lifecycle);
    }
    if (routed.duration) {
      listItem('Duration', routed.duration);
    }
    listItem('Reason', routed.reason);
    console.log('');
    if (isSkill) {
      info('Load and execute: .agents/skills/' + routed.skill + '/SKILL.md');
    } else {
      info('Activate tool: ' + routed.path + '/TOOL.md');
    }
  } else {
    warn('No matching skill or tool');
    info('Try: arete skill list or arete tool list');
  }
}

/**
 * Skill command router
 */
export async function skillCommand(action: string, options: SkillOptions): Promise<void> {
  switch (action) {
    case 'list':
      return listSkills(options);
    case 'remove':
      return removeSkill(options);
    case 'install':
      return installSkill(options);
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
