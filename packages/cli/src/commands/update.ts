/**
 * arete update — pull latest skills/tools/integrations
 */

import { createServices, getPackageRoot, getSourcePaths, ensureQmdCollections, loadConfig, GoalMigrationService } from '@arete/core';
import { join } from 'node:path';
import type { Command } from 'commander';
import chalk from 'chalk';
import { header, listItem, success, error, info, warn } from '../formatters.js';

export function registerUpdateCommand(program: Command): void {
  program
    .command('update')
    .description('Pull latest skills/tools/integrations from upstream')
    .option('--check', 'Check for updates without applying')
    .option('--ide <target>', 'Override IDE target (cursor or claude) — useful for adding a second IDE')
    .option('--skip-qmd', 'Skip automatic qmd index update')
    .option('--json', 'Output as JSON')
    .action(async (opts: { check?: boolean; ide?: string; skipQmd?: boolean; json?: boolean }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      if (!root) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        } else {
          error('Not in an Areté workspace');
          info('Run "arete install" to create a workspace first');
        }
        process.exit(1);
      }

      // Load config once for ideTarget and qmd_collection
      const config = await loadConfig(services.storage, root);
      const ideOverride = opts.ide as 'cursor' | 'claude' | undefined;
      if (ideOverride && ideOverride !== 'cursor' && ideOverride !== 'claude') {
        error(`Invalid IDE target: ${ideOverride}. Must be "cursor" or "claude".`);
        process.exit(1);
      }
      const ideTarget = ideOverride ?? config.ide_target ?? 'cursor';

      const packageRoot = getPackageRoot();
      const basePaths = getSourcePaths(packageRoot);
      const sourcePaths = {
        root: basePaths.root,
        skills: basePaths.skills,
        tools: basePaths.tools,
        rules: join(
          basePaths.rules,
          ideTarget === 'claude' ? 'claude-code' : 'cursor',
        ),
        integrations: basePaths.integrations,
        templates: basePaths.templates,
        profiles: basePaths.profiles,
        guide: basePaths.guide,
        updates: basePaths.updates,
      };

      const result = await services.workspace.update(root, { sourcePaths, ideTarget: ideOverride });

      // Run goal migration (converts quarter.md to individual goal files)
      let migrationResult;
      if (!opts.check) {
        const migrationService = new GoalMigrationService(services.storage);
        migrationResult = await migrationService.migrate(root);
      }

      // Auto-update qmd collections (skip for --check and --skip-qmd)
      let qmdResult;
      if (!opts.check && !opts.skipQmd) {
        // Prefer new qmd_collections; fall back to creating from scratch if only qmd_collection exists
        const existingCollections = config.qmd_collections;
        qmdResult = await ensureQmdCollections(root, existingCollections);
        // Persist collections to arete.yaml if any were created
        if (!qmdResult.skipped && Object.keys(qmdResult.collections).length > 0) {
          // Write qmd_collections (new, scoped)
          await services.workspace.updateManifestField(
            root,
            'qmd_collections',
            qmdResult.collections,
          );
          // Backward compat: write qmd_collection (singular) as the 'all' collection
          if (qmdResult.collections.all) {
            await services.workspace.updateManifestField(
              root,
              'qmd_collection',
              qmdResult.collections.all,
            );
          }
        }
      }

      if (opts.json) {
        // Compute backward-compat 'created' field: true if any scope was created
        const createdAny = qmdResult?.scopes?.some((s) => s.created) ?? false;
        console.log(
          JSON.stringify(
            {
              success: true,
              mode: opts.check ? 'check' : 'update',
              result,
              migration: migrationResult ?? { skipped: true },
              qmd: qmdResult
                ? { ...qmdResult, created: createdAny }
                : { skipped: true, available: false, collections: {}, indexed: false, created: false },
            },
            null,
            2,
          ),
        );
        return;
      }

      if (!opts.json) {
        header(opts.check ? 'Checking for Updates' : 'Updating Workspace');
        listItem('Added', result.added.length.toString());
        listItem('Updated', result.updated.length.toString());
        listItem('Preserved', result.preserved.length.toString());

        // Show goal migration result
        if (migrationResult?.migrated) {
          info(`Migrated ${migrationResult.goalsCount} goals to individual files. Backup saved to ${migrationResult.backupPath}`);
        }

        if (qmdResult && !qmdResult.skipped) {
          const createdCount = qmdResult.scopes.filter((s) => s.created).length;
          const totalCount = Object.keys(qmdResult.collections).length;
          if (createdCount > 0) {
            listItem(
              'Search index',
              `${createdCount} qmd collection${createdCount > 1 ? 's' : ''} created (${totalCount} total)`,
            );
          } else if (qmdResult.indexed && totalCount > 0) {
            listItem('Search index', `${totalCount} qmd collection${totalCount > 1 ? 's' : ''} updated`);
          }
          if (qmdResult.warning) {
            warn(qmdResult.warning);
          }
        }

        console.log('');
        success('Update complete!');
        console.log('');
      }
    });
}
