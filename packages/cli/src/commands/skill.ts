/**
 * Skill commands — list, install, route, defaults, set-default, unset-default
 */

import {
  createServices,
  loadConfig,
  getWorkspaceConfigPath,
  getPackageRoot,
  getSourcePaths,
  listTools,
} from '@arete/core';
import type { Command } from 'commander';
import chalk from 'chalk';
import type { SkillCandidate } from '@arete/core';
import { toolsToCandidates } from '../lib/tool-candidates.js';
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

    // Fetch skill info once — used for JSON output, integration guidance, and overlap detection.
    const installedSkill = await services.skills.get(result.name, root);
    const integration = installedSkill?.integration;

    if (opts.json) {
      const integrationSummary = integration?.outputs?.length
        ? {
            outputs: integration.outputs.map((o) => ({
              type: o.type,
              ...(o.path !== undefined ? { path: o.path } : {}),
              ...(o.index !== undefined ? { index: o.index } : {}),
            })),
          }
        : undefined;
      console.log(
        JSON.stringify(
          {
            success: true,
            skill: result.name,
            path: result.path,
            ...(integrationSummary ? { integration: integrationSummary } : {}),
          },
          null,
          2,
        ),
      );
      return;
    }

    success(`Installed skill: ${result.name}`);
    listItem('Location', formatPath(result.path));

    // Print integration summary when the skill has an integration profile.
    if (integration?.outputs?.length) {
      const firstOutput = integration.outputs[0];
      console.log('');
      listItem('Output type', firstOutput.type);
      if (firstOutput.path) {
        listItem('Output path', firstOutput.path);
      }
      if (integration.outputs.some((o) => o.index)) {
        info('Run `arete index` after using this skill to keep search up to date.');
      }
    }

    console.log('');
    // Guidance is always printed — even with --yes (it's informational, not interactive).
    const skillDirName = basename(result.path);
    info(
      `Edit .agents/skills/${skillDirName}/.arete-meta.yaml to customize integration, or ask an agent to help set it up.`,
    );
    console.log('');

    if (opts.yes) {
      return;
    }

    // installedSkill may be null if the skill dir vanished; guard before overlap detection.
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

      const paths = services.workspace.getPaths(root);
      const tools = await listTools(services.storage, paths.tools);
      candidates.push(...toolsToCandidates(tools));

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

  const setDefaultCmd = skillCmd
    .command('set-default <skill-name>')
    .description('Use this skill for a role when routing')
    .addHelpText(
      'after',
      '\nNote: This changes routing preference only. It does not protect native skill files from `arete update`.\nTo preserve local edits to a native skill, add it to `skills.overrides` in arete.yaml.\n',
    )
    .requiredOption('--for <role>', 'Role to assign')
    .option('--json', 'Output as JSON');

  setDefaultCmd.action(
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

  // Skill prose resolver (Phase 2 legacy routing + Phase 3 two-tier dirs).
  //
  // Resolution order:
  //   1. Pick the active skill directory: `.agents/skills/<slug>/`
  //      (user) wins; otherwise `.arete/skills/<slug>/` (managed).
  //   2. Within that directory, honor `ARETE_LEGACY_SKILL_PROSE` to
  //      route to SKILL.legacy.md when listed and present.
  //
  // Used by chef-orchestrator skill prose for shell-substitution-style
  // path discovery. Once Phase 3 Step 9 (MC5 sunset) lands, the legacy
  // routing branch is removed but the two-tier dir resolution stays.
  skillCmd
    .command('resolve <slug>')
    .description('Resolve which SKILL.md to load (.agents wins over .arete; honors ARETE_LEGACY_SKILL_PROSE)')
    .option('--json', 'Output as JSON')
    .action(async (slug: string, opts: { json?: boolean }) => {
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

      const { resolveSkillFileTwoTier } = await import('@arete/core');
      const result = await resolveSkillFileTwoTier(
        root,
        slug,
        (p: string) => existsSync(p),
      );

      if (result.tier === 'missing') {
        if (opts.json) {
          console.log(
            JSON.stringify({
              success: false,
              error: `Skill not installed: ${slug}`,
              path: null,
              tier: 'missing',
              userDir: result.userDir,
              managedDir: result.managedDir,
            }),
          );
        } else {
          error(`Skill not installed: ${slug}`);
          info(`Looked at: ${formatPath(result.userDir)}`);
          info(`         : ${formatPath(result.managedDir)}`);
        }
        process.exit(1);
      }

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              slug,
              path: result.path,
              tier: result.tier,
              userDir: result.userDir,
              managedDir: result.managedDir,
              legacyRequested: result.legacyRequested,
              legacyUsed: result.legacyUsed,
              warning: result.warning ?? null,
            },
            null,
            2,
          ),
        );
        return;
      }

      // Human output: print the path on stdout for shell-substitution use.
      console.log(result.path);
      if (result.warning) {
        warn(result.warning);
      } else if (result.legacyUsed) {
        info(`Using legacy SKILL.md for ${slug} (ARETE_LEGACY_SKILL_PROSE)`);
      }
    });

  // Phase 3 Step 3 — `arete skill fork <name>`
  //
  // Copy `.arete/skills/<name>/` (managed) into `.agents/skills/<name>/`
  // and snapshot the managed content into the fork's `.fork-base/`. The
  // fork wins at agent-load time; subsequent `arete update` will not
  // overwrite it. Idempotent: re-running on an existing fork prints a
  // warning unless `--force` is passed.
  skillCmd
    .command('fork <slug>')
    .description('Copy a managed skill into .agents/skills/ for editing (Phase 3)')
    .option('--force', 'Re-record .fork-base from current managed content (overwrites recorded base, NOT the fork SKILL.md)')
    .option('--json', 'Output as JSON')
    .action(async (slug: string, opts: { force?: boolean; json?: boolean }) => {
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
      const { forkSkill } = await import('@arete/core');
      const result = await forkSkill(services.storage, {
        workspaceRoot: root,
        name: slug,
        force: opts.force,
      });
      if (!result.ok) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: result.error }));
        } else {
          error(result.error ?? 'Fork failed');
        }
        process.exit(1);
      }
      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              slug,
              forkPath: result.forkPath,
              managedPath: result.managedPath,
              alreadyExisted: result.alreadyExisted,
              baseHash: result.baseHash ?? null,
            },
            null,
            2,
          ),
        );
        return;
      }
      if (result.alreadyExisted) {
        warn(`Fork already exists at ${formatPath(result.forkPath)}`);
        info('Pass --force to refresh the recorded fork base from current managed content.');
        info('(--force does NOT overwrite your fork SKILL.md.)');
        return;
      }
      success(`Forked ${slug} → ${formatPath(result.forkPath)}`);
      listItem('Managed source', formatPath(result.managedPath));
      if (result.baseHash) listItem('Base SKILL.md sha256', result.baseHash.slice(0, 16) + '…');
      console.log('');
      info(`Run \`arete skill diff ${slug}\` after \`arete update\` to see upstream changes.`);
      info(`Run \`arete skill merge ${slug}\` to integrate them.`);
    });

  // Phase 3 Step 5 — `arete skill diff <name>`
  //
  // Section-level markdown diff between the user fork's recorded
  // `.fork-base/SKILL.md` and the current `.arete/skills/<name>/SKILL.md`.
  // Shows what upstream has changed since the user forked. Pure
  // computation — no LLM, no fancy ranking.
  skillCmd
    .command('diff <slug>')
    .description('Show upstream changes since fork base (markdown sections; deterministic)')
    .option('--json', 'Output as JSON')
    .action(async (slug: string, opts: { json?: boolean }) => {
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
      const { diffSkill, formatMarkdownDiff } = await import('@arete/core');
      const result = await diffSkill(services.storage, root, slug);
      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              slug,
              upToDate: result.upToDate,
              baseMissing: result.baseMissing,
              forkPath: result.forkPath,
              managedPath: result.managedPath,
              basePath: result.basePath,
              diff: result.diff,
            },
            null,
            2,
          ),
        );
        return;
      }
      header(`Skill diff: ${slug}`);
      if (result.baseMissing) {
        warn('No fork base recorded for this skill.');
        info(`Run \`arete skill fork ${slug} --force\` to record the current managed content as the base.`);
        info('Until then, diff cannot show "what changed since you forked" — use `git diff` against your last commit instead.');
        return;
      }
      if (result.upToDate) {
        success(`No upstream changes since fork base.`);
        return;
      }
      console.log(formatMarkdownDiff(result.diff));
      info(`Run \`arete skill merge ${slug}\` to integrate (or \`--interactive\` to walk hunks).`);
    });

  // Phase 3 Step 6 — `arete skill merge <name> [--interactive]`
  //
  // Three-way merge of base + user fork + new managed content. Non-
  // conflicting hunks apply automatically; conflicts land as git-style
  // markers in the user fork's SKILL.md. The user resolves manually
  // and re-runs `arete skill merge` to advance the fork base. With
  // `--interactive`, prompt per-hunk for accept / keep-local /
  // take-incoming / skip.
  skillCmd
    .command('merge <slug>')
    .description('Integrate upstream changes into your fork (conflicts land as git-style markers)')
    .option('--interactive', 'Prompt per hunk: y/n/keep-local/take-incoming')
    .option('--json', 'Output as JSON')
    .action(async (slug: string, opts: { interactive?: boolean; json?: boolean }) => {
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
      const { mergeSkill } = await import('@arete/core');

      // Build the per-hunk callback for --interactive mode.
      let onHunk: undefined | ((hunk: { heading: string; kind: string }) => Promise<'accept' | 'keep-local' | 'take-incoming' | 'skip'>);
      let rl: ReturnType<typeof createInterface> | undefined;
      if (opts.interactive && !opts.json) {
        rl = createInterface({ input, output });
        onHunk = async (hunk) => {
          // Skip prompting on trivially clean hunks — the auto result
          // is already what the user wants. Prompt only on changes
          // that touch managed-side updates or conflicts.
          if (
            hunk.kind === 'unchanged' ||
            hunk.kind === 'local-only' ||
            hunk.kind === 'local-add' ||
            hunk.kind === 'both-agree' ||
            hunk.kind === 'local-keep-removed'
          ) {
            return 'accept';
          }
          console.log('');
          console.log(chalk.bold(`Hunk: ${hunk.heading}`));
          console.log(chalk.dim(`Kind: ${hunk.kind}`));
          const ans = (await rl!.question('  [a]ccept / [k]eep-local / [t]ake-incoming / [s]kip? '))
            .trim()
            .toLowerCase();
          if (ans.startsWith('k')) return 'keep-local';
          if (ans.startsWith('t')) return 'take-incoming';
          if (ans.startsWith('s')) return 'skip';
          return 'accept';
        };
      }

      const result = await mergeSkill(services.storage, {
        workspaceRoot: root,
        name: slug,
        onHunk,
      });
      if (rl) rl.close();

      if (!result.ran) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: result.error }));
        } else {
          error(result.error ?? 'Merge could not run');
        }
        process.exit(1);
      }
      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              slug,
              clean: result.clean,
              conflicts: result.conflicts,
              hunks: result.hunks,
              baseUpdated: result.baseUpdated,
              baseHash: result.baseHash ?? null,
            },
            null,
            2,
          ),
        );
        return;
      }
      if (result.clean) {
        success(`Merged upstream into ${slug} (no conflicts).`);
        if (result.baseUpdated && result.baseHash) {
          listItem('New base', result.baseHash.slice(0, 16) + '…');
        }
      } else {
        warn(`${result.conflicts.length} conflict(s) in ${slug}:`);
        for (const heading of result.conflicts) {
          listItem('Conflict in', heading);
        }
        info('The fork SKILL.md now contains git-style markers. Resolve manually, then re-run `arete skill merge` to advance the fork base.');
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
  const sourcePaths = getSourcePaths(packageRoot);

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
