/**
 * Areas commands — list, epics (Phase 7a AC4)
 *
 * The `arete areas` noun (plural, matches `arete people`) surfaces the
 * areas/<slug>.md layer for orchestrator consumers (Phase 8 reconciler)
 * and ad-hoc queries.
 *
 * Subcommand shape convention: `arete areas <noun-or-noun-phrase>`
 * (e.g., `list`, `epics`), not `arete areas <verb>`. Verbs go on
 * subcommand options. This keeps the namespace open for future area
 * work (focus, sync, refresh) without forcing awkward renaming.
 * Sanctioned exception: `check` — the report-only integrity diagnostic
 * (dangling `area:` refs, alias collisions). Diagnostics read as verbs
 * everywhere in the CLI ecosystem (`git fsck`, `npm audit`); forcing a
 * noun here would hurt discoverability more than it preserves symmetry.
 *
 * Future subcommand sketches (not implemented in 7a):
 *   - `arete areas show <slug>` — detailed view of one area
 *   - `arete areas focus` — surface area-focus suggestions
 *   - `arete areas sync` — re-derive recurring-meeting mappings
 *
 * All three fit `arete areas <noun>` without conflicting with `list` /
 * `epics`.
 */
import type { Command } from 'commander';
export declare function registerAreasCommands(program: Command): void;
//# sourceMappingURL=areas.d.ts.map