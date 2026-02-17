/**
 * Skill commands — list, install, route, defaults, set-default, unset-default
 */

import {
  createServices,
  loadConfig,
  getWorkspaceConfigPath,
  getPackageRoot,
  getSourcePaths,
} from '@arete/core';
import type { Command } from 'commander';
import chalk from 'chalk';
import type { SkillCandidate } from '@arete/core';
import {
  header,
  listItem,
  success,
  error,
  warn,
  info,
  formatPath,
} from '../formatters.js';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export function registerSkillCommands(program: Command): void {
  const skillCmd = program
    .command('skill')
    .alias('skills')
    .description('Manage skills');

  skillCmd
    .command('list')
    .description('List available and installed skills')
    .option('--json', 'Output as JSON')
    .option('--verbose', 'Show primitives, work_type, category')
    .action(async (opts: { json?: boolean; verbose?: boolean }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      if (!root) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        } else {
          error('Not in an Areté workspace');
        }
        process.exit(1);
      }

      const skills = await services.skills.list(root);

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              skills: skills.map((s) => ({
                id: s.id,
                name: s.name,
                description: s.description,
                path: s.path,
                triggers: s.triggers,
                primitives: s.primitives,
                work_type: s.workType,
                category: s.category,
              })),
              count: skills.length,
            },
            null,
            2,
          ),
        );
        return;
      }

      header('Available Skills');
      console.log(chalk.dim(`  ${skills.length} skill(s) in .agents/skills/`));
      console.log('');
      for (const skill of skills.sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''))) {
        const displayName = skill.id || skill.name;
        console.log(`  ${chalk.dim('•')} ${chalk.bold(displayName)}`);
        if (skill.description) {
          console.log(`    ${chalk.dim(skill.description)}`);
        }
        if (opts.verbose) {
          const parts: string[] = [];
          if (skill.primitives?.length)
            parts.push(`primitives: ${skill.primitives.join(', ')}`);
          if (skill.workType) parts.push(`work_type: ${skill.workType}`);
          if (skill.category) parts.push(`category: ${skill.category}`);
          if (parts.length)
            console.log(`    ${chalk.dim(parts.join(' | '))}`);
        }
      }
      console.log('');
    });

  const installSkillAction = async (
    source: string,
    opts: { skill?: string; json?: boolean; yes?: boolean },
  ): Promise<void> => {
    const services = await createServices(process.cwd());
    const root = await services.workspace.findRoot();
    if (!root) {
      if (opts.json) {
        console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
      } else {
        error('Not in an Areté workspace');
      }
      process.exit(1);
    }

    const result = await services.skills.install(source, {
      source,
      workspaceRoot: root,
      name: opts.skill,
      yes: opts.yes,
    });

    if (!result.installed) {
      if (opts.json) {
        console.log(
          JSON.stringify({ success: false, error: result.error }, null, 2),
        );
      } else {
        error(result.error ?? 'Install failed');
      }
      process.exit(1);
    }

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            success: true,
            skill: result.name,
            path: result.path,
          },
          null,
          2,
        ),
      );
      return;
    }

    success(`Installed skill: ${result.name}`);
    listItem('Location', formatPath(result.path));
    console.log('');

    if (opts.yes) {
      return;
    }

    const installedSkill = await services.skills.get(result.name, root);
    if (!installedSkill) {
      return;
    }

    const overlapRole = await detectOverlapRole(
      services,
      installedSkill.id,
      installedSkill.description,
      installedSkill.workType,
    );

    if (!overlapRole || overlapRole === installedSkill.id) {
      return;
    }

    info(`This skill appears similar to the default "${overlapRole}" skill.`);
    info('If you set it as default, routing will use your new skill instead.');

    const rl = createInterface({ input, output });
    const answer = await rl.question(
      `Replace "${overlapRole}" with "${installedSkill.id}" for routing? [y/N] `,
    );
    rl.close();

    const normalized = answer.trim().toLowerCase();
    if (normalized !== 'y' && normalized !== 'yes') {
      return;
    }

    await setSkillDefault(services.storage, root, overlapRole, installedSkill.id);
    success(`Default for role "${overlapRole}" set to: ${installedSkill.id}`);
  };

  skillCmd
    .command('install <source>')
    .description('Install a skill from skills.sh (owner/repo) or local path')
    .option('--skill <name>', 'For multi-skill repos: specify which skill')
    .option('--json', 'Output as JSON')
    .option('--yes', 'Skip prompts')
    .action(installSkillAction);

  skillCmd
    .command('add <source>')
    .description('Alias for "skill install"')
    .option('--skill <name>', 'For multi-skill repos: specify which skill')
    .option('--json', 'Output as JSON')
    .option('--yes', 'Skip prompts')
    .action(installSkillAction);

  skillCmd
    .command('route <query>')
    .description('Route a message to the best-matching skill')
    .option('--json', 'Output as JSON')
    .action(async (query: string, opts: { json?: boolean }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      if (!root) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        } else {
          error('Not in an Areté workspace');
        }
        process.exit(1);
      }

      if (!query?.trim()) {
        if (opts.json) {
          console.log(
            JSON.stringify({
              success: false,
              error: 'Missing query. Use: arete skill route "<message>"',
            }),
          );
        } else {
          error('Missing query');
          info('Example: arete skill route "prep me for my meeting with Jane"');
        }
        process.exit(1);
      }

      const skills = await services.skills.list(root);
      const candidates: SkillCandidate[] = skills.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        path: s.path,
        triggers: s.triggers,
        type: 'skill' as const,
        primitives: s.primitives,
        work_type: s.workType,
        category: s.category,
        intelligence: s.intelligence,
        requires_briefing: s.requiresBriefing,
      }));

      const routed = services.intelligence.routeToSkill(query, candidates);

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              query: query.trim(),
              route: routed
                ? {
                    skill: routed.skill,
                    path: routed.path,
                    reason: routed.reason,
                    type: routed.type,
                    action: routed.action,
                  }
                : null,
            },
            null,
            2,
          ),
        );
        return;
      }

      if (routed) {
        const isSkill = routed.type === 'skill';
        success(`Route to ${isSkill ? 'skill' : 'tool'}: ${routed.skill}`);
        listItem('Path', formatPath(routed.path));
        listItem('Action', routed.action === 'load' ? 'Load and execute' : 'Activate');
        listItem('Reason', routed.reason);
        console.log('');
      } else {
        warn('No matching skill or tool');
        info('Try: arete skill list');
      }
    });

  skillCmd
    .command('defaults')
    .description('Show which roles have custom skill assignments')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      if (!root) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        } else {
          error('Not in an Areté workspace');
        }
        process.exit(1);
      }

      const roles = getDefaultRoleNames(services.workspace.getPaths(root));
      const config = await loadConfig(services.storage, root) as { skills?: { defaults?: Record<string, string | null> } };
      const defaults = config.skills?.defaults ?? {};
      const table: Record<string, string> = {};
      for (const role of roles) {
        table[role] = defaults[role] ?? '(default)';
      }

      if (opts.json) {
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
    });

  skillCmd
    .command('set-default <skill-name>')
    .description('Use this skill for a role when routing')
    .requiredOption('--for <role>', 'Role to assign')
    .option('--json', 'Output as JSON')
    .action(
      async (
        skillName: string,
        opts: { for?: string; json?: boolean },
      ) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
          } else {
            error('Not in an Areté workspace');
          }
          process.exit(1);
        }

        const role = opts.for;
        if (!skillName || !role) {
          if (opts.json) {
            console.log(
              JSON.stringify({
                success: false,
                error: 'Use: arete skill set-default <skill-name> --for <role>',
              }),
            );
          } else {
            error('Use: arete skill set-default <skill-name> --for <role>');
          }
          process.exit(1);
        }

        const paths = services.workspace.getPaths(root);
        const roles = getDefaultRoleNames(paths);
        if (!roles.includes(role)) {
          if (opts.json) {
            console.log(
              JSON.stringify({ success: false, error: `Unknown role: ${role}`, validRoles: roles }),
            );
          } else {
            error(`Unknown role: ${role}`);
            info('Valid roles: ' + roles.join(', '));
          }
          process.exit(1);
        }

        const skills = await services.skills.list(root);
        const skillExists = skills.some((s) => s.id === skillName);
        if (!skillExists) {
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: `Skill not found: ${skillName}` }));
          } else {
            error(`Skill not found: ${skillName}`);
            info('Run "arete skill list" to see installed skills.');
          }
          process.exit(1);
        }

        const configPath = getWorkspaceConfigPath(root);
        const config = await loadYamlConfig(services.storage, configPath);
        const skillsSection = (config.skills || {}) as Record<string, unknown>;
        const defaults = (skillsSection.defaults as Record<string, string | null>) || {};
        defaults[role] = skillName;
        skillsSection.defaults = defaults;
        config.skills = skillsSection;
        await services.storage.write(configPath, stringifyYaml(config));

        if (opts.json) {
          console.log(JSON.stringify({ success: true, role, skill: skillName }, null, 2));
        } else {
          success(`Default for role "${role}" set to: ${skillName}`);
        }
      },
    );

  skillCmd
    .command('unset-default <role>')
    .description('Restore Areté default for a role')
    .option('--json', 'Output as JSON')
    .action(async (role: string, opts: { json?: boolean }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      if (!root) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        } else {
          error('Not in an Areté workspace');
        }
        process.exit(1);
      }

      if (!role) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Use: arete skill unset-default <role>' }));
        } else {
          error('Use: arete skill unset-default <role>');
        }
        process.exit(1);
      }

      const configPath = getWorkspaceConfigPath(root);
      const exists = await services.storage.exists(configPath);
      if (!exists) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: `No custom default for role: ${role}` }));
        } else {
          warn(`No custom default for role: ${role}`);
        }
        return;
      }

      const config = await loadYamlConfig(services.storage, configPath);
      const skillsSection = (config.skills || {}) as Record<string, unknown>;
      const defaults = (skillsSection.defaults as Record<string, string | null>) || {};
      if (!(role in defaults)) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: `No custom default for role: ${role}` }));
        } else {
          warn(`No custom default for role: ${role}`);
        }
        return;
      }
      delete defaults[role];
      if (Object.keys(defaults).length === 0) {
        delete skillsSection.defaults;
      } else {
        skillsSection.defaults = defaults;
      }
      config.skills = skillsSection;
      await services.storage.write(configPath, stringifyYaml(config));

      if (opts.json) {
        console.log(JSON.stringify({ success: true, role, message: 'Restored Areté default' }, null, 2));
      } else {
        success(`Restored Areté default for role: ${role}`);
      }
    });
}

