/**
 * Template commands — resolve, list, view skill templates.
 */

import { createServices, TEMPLATE_REGISTRY, resolveTemplatePath, resolveTemplateContent } from '@arete/core';
import type { Command } from 'commander';
import { join, relative } from 'path';
import { header, section, listItem, error, info } from '../formatters.js';

export function registerTemplateCommands(program: Command): void {
  const templateCmd = program.command('template').description('Resolve and view skill templates');

  // ── arete template resolve ──────────────────────────────────────────────────
  templateCmd
    .command('resolve')
    .description('Resolve and print the active template for a skill variant')
    .requiredOption('--skill <id>', 'Skill ID (e.g. create-prd)')
    .requiredOption('--variant <name>', 'Variant name (e.g. prd-regular)')
    .option('--path', 'Print the resolved file path instead of content')
    .option('--json', 'Output as JSON')
    .action(async (opts: { skill: string; variant: string; path?: boolean; json?: boolean }) => {
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

      const skillId = opts.skill;
      const variant = opts.variant;

      // Validate against registry
      const knownVariants = TEMPLATE_REGISTRY[skillId];
      if (!knownVariants) {
        const known = Object.keys(TEMPLATE_REGISTRY).join(', ');
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: `Unknown skill: ${skillId}. Known skills: ${known}` }));
        } else {
          error(`Unknown skill: ${skillId}`);
          info(`Known skills: ${known}`);
        }
        process.exit(1);
      }

      if (!knownVariants.includes(variant)) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: `Unknown variant '${variant}' for skill '${skillId}'. Known: ${knownVariants.join(', ')}` }));
        } else {
          error(`Unknown variant '${variant}' for skill '${skillId}'`);
          info(`Known variants: ${knownVariants.join(', ')}`);
        }
        process.exit(1);
      }

      if (opts.path) {
        // Print only the resolved path
        const resolvedPath = await resolveTemplatePath(root, skillId, variant);
        if (!resolvedPath) {
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: 'No template found', skill: skillId, variant }));
          } else {
            error(`No template found for ${skillId}/${variant}`);
          }
          process.exit(1);
        }
        if (opts.json) {
          console.log(JSON.stringify({ success: true, skill: skillId, variant, resolvedPath }));
        } else {
          console.log(resolvedPath);
        }
        return;
      }

      // Resolve and return content
      const result = await resolveTemplateContent(root, skillId, variant);
      if (!result) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'No template found', skill: skillId, variant }));
        } else {
          error(`No template found for ${skillId}/${variant}`);
          info('Install or update the workspace to restore skill defaults: arete update');
        }
        process.exit(1);
      }

      const relPath = relative(root, result.path);
      if (opts.json) {
        console.log(JSON.stringify({ success: true, skill: skillId, variant, resolvedPath: result.path, relPath, content: result.content }));
      } else {
        console.log(result.content);
      }
    });

  // ── arete template list ─────────────────────────────────────────────────────
  templateCmd
    .command('list')
    .description('List all known skill templates and their override status')
    .option('--skill <id>', 'Filter to a specific skill')
    .option('--json', 'Output as JSON')
    .action(async (opts: { skill?: string; json?: boolean }) => {
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

      const registry = opts.skill
        ? { [opts.skill]: TEMPLATE_REGISTRY[opts.skill] ?? [] }
        : TEMPLATE_REGISTRY;

      if (opts.skill && !TEMPLATE_REGISTRY[opts.skill]) {
        const known = Object.keys(TEMPLATE_REGISTRY).join(', ');
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: `Unknown skill: ${opts.skill}. Known: ${known}` }));
        } else {
          error(`Unknown skill: ${opts.skill}`);
          info(`Known skills: ${known}`);
        }
        process.exit(1);
      }

      type VariantStatus = { variant: string; resolvedPath: string | null; hasOverride: boolean };
      type SkillEntry = { skill: string; variants: VariantStatus[] };
      const output: SkillEntry[] = [];

      for (const [skillId, variants] of Object.entries(registry)) {
        const skillEntry: SkillEntry = { skill: skillId, variants: [] };
        for (const variant of variants) {
          const resolvedPath = await resolveTemplatePath(root, skillId, variant);
          const overridePath = join(root, 'templates', 'outputs', skillId, `${variant}.md`);
          const hasOverride = resolvedPath === overridePath;
          skillEntry.variants.push({ variant, resolvedPath, hasOverride });
        }
        output.push(skillEntry);
      }

      if (opts.json) {
        console.log(JSON.stringify({ success: true, skills: output }, null, 2));
        return;
      }

      for (const { skill, variants } of output) {
        header(skill);
        for (const { variant, resolvedPath, hasOverride } of variants) {
          const label = hasOverride ? `${variant} [override]` : variant;
          const detail = resolvedPath ? relative(root, resolvedPath) : '(not found)';
          listItem(label, detail, 1);
        }
        console.log('');
      }
    });

  // ── arete template view ─────────────────────────────────────────────────────
  templateCmd
    .command('view')
    .description('View the resolved content of a template')
    .requiredOption('--skill <id>', 'Skill ID (e.g. prepare-meeting-agenda)')
    .requiredOption('--variant <name>', 'Variant name (e.g. one-on-one)')
    .option('--json', 'Output as JSON')
    .action(async (opts: { skill: string; variant: string; json?: boolean }) => {
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

      const knownVariants = TEMPLATE_REGISTRY[opts.skill];
      if (!knownVariants) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: `Unknown skill: ${opts.skill}` }));
        } else {
          error(`Unknown skill: ${opts.skill}`);
          info(`Known skills: ${Object.keys(TEMPLATE_REGISTRY).join(', ')}`);
        }
        process.exit(1);
      }

      if (!knownVariants.includes(opts.variant)) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: `Unknown variant '${opts.variant}' for skill '${opts.skill}'` }));
        } else {
          error(`Unknown variant '${opts.variant}' for skill '${opts.skill}'`);
          info(`Known variants: ${knownVariants.join(', ')}`);
        }
        process.exit(1);
      }

      const result = await resolveTemplateContent(root, opts.skill, opts.variant);
      if (!result) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'No template found', skill: opts.skill, variant: opts.variant }));
        } else {
          error(`No template found for ${opts.skill}/${opts.variant}`);
        }
        process.exit(1);
      }

      const relPath = relative(root, result.path);
      if (opts.json) {
        console.log(JSON.stringify({ success: true, skill: opts.skill, variant: opts.variant, resolvedPath: result.path, relPath, content: result.content }, null, 2));
      } else {
        header(`${opts.skill} / ${opts.variant}`);
        info(`Source: ${relPath}`);
        console.log('');
        console.log(result.content);
      }
    });
}
