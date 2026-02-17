/**
 * SkillService — manages skill discovery and installation.
 *
 * Business logic only. No chalk, inquirer, or other CLI dependencies.
 */

import { join, basename, resolve, relative } from 'path';
import { spawnSync } from 'child_process';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { StorageAdapter } from '../storage/adapter.js';
import type {
  SkillDefinition,
  InstallSkillOptions,
  InstallSkillResult,
  SkillCategory,
  WorkType,
} from '../models/index.js';
import type { WorkspacePaths } from '../models/index.js';

const ARETE_META_FILENAME = '.arete-meta.yaml';

function readSkillFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  try {
    return (parseYaml(match[1]) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

async function readAreteMeta(
  storage: StorageAdapter,
  skillPath: string
): Promise<Record<string, unknown> | null> {
  const metaFile = join(skillPath, ARETE_META_FILENAME);
  const exists = await storage.exists(metaFile);
  if (!exists) return null;
  const content = await storage.read(metaFile);
  if (!content) return null;
  try {
    return (parseYaml(content) as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

export class SkillService {
  constructor(private storage: StorageAdapter) {}

  async list(workspaceRoot: string): Promise<SkillDefinition[]> {
    const skillsDir = join(workspaceRoot, '.agents', 'skills');
    const exists = await this.storage.exists(skillsDir);
    if (!exists) return [];

    const subdirs = await this.storage.listSubdirectories(skillsDir);
    const results: SkillDefinition[] = [];

    for (const skillPath of subdirs) {
      const def = await this.getInfo(skillPath);
      if (def) results.push(def);
    }
    return results;
  }

  async get(
    name: string,
    workspaceRoot: string
  ): Promise<SkillDefinition | null> {
    const skills = await this.list(workspaceRoot);
    return skills.find((s) => s.id === name || s.name === name) ?? null;
  }

  async getInfo(skillPath: string): Promise<SkillDefinition> {
    const id = basename(skillPath);
    const skillFile = join(skillPath, 'SKILL.md');
    const exists = await this.storage.exists(skillFile);
    if (!exists) {
      return {
        id,
        name: id,
        description: '',
        path: skillPath,
        triggers: [],
        category: 'community',
      };
    }

    const content = await this.storage.read(skillFile);
    const frontmatter = content ? readSkillFrontmatter(content) : {};
    const sidecar = await readAreteMeta(this.storage, skillPath);

    const fm = frontmatter as Record<string, unknown>;
    const name = (fm.name as string) || id;
    const description = (fm.description as string) || '';
    const triggers = Array.isArray(fm.triggers) ? (fm.triggers as string[]) : [];
    const primitives = Array.isArray(fm.primitives) ? fm.primitives : undefined;
    const workType = (typeof fm.work_type === 'string'
      ? fm.work_type
      : undefined) as WorkType | undefined;
    const category = (typeof fm.category === 'string'
      ? fm.category
      : (sidecar?.category as SkillCategory) ?? 'community') as SkillCategory;
    const intelligence = Array.isArray(fm.intelligence) ? fm.intelligence : undefined;
    const requiresBriefing =
      typeof fm.requires_briefing === 'boolean' ? fm.requires_briefing : undefined;
    const createsProject =
      typeof fm.creates_project === 'boolean' ? fm.creates_project : undefined;
    const projectTemplate =
      typeof fm.project_template === 'string' ? fm.project_template : undefined;

    const merged = { ...fm, ...sidecar } as Record<string, unknown>;

    return {
      id,
      name,
      description,
      path: skillPath,
      triggers,
      primitives: (merged.primitives as SkillDefinition['primitives']) ?? primitives,
      workType: ((merged.work_type as WorkType) ?? workType) as WorkType | undefined,
      category: (merged.category as SkillCategory) ?? category,
      intelligence: (merged.intelligence as string[]) ?? intelligence,
      requiresBriefing: (merged.requires_briefing as boolean) ?? requiresBriefing,
      createsProject: (merged.creates_project as boolean) ?? createsProject,
      projectTemplate: (merged.project_template as string) ?? projectTemplate,
    };
  }

  async install(
    source: string,
    options: InstallSkillOptions
  ): Promise<InstallSkillResult> {
    const { workspaceRoot } = options;
    if (!workspaceRoot) {
      return {
        installed: false,
        path: '',
        name: '',
        error: 'workspaceRoot required for install',
      };
    }

    const parsed = parseSkillSource(source);
    const paths: WorkspacePaths = {
      root: workspaceRoot,
      manifest: join(workspaceRoot, 'arete.yaml'),
      ideConfig: join(workspaceRoot, '.cursor'),
      rules: join(workspaceRoot, '.cursor', 'rules'),
      agentSkills: join(workspaceRoot, '.agents', 'skills'),
      tools: join(workspaceRoot, '.cursor', 'tools'),
      integrations: join(workspaceRoot, '.cursor', 'integrations'),
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

    if (parsed.type === 'skillssh') {
      const existingSkills = new Set<string>();
      const exists = await this.storage.exists(paths.agentSkills);
      if (exists) {
        const subdirs = await this.storage.listSubdirectories(paths.agentSkills);
        for (const p of subdirs) {
          existingSkills.add(basename(p));
        }
      }

      if (options.name && existingSkills.has(options.name)) {
        return {
          installed: false,
          path: join(paths.agentSkills, options.name),
          name: options.name,
          error: `Skill already installed: ${options.name}`,
        };
      }

      const args = ['skills', 'add', parsed.normalized];
      if (options.name) args.push('--skill', options.name);
      // Always run non-interactively from Areté CLI wrapper.
      args.push('--yes');

      const result = spawnSync('npx', args, {
        cwd: workspaceRoot,
        shell: true,
        encoding: 'utf8',
      });

      if (result.status !== 0) {
        return {
          installed: false,
          path: '',
          name: '',
          error: result.stderr || `npx skills add exited with ${result.status}`,
        };
      }

      let installedPath: string | null = null;
      let installedName: string | null = null;
      if (await this.storage.exists(paths.agentSkills)) {
        const subdirs = await this.storage.listSubdirectories(paths.agentSkills);
        for (const p of subdirs) {
          const name = basename(p);
          if (!existingSkills.has(name)) {
            const metaFile = join(p, ARETE_META_FILENAME);
            const hasMeta = await this.storage.exists(metaFile);
            const skillFile = join(p, 'SKILL.md');
            const hasSkill = await this.storage.exists(skillFile);
            if (hasSkill && !hasMeta) {
              const meta = await this.buildAreteMeta(p);
              await this.storage.write(metaFile, stringifyYaml(meta));
            }
            installedPath = p;
            installedName = name;
            break;
          }
        }
      }

      if (!installedPath || !installedName) {
        const output = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
        return {
          installed: false,
          path: paths.agentSkills,
          name: options.name ?? '',
          error:
            output ||
            'skills add completed but no new skill was detected. Try again with --yes or verify the skill source.',
        };
      }

      return {
        installed: true,
        path: installedPath,
        name: installedName,
      };
    }

    const resolvedSource = resolve(workspaceRoot, source);
    const srcExists = await this.storage.exists(resolvedSource);
    if (!srcExists) {
      return {
        installed: false,
        path: '',
        name: '',
        error: `Path not found: ${source}`,
      };
    }

    let sourceDir: string;
    let skillName: string;
    const skillFileInDir = join(resolvedSource, 'SKILL.md');
    const skillFileExists = await this.storage.exists(skillFileInDir);

    if (skillFileExists) {
      sourceDir = resolvedSource;
      skillName = basename(resolvedSource);
    } else if (basename(resolvedSource) === 'SKILL.md') {
      const parentDir = join(resolvedSource, '..');
      const parentSkillFile = join(parentDir, 'SKILL.md');
      const parentHasSkill = await this.storage.exists(parentSkillFile);
      if (parentHasSkill) {
        sourceDir = parentDir;
        skillName = basename(parentDir);
      } else {
        return {
          installed: false,
          path: '',
          name: '',
          error: 'Local install expects SKILL.md or a directory containing SKILL.md',
        };
      }
    } else {
      return {
        installed: false,
        path: '',
        name: '',
        error: 'Directory must contain SKILL.md',
      };
    }

    const destDir = join(paths.agentSkills, skillName);
    const destExists = await this.storage.exists(destDir);
    if (destExists) {
      return {
        installed: false,
        path: destDir,
        name: skillName,
        error: `Skill already installed: ${skillName}`,
      };
    }

    await this.storage.mkdir(paths.agentSkills);
    if (this.storage.copy) {
      await this.storage.copy(sourceDir, destDir, { recursive: true });
    } else {
      const files = await this.storage.list(sourceDir, { recursive: true });
      for (const f of files) {
        const rel = relative(sourceDir, f);
        const destPath = join(destDir, rel);
        const content = await this.storage.read(f);
        if (content !== null) {
          const parentDir = join(destPath, '..');
          await this.storage.mkdir(parentDir);
          await this.storage.write(destPath, content);
        }
      }
    }

    const metaFile = join(destDir, ARETE_META_FILENAME);
    const meta = await this.buildAreteMeta(destDir);
    await this.storage.write(metaFile, stringifyYaml(meta));

    const info = await this.getInfo(destDir);
    return {
      installed: true,
      path: destDir,
      name: info.name ?? skillName,
    };
  }

  private async buildAreteMeta(skillPath: string): Promise<Record<string, unknown>> {
    const info = await this.getInfo(skillPath);
    const meta: Record<string, unknown> = {
      category: 'community',
      requires_briefing: true,
    };
    if (info.workType) meta.work_type = info.workType;
    if (info.primitives?.length) meta.primitives = info.primitives;
    return meta;
  }
}

function parseSkillSource(
  source: string
): { type: 'skillssh'; normalized: string } | { type: 'local' } {
  if (source.startsWith('.') || source.startsWith('/') || source.startsWith('~')) {
    return { type: 'local' };
  }
  const githubMatch = source.match(
    /^https?:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/
  );
  if (githubMatch) {
    return { type: 'skillssh', normalized: githubMatch[1] };
  }
  const parts = source.split('/');
  if (
    parts.length === 2 &&
    !source.includes('\\') &&
    parts[0] &&
    parts[1]
  ) {
    return { type: 'skillssh', normalized: source };
  }
  return { type: 'local' };
}
