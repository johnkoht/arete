/**
 * arete index — re-index the qmd search collection
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServices, loadConfig, refreshQmdIndex } from '@arete/core';
import type { Command } from 'commander';
import { listItem, success, info, warn, error } from '../formatters.js';

const execFileAsync = promisify(execFile);
const QMD_STATUS_TIMEOUT_MS = 5_000;

/**
 * Parse vector count from qmd status output.
 * Looks for a line like "Vectors: 79 embedded" and returns the number.
 * Returns undefined if the line is not found or parsing fails.
 */
export function parseVectorCount(statusOutput: string): number | undefined {
  const match = statusOutput.match(/Vectors:\s*(\d+)\s*embedded/i);
  if (match?.[1]) {
    const count = parseInt(match[1], 10);
    return isNaN(count) ? undefined : count;
  }
  return undefined;
}

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

          // Try to get vector count from qmd status
          try {
            const { stdout } = await execFileAsync('qmd', ['status'], {
              timeout: QMD_STATUS_TIMEOUT_MS,
              cwd: root,
            });
            const vectorCount = parseVectorCount(stdout);
            if (vectorCount !== undefined) {
              listItem('Vectors', `${vectorCount} embedded`);
            }
          } catch {
            // qmd not installed or status failed — silently skip vector display
          }
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
        if (result.embedded) {
          success('Search index updated and embedded');
        } else {
          success('Search index updated');
        }
      } else if (result.warning) {
        warn(result.warning);
      }

      if (result.embedWarning) {
        warn(result.embedWarning);
      }
    });
}
