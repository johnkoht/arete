/**
 * Reconcile commands — CHR W2: mechanical R2 candidate nomination for the
 * reconcile-engine (dev/work/plans/chef-holistic-reconcile/engine-spec.md).
 *
 * `arete reconcile nominate --ledger <file.json>` is a deterministic
 * primitive: it loads the ledger FILE (a real day's ledger won't survive
 * argv — review F7), merges the lookback meeting batch, and runs the pure
 * `nominateCandidates` function. It makes NO judgment calls and NO writes —
 * the R3 judgment pass (agent, in-context) consumes its output.
 */

import {
  createServices,
  loadConfig,
  loadReconciliationContext,
  loadRecentMeetingBatch,
  nominateCandidates,
  ledgerEntriesFromBatch,
  type ReconcileLedger,
  type ReconcileLedgerEntry,
} from '@arete/core';
import type { Command } from 'commander';
import { join } from 'path';
import { error, info, success } from '../formatters.js';

export function registerReconcileCommands(program: Command): void {
  const reconcileCmd = program
    .command('reconcile')
    .description('Reconcile-engine primitives (CHR W2)');

  reconcileCmd
    .command('nominate')
    .description('Mechanical R2 candidate nomination over a ledger file (pure; no writes)')
    .requiredOption('--ledger <file>', 'Path to the ledger JSON file ({entries: [...]} or a bare entry array)')
    .option('--days <n>', 'Lookback window of recent meetings merged as context (default: 7; 0 disables)', '7')
    .option('--json', 'Output as JSON')
    .action(async (opts: { ledger: string; days?: string; json?: boolean }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      if (!root) {
        if (opts.json) console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        else error('Not in an Areté workspace');
        process.exit(1);
      }
      await loadConfig(services.storage, root);
      const paths = services.workspace.getPaths(root);

      // Load + shape-validate the ledger file.
      const raw = await services.storage.read(opts.ledger);
      if (raw === null) {
        const msg = `Ledger file not found: ${opts.ledger}`;
        if (opts.json) console.log(JSON.stringify({ success: false, error: msg }));
        else error(msg);
        process.exit(1);
      }
      let ledgerEntries: ReconcileLedgerEntry[];
      try {
        const parsed = JSON.parse(raw) as ReconcileLedger | ReconcileLedgerEntry[];
        ledgerEntries = Array.isArray(parsed) ? parsed : parsed.entries;
        if (!Array.isArray(ledgerEntries)) throw new Error('missing entries[]');
      } catch (err) {
        const msg = `Invalid ledger JSON (${err instanceof Error ? err.message : String(err)})`;
        if (opts.json) console.log(JSON.stringify({ success: false, error: msg }));
        else error(msg);
        process.exit(1);
        return; // unreachable; narrows ledgerEntries for TS
      }

      const days = parseInt(opts.days ?? '7', 10);

      // Lookback batch via the W2 loader (status filter processed|approved;
      // see loadRecentMeetingBatch's excludePath JSDoc for the strict-===
      // trap). paths.resources is already absolute — never join(root, ...).
      const meetingsDir = join(paths.resources, 'meetings');
      let batchEntries: ReconcileLedgerEntry[] = [];
      if (days > 0) {
        const batch = await loadRecentMeetingBatch(services.storage, meetingsDir, days);
        // Strict-=== set-membership guard (the excludePath generalization):
        // any meeting whose path appears as an extraction source_ref in the
        // ledger is the LEDGER's copy of that meeting — loading the on-disk
        // copy too would self-nominate every item against itself (the
        // LEARNINGS 2026-04-29 trap, ledger edition). Paths must match
        // exactly as storage.list emits them.
        const ledgerMeetingPaths = new Set(
          ledgerEntries.filter((e) => e.kind === 'extraction').map((e) => e.source_ref),
        );
        const filtered = batch.filter((b) => !ledgerMeetingPaths.has(b.meetingPath));
        // Oldest-first so first-occurrence-wins canonical placement matches
        // the inline path's [...recent, current] order.
        filtered.sort((a, b) => {
          const fa = a.meetingPath.split('/').pop() ?? '';
          const fb = b.meetingPath.split('/').pop() ?? '';
          return fa < fb ? -1 : fa > fb ? 1 : 0;
        });
        batchEntries = ledgerEntriesFromBatch(filtered);
      }

      const context = await loadReconciliationContext(services.storage, root);
      const result = nominateCandidates([...batchEntries, ...ledgerEntries], context);

      const out = {
        success: true,
        ledger: opts.ledger,
        windowDays: days,
        batchEntries: batchEntries.length,
        ledgerEntries: ledgerEntries.length,
        ...result,
      };
      if (opts.json) {
        console.log(JSON.stringify(out, null, 2));
        return;
      }
      success(`Nominated ${result.candidates.length} candidate(s) over ${out.batchEntries + out.ledgerEntries} entries`);
      info(
        `duplicates: ${result.stats.duplicatePairs} · uncertain-band: ${result.stats.uncertainBandPairs} · ` +
          `claims: ${result.stats.claims} · memory: ${result.stats.memoryMatches} · completed: ${result.stats.completedMatches}` +
          (result.degraded ? ' · DEGRADED (legacy-shaped input, tiers absent)' : ''),
      );
    });
}
