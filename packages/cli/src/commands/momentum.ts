/**
 * arete momentum — commitment and relationship momentum
 *
 * Shows commitment momentum (hot/stale/critical) and
 * relationship momentum (active/cooling/stale).
 */

import type { Command } from 'commander';
import { join } from 'node:path';
import chalk from 'chalk';
import { createServices, computeCommitmentMomentum, computeRelationshipMomentum } from '@arete/core';
import type {
  CommitmentMomentum,
  RelationshipMomentum,
  StorageAdapter,
  Commitment,
} from '@arete/core';
import { header, section } from '../formatters.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MomentumCommandDeps = {
  computeCommitmentMomentumFn?: (commitments: Commitment[]) => CommitmentMomentum;
  computeRelationshipMomentumFn?: (
    meetingsDir: string,
    peopleDir: string,
    storage: StorageAdapter,
    opts: { personSlug?: string },
  ) => Promise<RelationshipMomentum>;
};

// ---------------------------------------------------------------------------
// Core implementation (injectable for tests)
// ---------------------------------------------------------------------------

export async function runMomentum(
  opts: { json?: boolean; person?: string },
  deps: MomentumCommandDeps = {},
): Promise<void> {
  const {
    computeCommitmentMomentumFn = computeCommitmentMomentum,
    computeRelationshipMomentumFn = computeRelationshipMomentum,
  } = deps;

  const services = await createServices(process.cwd());
  const root = await services.workspace.findRoot();

  if (!root) {
    if (opts.json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      console.error(chalk.red('✗'), 'Not in an Areté workspace');
      console.log(chalk.blue('ℹ'), 'Navigate to your workspace directory and try again.');
    }
    process.exit(1);
  }

  const meetingsDir = join(root, 'resources', 'meetings');
  const peopleDir = join(root, 'people');

  // Load commitments and compute relationship momentum in parallel
  const [openCommitments, relationshipMomentum] = await Promise.all([
    services.commitments.listOpen(
      opts.person ? { personSlugs: [opts.person] } : undefined,
    ),
    computeRelationshipMomentumFn(meetingsDir, peopleDir, services.storage, {
      personSlug: opts.person,
    }),
  ]);

  const commitmentMomentum = computeCommitmentMomentumFn(openCommitments);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          success: true,
          commitments: {
            hot: commitmentMomentum.hot,
            stale: commitmentMomentum.stale,
            critical: commitmentMomentum.critical,
          },
          relationships: {
            active: relationshipMomentum.active,
            cooling: relationshipMomentum.cooling,
            stale: relationshipMomentum.stale,
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  // ── Human-readable output ─────────────────────────────────────────────────

  header('Momentum');
  if (opts.person) {
    console.log(chalk.dim(`  Filtered to person: ${opts.person}`));
    console.log('');
  }

  // ── Commitment Momentum ───────────────────────────────────────────────────
  console.log(chalk.bold('  Commitment Momentum'));
  console.log(chalk.dim('  ' + '─'.repeat(40)));

  const { hot, stale: staleC, critical } = commitmentMomentum;

  if (hot.length === 0 && staleC.length === 0 && critical.length === 0) {
    console.log(chalk.dim('  No open commitments'));
  } else {
    if (hot.length > 0) {
      console.log('');
      console.log(chalk.green('  🔥 Hot') + chalk.dim(` (${hot.length} — active last 7 days)`));
      for (const item of hot) {
        const dirStr =
          item.commitment.direction === 'i_owe_them'
            ? chalk.dim('→ ' + item.commitment.personName)
            : chalk.dim('← ' + item.commitment.personName);
        console.log(`    ${chalk.dim(item.ageDays + 'd')} ${item.commitment.text} ${dirStr}`);
      }
    }

    if (staleC.length > 0) {
      console.log('');
      console.log(chalk.yellow('  ⏳ Stale') + chalk.dim(` (${staleC.length} — 7–30 days open)`));
      for (const item of staleC) {
        const dirStr =
          item.commitment.direction === 'i_owe_them'
            ? chalk.dim('→ ' + item.commitment.personName)
            : chalk.dim('← ' + item.commitment.personName);
        console.log(`    ${chalk.yellow(item.ageDays + 'd')} ${item.commitment.text} ${dirStr}`);
      }
    }

    if (critical.length > 0) {
      console.log('');
      console.log(chalk.red('  🚨 Critical') + chalk.dim(` (${critical.length} — 30+ days open)`));
      for (const item of critical) {
        const dirStr =
          item.commitment.direction === 'i_owe_them'
            ? chalk.dim('→ ' + item.commitment.personName)
            : chalk.dim('← ' + item.commitment.personName);
        console.log(`    ${chalk.red(item.ageDays + 'd')} ${item.commitment.text} ${dirStr}`);
      }
    }
  }
  console.log('');

  // ── Relationship Momentum ─────────────────────────────────────────────────
  console.log(chalk.bold('  Relationship Momentum'));
  console.log(chalk.dim('  ' + '─'.repeat(40)));

  const { active, cooling, stale: staleR } = relationshipMomentum;

  if (active.length === 0 && cooling.length === 0 && staleR.length === 0) {
    console.log(chalk.dim('  No meeting data found'));
  } else {
    if (active.length > 0) {
      console.log('');
      console.log(chalk.green('  ✅ Active') + chalk.dim(` (${active.length} — met last 14 days)`));
      for (const r of active) {
        console.log(
          `    ${chalk.bold(r.personName)} ${chalk.dim('·')} last met ${r.lastMeetingDate} ${chalk.dim('·')} ${r.meetingCount} meeting${r.meetingCount === 1 ? '' : 's'}`,
        );
      }
    }

    if (cooling.length > 0) {
      console.log('');
      console.log(chalk.yellow('  ⚠ Cooling') + chalk.dim(` (${cooling.length} — 14–30 days)`));
      for (const r of cooling) {
        console.log(
          `    ${chalk.bold(r.personName)} ${chalk.dim('·')} last met ${r.lastMeetingDate} ${chalk.dim('·')} ${r.daysSinceMeeting}d ago`,
        );
      }
    }

    if (staleR.length > 0) {
      console.log('');
      console.log(chalk.red('  ❄ Stale') + chalk.dim(` (${staleR.length} — 30+ days)`));
      for (const r of staleR) {
        console.log(
          `    ${chalk.bold(r.personName)} ${chalk.dim('·')} last met ${r.lastMeetingDate} ${chalk.dim('·')} ${r.daysSinceMeeting}d ago`,
        );
      }
    }
  }
  console.log('');

  // Summary hint
  const totalCommitments = hot.length + staleC.length + critical.length;
  if (critical.length > 0) {
    console.log(
      chalk.red(`  ⚡ ${critical.length} critical commitment${critical.length === 1 ? '' : 's'} need attention.`),
    );
  }
  if (staleR.length > 0) {
    console.log(
      chalk.yellow(`  ⚡ ${staleR.length} relationship${staleR.length === 1 ? '' : 's'} drifting.`),
    );
  }
  if (totalCommitments === 0 && active.length > 0) {
    console.log(chalk.green('  ✓ Momentum looks healthy.'));
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerMomentumCommand(
  program: Command,
  deps: MomentumCommandDeps = {},
): void {
  program
    .command('momentum')
    .description('Show commitment and relationship momentum')
    .option('--person <slug>', 'Filter to a specific person by slug')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean; person?: string }) => {
      await runMomentum(opts, deps);
    });
}
