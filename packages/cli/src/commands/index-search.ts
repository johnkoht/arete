/**
 * arete index — re-index the qmd search collection
 */

import { createServices, loadConfig, refreshQmdIndex } from '@arete/core';
import type { Command } from 'commander';
import { listItem, success, info, warn, error } from '../formatters.js';

export function registerIndexSearchCommand(program: Command): void {
  program
    .command('index')
    .description(
      'Re-index the search collection. For full workspace update (rules, skills, assets), use `arete update`.',
    )
    .option('--status', 'Show search collection status without re-indexing')
    .action(async (opts: { status?: boolean }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      if (!root) {
        error('Not in an Areté workspace');
        info('Run "arete install" to create a workspace first');
        process.exit(1);
      }

      const config = await loadConfig(services.storage, root);

      if (opts.status) {
        if (config.qmd_collection) {
          listItem('Search collection', config.qmd_collection);
        } else {
          info('No collection configured — run `arete install` first');
        }
        return;
      }

      // Check collection before calling refreshQmdIndex
      if (!config.qmd_collection) {
        info('No collection configured — run `arete install` first');
        return;
      }

      const result = await refreshQmdIndex(root, config.qmd_collection);

      if (result.skipped) {
        // Collection is configured but qmd is not installed (or ARETE_SEARCH_FALLBACK set)
        info('qmd not installed — search index unavailable');
        return;
      }

      if (result.indexed) {
        success('Search index updated');
      } else if (result.warning) {
        warn(result.warning);
      }
    });
}
