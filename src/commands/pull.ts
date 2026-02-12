/**
 * Pull command - fetch latest data from integrations
 */

import { findWorkspaceRoot, getWorkspacePaths } from '../core/workspace.js';
import { success, error, warn, info, header, listItem } from '../core/utils.js';
import { findIntegrationScript, runIntegrationScript, getIntegrationStatus } from '../core/scripts.js';
import { PULLABLE_INTEGRATIONS } from '../integrations/registry.js';
import { pullFathom, pullFathomById } from '../integrations/fathom/index.js';
import type { CommandOptions, ScriptableIntegration } from '../types.js';

export interface PullOptions extends CommandOptions {
  days?: number;
  id?: string;
}

/**
 * Pull command handler
 */
export async function pullCommand(integration: string | undefined, options: PullOptions): Promise<void> {
  const { days = 7, id: recordingId, json } = options;

  // Find workspace
  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
      info('Run "arete install" to create a workspace first');
    }
    process.exit(1);
  }

  const paths = getWorkspacePaths(workspaceRoot);

  // Determine which integrations to pull from
  let integrationsToPull: Array<ScriptableIntegration & { status: string }> = [];

  if (integration) {
    // Specific integration requested
    const int = PULLABLE_INTEGRATIONS[integration];
    if (!int) {
      if (json) {
        console.log(JSON.stringify({ success: false, error: `Unknown integration: ${integration}` }));
      } else {
        error(`Unknown integration: ${integration}`);
        info('Available: ' + Object.keys(PULLABLE_INTEGRATIONS).join(', '));
      }
      process.exit(1);
    }

    const status = getIntegrationStatus(paths, integration);
    if (status !== 'active') {
      if (json) {
        console.log(JSON.stringify({ success: false, error: `Integration not active: ${integration}` }));
      } else {
        error(`Integration not active: ${integration}`);
        info(`Run "arete integration add ${integration}" to configure it`);
      }
      process.exit(1);
    }

    integrationsToPull = [{ ...int, status }];
  } else {
    // Pull from all active integrations
    for (const [name, intConfig] of Object.entries(PULLABLE_INTEGRATIONS)) {
      const status = getIntegrationStatus(paths, name);
      if (status === 'active') {
        integrationsToPull.push({ ...intConfig, status });
      }
    }

    if (integrationsToPull.length === 0) {
      if (json) {
        console.log(JSON.stringify({
          success: false,
          error: 'No active integrations to pull from'
        }));
      } else {
        warn('No active integrations to pull from');
        info('Run "arete integration add <name>" to configure one');
      }
      process.exit(1);
    }
  }

  if (!json) {
    header('Pull Latest Data');
    listItem('Integrations', integrationsToPull.map(i => i.displayName).join(', '));
    listItem('Time range', `Last ${days} days`);
    console.log('');
  }

  // Run pull for each integration
  const results: Array<{ integration: string; success: boolean; days?: number; error?: string }> = [];

  for (const int of integrationsToPull) {
    if (!json) {
      info(`Pulling from ${int.displayName}...`);
    }

    // Fathom: native Node implementation (no Python script)
    if (int.name === 'fathom') {
      try {
        const result = recordingId
          ? await pullFathomById(recordingId, json ?? false)
          : await pullFathom(days, json ?? false);
        if (result.success) {
          results.push({ integration: int.name, success: true, days: recordingId ? undefined : days });
          if (!json) {
            const path = 'path' in result ? result.path : undefined;
            success(recordingId ? `Saved: ${path ?? 'recording'}` : `${int.displayName} pull complete!`);
          }
        } else {
          results.push({ integration: int.name, success: false, error: result.error ?? 'Unknown error' });
          if (!json) {
            error(`${int.displayName} pull failed: ${result.error ?? 'Unknown error'}`);
          }
        }
      } catch (err) {
        results.push({ integration: int.name, success: false, error: (err as Error).message });
        if (!json) {
          error(`${int.displayName} pull failed: ${(err as Error).message}`);
        }
      }
      continue;
    }

    const scriptPath = findIntegrationScript(int.name);
    if (!scriptPath) {
      results.push({ integration: int.name, success: false, error: 'Script not found' });
      if (!json) {
        error(`Script not found for ${int.name}`);
      }
      continue;
    }

    try {
      const args = [int.command || 'fetch', '--days', String(days)];
      if (json) args.push('--json');

      await runIntegrationScript(scriptPath, args, { quiet: json });

      results.push({ integration: int.name, success: true, days });
      if (!json) {
        success(`${int.displayName} pull complete!`);
      }
    } catch (err) {
      results.push({ integration: int.name, success: false, error: (err as Error).message });
      if (!json) {
        error(`${int.displayName} pull failed: ${(err as Error).message}`);
      }
    }
  }

  // Summary
  if (json) {
    console.log(JSON.stringify({
      success: results.every(r => r.success),
      results
    }, null, 2));
  } else {
    console.log('');
    const succeeded = results.filter(r => r.success).length;
    if (succeeded === results.length) {
      success('All integrations synced successfully');
    } else {
      warn(`${succeeded}/${results.length} integrations synced`);
    }
    console.log('');
  }
}

export default pullCommand;