async function setSkillDefault(
  storage: { read: (p: string) => Promise<string | null>; write: (p: string, c: string) => Promise<void> },
  workspaceRoot: string,
  role: string,
  skillName: string,
): Promise<void> {
  const configPath = getWorkspaceConfigPath(workspaceRoot);
  const config = await loadYamlConfig(storage, configPath);
  const skillsSection = (config.skills || {}) as Record<string, unknown>;
  const defaults = (skillsSection.defaults as Record<string, string | null>) || {};
  defaults[role] = skillName;
  skillsSection.defaults = defaults;
  config.skills = skillsSection;
  await storage.write(configPath, stringifyYaml(config));
}

export function detectOverlapRoleFromCandidates(
  installedSkillId: string,
  installedDescription: string,
  installedWorkType: string | undefined,
  candidates: Array<{ id: string; workType?: string }>,
): string | undefined {
  const skillId = installedSkillId.toLowerCase();
  const description = installedDescription.toLowerCase();

  for (const candidate of candidates) {
    const candidateId = candidate.id.toLowerCase();
    if (
      skillId === candidateId ||
      skillId === candidateId.replace('create-', '') ||
      skillId === candidateId.replace(/-/g, '')
    ) {
      return candidate.id;
    }
  }

  for (const candidate of candidates) {
    const candidateText = candidate.id.toLowerCase().replace(/-/g, ' ');
    if (candidateText && (description.includes(candidateText) || description.includes(candidate.id.toLowerCase()))) {
      return candidate.id;
    }
  }

  if (/\b(prd|product requirements?)\b/i.test(description)) {
    const prdRole = candidates.find((c) => c.id === 'create-prd');
    if (prdRole) return prdRole.id;
  }

  if (/\b(discover|discovery|research)\b/i.test(description)) {
    const discoveryRole = candidates.find((c) => c.id === 'discovery');
    if (discoveryRole) return discoveryRole.id;
  }

  if (installedWorkType && installedWorkType !== 'operations' && installedWorkType !== 'planning') {
    const workTypeMatch = candidates.find((c) => c.workType === installedWorkType);
    if (workTypeMatch) return workTypeMatch.id;
  }

  return undefined;
}

