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
import type { Command } from 'commander';
export declare function registerReconcileCommands(program: Command): void;
//# sourceMappingURL=reconcile.d.ts.map