async function detectOverlapRole(
  services: { skills: { getInfo: (skillPath: string) => Promise<{ id: string; workType?: string }> } },
  installedSkillId: string,
  installedDescription: string,
  installedWorkType: string | undefined,
): Promise<string | undefined> {
  const packageRoot = getPackageRoot();
  const useRuntime = !packageRoot.includes('node_modules');
  const sourcePaths = getSourcePaths(packageRoot, useRuntime);

  if (!existsSync(sourcePaths.skills)) {
    return undefined;
  }

  const candidates: Array<{ id: string; workType?: string }> = [];
  const roleDirs = readdirSync(sourcePaths.skills, { withFileTypes: true })
    .filter((entry) => (entry.isDirectory() || entry.isSymbolicLink()) && !entry.name.startsWith('_'));

  for (const role of roleDirs) {
    const rolePath = join(sourcePaths.skills, role.name);
    const info = await services.skills.getInfo(rolePath);
    candidates.push({
      id: info.id || basename(rolePath),
      workType: info.workType,
    });
  }

  return detectOverlapRoleFromCandidates(
    installedSkillId,
    installedDescription,
    installedWorkType,
    candidates,
  );
}

function getDefaultRoleNames(paths: { agentSkills: string }): string[] {
  if (!existsSync(paths.agentSkills)) return [];
  return readdirSync(paths.agentSkills, { withFileTypes: true })
    .filter((d: { isDirectory: () => boolean; isSymbolicLink: () => boolean }) => d.isDirectory() || d.isSymbolicLink())
    .filter((d: { name: string }) => !d.name.startsWith('_'))
    .map((d: { name: string }) => d.name)
    .sort();
}

async function loadYamlConfig(
  storage: { read: (p: string) => Promise<string | null> },
  configPath: string,
): Promise<Record<string, unknown>> {
  const content = await storage.read(configPath);
  if (!content) return { schema: 1 };
  try {
    return (parseYaml(content) as Record<string, unknown>) ?? { schema: 1 };
  } catch {
    return { schema: 1 };
  }
}
